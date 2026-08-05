/**
 * Fail-closed verification.
 *
 * Preferred path: receipt-directed verification (fixed anchor address).
 * Issuer+digest PDA path is secondary and must still check owner/discriminator.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import {
  computeVaultDigest,
  DigestError,
  isZeroDigest,
  hexToBytes,
  schemaHash,
  bytesToHex,
} from "./digest.js";
import {
  QAL_PROGRAM_ID,
  deriveAnchorPda,
  deriveStatusPda,
  assertNetwork,
  fetchGenesisHash,
} from "./program.js";
import { decodeVaultAnchor, decodeVaultStatus, DecodeError } from "./decode.js";
import { parseReceipt, ReceiptError } from "./receipt.js";
import { getNetworkConfig, COMPROMISED_PROGRAM_ID } from "./network.js";
import type {
  QalReceipt,
  SolanaNetwork,
  VerificationOutcome,
  VerificationResult,
} from "./types.js";

export interface VerifyClientOptions {
  network: SolanaNetwork;
  rpcUrl?: string;
  connection?: Connection;
  programId?: PublicKey;
}

function createConnection(opts: VerifyClientOptions): Connection {
  if (opts.connection) return opts.connection;
  const url = opts.rpcUrl ?? getNetworkConfig(opts.network).defaultRpcUrl;
  return new Connection(url, "confirmed");
}

function base(
  network: SolanaNetwork | null,
  partial: Partial<VerificationResult> & { outcome: VerificationOutcome },
): VerificationResult {
  return {
    outcome: partial.outcome,
    vault_valid: partial.vault_valid ?? false,
    digest: partial.digest ?? null,
    anchor_found: partial.anchor_found ?? false,
    cryptographic_match: partial.cryptographic_match ?? false,
    schema_hash_match: partial.schema_hash_match ?? null,
    issuer: partial.issuer ?? null,
    controller: partial.controller ?? null,
    status: partial.status ?? null,
    parent_digest_claim: partial.parent_digest_claim ?? null,
    network,
    program_id: partial.program_id ?? null,
    anchor_address: partial.anchor_address ?? null,
    status_address: partial.status_address ?? null,
    created_slot: partial.created_slot ?? null,
    content_ref_hash: partial.content_ref_hash ?? null,
    error: partial.error,
  };
}

function outcomeFromStatus(state: string): VerificationOutcome {
  switch (state) {
    case "active":
      return "VALID_ACTIVE";
    case "revoked":
      return "VALID_REVOKED";
    case "superseded":
      return "VALID_SUPERSEDED";
    case "disputed":
      return "VALID_DISPUTED";
    default:
      // Fail closed — never map unknown → VALID_ACTIVE
      return "INDETERMINATE_STATUS";
  }
}

function isZeroHex(hex: string): boolean {
  return isZeroDigest(hexToBytes(hex));
}

/**
 * Receipt-directed verification (correct model for DIGEST_MISMATCH).
 */
export async function verifyVaultWithReceipt(
  vault: unknown,
  receiptInput: QalReceipt | string,
  opts?: { rpcUrl?: string; connection?: Connection },
): Promise<VerificationResult> {
  let receipt: QalReceipt;
  try {
    receipt =
      typeof receiptInput === "string" ? parseReceipt(receiptInput) : receiptInput;
    // re-validate object form
    if (typeof receiptInput !== "string") {
      receipt = parseReceipt(JSON.stringify(receiptInput));
    }
  } catch (err) {
    return base(null, {
      outcome: "INVALID_RECEIPT",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (receipt.program_id === COMPROMISED_PROGRAM_ID) {
    return base(receipt.network, {
      outcome: "INVALID_RECEIPT",
      error: "Compromised program ID refused",
      program_id: receipt.program_id,
    });
  }

  let digestResult;
  try {
    digestResult = computeVaultDigest(vault);
  } catch (err) {
    if (err instanceof DigestError) {
      return base(receipt.network, {
        outcome: err.code,
        vault_valid: false,
        error: err.message,
      });
    }
    return base(receipt.network, {
      outcome: "MALFORMED_QEV",
      vault_valid: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const programId = new PublicKey(receipt.program_id);
  let connection: Connection;
  try {
    connection =
      opts?.connection ??
      new Connection(
        opts?.rpcUrl ?? getNetworkConfig(receipt.network).defaultRpcUrl,
        "confirmed",
      );
    const genesis = await fetchGenesisHash(connection);
    const expected = getNetworkConfig(receipt.network).expectedGenesisHash;
    if (expected && genesis !== expected) {
      return base(receipt.network, {
        outcome: "WRONG_NETWORK",
        vault_valid: true,
        digest: digestResult.digest,
        error: `genesis mismatch: expected ${expected}, got ${genesis}`,
      });
    }
    if (receipt.genesis_hash && receipt.genesis_hash !== genesis) {
      return base(receipt.network, {
        outcome: "WRONG_NETWORK",
        vault_valid: true,
        digest: digestResult.digest,
        error: `receipt genesis_hash ${receipt.genesis_hash} != live ${genesis}`,
      });
    }
  } catch (err) {
    return base(receipt.network, {
      outcome: "RPC_UNAVAILABLE",
      vault_valid: true,
      digest: digestResult.digest,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const anchorPk = new PublicKey(receipt.anchor_address);
  const statusPk = new PublicKey(receipt.status_address);

  let anchorInfo;
  let statusInfo;
  try {
    [anchorInfo, statusInfo] = await Promise.all([
      connection.getAccountInfo(anchorPk, "confirmed"),
      connection.getAccountInfo(statusPk, "confirmed"),
    ]);
  } catch (err) {
    return base(receipt.network, {
      outcome: "RPC_UNAVAILABLE",
      vault_valid: true,
      digest: digestResult.digest,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!anchorInfo) {
    return base(receipt.network, {
      outcome: "ANCHOR_NOT_FOUND",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: false,
      anchor_address: receipt.anchor_address,
      status_address: receipt.status_address,
      program_id: receipt.program_id,
    });
  }

  if (!anchorInfo.owner.equals(programId)) {
    return base(receipt.network, {
      outcome: "OWNER_MISMATCH",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      anchor_address: receipt.anchor_address,
      program_id: receipt.program_id,
      error: `account owner ${anchorInfo.owner.toBase58()} != program ${programId.toBase58()}`,
    });
  }

  let anchor;
  try {
    anchor = decodeVaultAnchor(Buffer.from(anchorInfo.data), receipt.anchor_address);
  } catch (err) {
    const code =
      err instanceof DecodeError ? err.code : "INVALID_ACCOUNT";
    return base(receipt.network, {
      outcome: code,
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // PDA must match stored issuer + stored digest
  const [expectedPda] = deriveAnchorPda(
    new PublicKey(anchor.issuer),
    hexToBytes(anchor.vault_digest),
    programId,
  );
  if (expectedPda.toBase58() !== receipt.anchor_address) {
    return base(receipt.network, {
      outcome: "PDA_MISMATCH",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      issuer: anchor.issuer,
      error: `anchor address is not PDA(issuer, stored_digest)`,
    });
  }

  const schemaMatch =
    bytesToHex(schemaHash(digestResult.schema)) === anchor.qev_schema_hash &&
    digestResult.schemaHashHex === anchor.qev_schema_hash;

  const cryptoMatch = anchor.vault_digest === digestResult.digest;

  if (!cryptoMatch) {
    return base(receipt.network, {
      outcome: "DIGEST_MISMATCH",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      cryptographic_match: false,
      schema_hash_match: schemaMatch,
      issuer: anchor.issuer,
      parent_digest_claim: isZeroHex(anchor.parent_digest_claim)
        ? null
        : anchor.parent_digest_claim,
      anchor_address: anchor.address,
      status_address: receipt.status_address,
      created_slot: anchor.created_slot,
      content_ref_hash: isZeroHex(anchor.content_ref_hash)
        ? null
        : anchor.content_ref_hash,
      program_id: receipt.program_id,
      error: `Local digest ${digestResult.digest} != on-chain ${anchor.vault_digest}`,
    });
  }

  if (!schemaMatch) {
    return base(receipt.network, {
      outcome: "SCHEMA_HASH_MISMATCH",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      cryptographic_match: true,
      schema_hash_match: false,
      issuer: anchor.issuer,
      program_id: receipt.program_id,
      error: "Local schema hash does not match on-chain qev_schema_hash",
    });
  }

  if (!statusInfo) {
    return base(receipt.network, {
      outcome: "STATUS_NOT_FOUND",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      cryptographic_match: true,
      schema_hash_match: true,
      issuer: anchor.issuer,
      status: "indeterminate",
      parent_digest_claim: isZeroHex(anchor.parent_digest_claim)
        ? null
        : anchor.parent_digest_claim,
      anchor_address: anchor.address,
      status_address: receipt.status_address,
      created_slot: anchor.created_slot,
      program_id: receipt.program_id,
      error: "Status account missing — INDETERMINATE (not active)",
    });
  }

  if (!statusInfo.owner.equals(programId)) {
    return base(receipt.network, {
      outcome: "OWNER_MISMATCH",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      cryptographic_match: true,
      error: "Status account owner mismatch",
      program_id: receipt.program_id,
    });
  }

  let status;
  try {
    status = decodeVaultStatus(Buffer.from(statusInfo.data), receipt.status_address);
  } catch (err) {
    return base(receipt.network, {
      outcome: "INDETERMINATE_STATUS",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      cryptographic_match: true,
      schema_hash_match: true,
      issuer: anchor.issuer,
      status: "indeterminate",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (status.anchor !== receipt.anchor_address) {
    return base(receipt.network, {
      outcome: "INVALID_ACCOUNT",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      cryptographic_match: true,
      error: "status.anchor does not point at the verified VaultAnchor",
    });
  }

  return base(receipt.network, {
    outcome: outcomeFromStatus(status.state),
    vault_valid: true,
    digest: digestResult.digest,
    anchor_found: true,
    cryptographic_match: true,
    schema_hash_match: true,
    issuer: anchor.issuer,
    controller: status.controller,
    status: status.state,
    parent_digest_claim: isZeroHex(anchor.parent_digest_claim)
      ? null
      : anchor.parent_digest_claim,
    anchor_address: anchor.address,
    status_address: status.address,
    created_slot: anchor.created_slot,
    content_ref_hash: isZeroHex(anchor.content_ref_hash)
      ? null
      : anchor.content_ref_hash,
    program_id: receipt.program_id,
  });
}

/**
 * Issuer+digest verification. Prefer verifyVaultWithReceipt when a receipt exists.
 * Still fail-closed on missing status / bad owner / bad discriminator.
 */
export async function verifyVault(
  vault: unknown,
  opts: VerifyClientOptions & { issuer?: string; receipt?: QalReceipt | string },
): Promise<VerificationResult> {
  if (opts.receipt) {
    return verifyVaultWithReceipt(vault, opts.receipt, opts);
  }

  const network = opts.network;
  const programId = opts.programId ?? new PublicKey(getNetworkConfig(network).programId);

  let digestResult;
  try {
    digestResult = computeVaultDigest(vault);
  } catch (err) {
    if (err instanceof DigestError) {
      return base(network, { outcome: err.code, vault_valid: false, error: err.message });
    }
    return base(network, {
      outcome: "MALFORMED_QEV",
      vault_valid: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!opts.issuer) {
    return base(network, {
      outcome: "INVALID_RECEIPT",
      vault_valid: true,
      digest: digestResult.digest,
      error:
        "Receipt or --issuer required. Prefer receipt-directed verification for DIGEST_MISMATCH semantics.",
    });
  }

  let connection: Connection;
  try {
    connection = createConnection(opts);
    await assertNetwork(connection, network);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("WRONG_NETWORK")) {
      return base(network, {
        outcome: "WRONG_NETWORK",
        vault_valid: true,
        digest: digestResult.digest,
        error: msg,
      });
    }
    return base(network, {
      outcome: "RPC_UNAVAILABLE",
      vault_valid: true,
      digest: digestResult.digest,
      error: msg,
    });
  }

  const issuer = new PublicKey(opts.issuer);
  const [anchorPda] = deriveAnchorPda(issuer, digestResult.digestBytes, programId);
  const [statusPda] = deriveStatusPda(issuer, digestResult.digestBytes, programId);

  // Synthetic receipt path for the PDA-derived address (same fail-closed checks)
  const synthetic: QalReceipt = {
    protocol: "QAL",
    protocol_version: "0.1.1",
    network,
    genesis_hash: getNetworkConfig(network).expectedGenesisHash ?? "",
    program_id: programId.toBase58(),
    anchor_address: anchorPda.toBase58(),
    status_address: statusPda.toBase58(),
    issuer: issuer.toBase58(),
    controller: issuer.toBase58(),
    vault_digest: digestResult.digest,
    qev_schema: digestResult.schema,
    qev_schema_hash: digestResult.schemaHashHex,
    content_reference: null,
    parent_digest_claim: null,
    transaction_signature: "pda-lookup",
    created_slot: 0,
  };

  return verifyVaultWithReceipt(vault, synthetic, { connection });
}

export function toCliVerifyJson(result: VerificationResult): Record<string, unknown> {
  return {
    outcome: result.outcome,
    vault_valid: result.vault_valid,
    digest: result.digest,
    anchor_found: result.anchor_found,
    cryptographic_match: result.cryptographic_match,
    schema_hash_match: result.schema_hash_match,
    issuer: result.issuer,
    controller: result.controller,
    status: result.status,
    parent_digest_claim: result.parent_digest_claim,
    network: result.network,
    program_id: result.program_id,
    anchor_address: result.anchor_address,
    created_slot: result.created_slot,
    error: result.error ?? null,
  };
}

// re-export for typecheck unused import silence
void QAL_PROGRAM_ID;
void ReceiptError;
