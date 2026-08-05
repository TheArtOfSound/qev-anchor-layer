/**
 * Fail-closed, receipt-directed verification (v0.1.2).
 *
 * Tiers performed are reported on every result:
 * - local_digest
 * - chain_accounts
 * - receipt_cross_check
 * - transaction_provenance (default on for receipt path)
 */

import { Connection, PublicKey } from "@solana/web3.js";
import {
  computeVaultDigest,
  DigestError,
  isZeroDigest,
  hexToBytes,
  schemaHash,
  bytesToHex,
  contentRefHash,
} from "./digest.js";
import {
  deriveAnchorPda,
  deriveStatusPda,
  fetchGenesisHash,
} from "./program.js";
import { decodeVaultAnchor, decodeVaultStatus, DecodeError } from "./decode.js";
import { parseReceipt, ReceiptError } from "./receipt.js";
import {
  getNetworkConfig,
  COMPROMISED_PROGRAM_ID,
  programIdForNetwork,
} from "./network.js";
import { verifyAnchorTransactionProvenance } from "./tx-verify.js";
import type {
  QalReceipt,
  ReceiptMismatch,
  SolanaNetwork,
  VerificationOutcome,
  VerificationResult,
  VerificationTier,
  VerifyOptions,
} from "./types.js";

function emptyTiers(partial?: Partial<VerificationTier>): VerificationTier {
  return {
    local_digest: partial?.local_digest ?? false,
    chain_accounts: partial?.chain_accounts ?? false,
    receipt_cross_check: partial?.receipt_cross_check ?? false,
    transaction_provenance: partial?.transaction_provenance ?? false,
  };
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
    successor_digest: partial.successor_digest ?? null,
    network,
    program_id: partial.program_id ?? null,
    official_program: partial.official_program ?? null,
    anchor_address: partial.anchor_address ?? null,
    status_address: partial.status_address ?? null,
    created_slot: partial.created_slot ?? null,
    content_ref_hash: partial.content_ref_hash ?? null,
    tiers: partial.tiers ?? emptyTiers(),
    mismatches: partial.mismatches,
    error: partial.error,
  };
}

function outcomeFromStatus(
  state: string,
  official: boolean,
): VerificationOutcome {
  if (!official) {
    // Custom deployments: still report custom validity for active path only
    // after full crypto match — labeled distinctly.
    return "VALID_CUSTOM_DEPLOYMENT";
  }
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
      return "INDETERMINATE_STATUS";
  }
}

function isZeroHex(hex: string): boolean {
  return isZeroDigest(hexToBytes(hex));
}

function addMismatch(
  list: ReceiptMismatch[],
  field: string,
  receipt: string,
  chain: string,
): void {
  if (receipt !== chain) {
    list.push({ field, receipt, chain });
  }
}

/**
 * Receipt-directed verification (correct model for DIGEST_MISMATCH + receipt lying).
 */
export async function verifyVaultWithReceipt(
  vault: unknown,
  receiptInput: QalReceipt | string,
  opts?: VerifyOptions,
): Promise<VerificationResult> {
  const allowCustom = opts?.allowCustomProgramId === true;
  const doTx = opts?.verifyTransaction !== false;

  let receipt: QalReceipt;
  try {
    const json =
      typeof receiptInput === "string"
        ? receiptInput
        : JSON.stringify(receiptInput);
    receipt = parseReceipt(json, { allowCustomProgramId: allowCustom });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof ReceiptError && msg.includes("not the official")) {
      return base(null, {
        outcome: "PROGRAM_ID_NOT_OFFICIAL",
        error: msg,
        tiers: emptyTiers(),
      });
    }
    return base(null, {
      outcome: "INVALID_RECEIPT",
      error: msg,
      tiers: emptyTiers(),
    });
  }

  if (receipt.program_id === COMPROMISED_PROGRAM_ID) {
    return base(receipt.network, {
      outcome: "INVALID_RECEIPT",
      error: "Compromised program ID refused",
      program_id: receipt.program_id,
      official_program: false,
      tiers: emptyTiers(),
    });
  }

  const officialId = programIdForNetwork(receipt.network);
  const isOfficial = receipt.program_id === officialId;
  if (!isOfficial && !allowCustom) {
    return base(receipt.network, {
      outcome: "PROGRAM_ID_NOT_OFFICIAL",
      error: `program_id ${receipt.program_id} !== official ${officialId}`,
      program_id: receipt.program_id,
      official_program: false,
      tiers: emptyTiers(),
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
        tiers: emptyTiers({ local_digest: false }),
      });
    }
    return base(receipt.network, {
      outcome: "MALFORMED_QEV",
      vault_valid: false,
      error: err instanceof Error ? err.message : String(err),
      tiers: emptyTiers(),
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
        tiers: emptyTiers({ local_digest: true }),
      });
    }
    if (receipt.genesis_hash && receipt.genesis_hash !== genesis) {
      return base(receipt.network, {
        outcome: "WRONG_NETWORK",
        vault_valid: true,
        digest: digestResult.digest,
        error: `receipt genesis_hash ${receipt.genesis_hash} != live ${genesis}`,
        tiers: emptyTiers({ local_digest: true }),
        mismatches: [
          {
            field: "genesis_hash",
            receipt: receipt.genesis_hash,
            chain: genesis,
          },
        ],
      });
    }
  } catch (err) {
    return base(receipt.network, {
      outcome: "RPC_UNAVAILABLE",
      vault_valid: true,
      digest: digestResult.digest,
      error: err instanceof Error ? err.message : String(err),
      tiers: emptyTiers({ local_digest: true }),
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
      tiers: emptyTiers({ local_digest: true }),
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
      official_program: isOfficial,
      tiers: emptyTiers({ local_digest: true, chain_accounts: true }),
    });
  }

  if (!anchorInfo.owner.equals(programId)) {
    return base(receipt.network, {
      outcome: "OWNER_MISMATCH",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      error: `account owner ${anchorInfo.owner.toBase58()} != program ${programId.toBase58()}`,
      tiers: emptyTiers({ local_digest: true, chain_accounts: true }),
    });
  }

  let anchor;
  try {
    anchor = decodeVaultAnchor(Buffer.from(anchorInfo.data), receipt.anchor_address);
  } catch (err) {
    const code = err instanceof DecodeError ? err.code : "INVALID_ACCOUNT";
    return base(receipt.network, {
      outcome: code,
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      error: err instanceof Error ? err.message : String(err),
      tiers: emptyTiers({ local_digest: true, chain_accounts: true }),
    });
  }

  // PDA must match stored issuer + stored digest
  const [expectedAnchorPda] = deriveAnchorPda(
    new PublicKey(anchor.issuer),
    hexToBytes(anchor.vault_digest),
    programId,
  );
  if (expectedAnchorPda.toBase58() !== receipt.anchor_address) {
    return base(receipt.network, {
      outcome: "PDA_MISMATCH",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      issuer: anchor.issuer,
      error: `anchor address is not PDA(issuer, stored_digest)`,
      tiers: emptyTiers({ local_digest: true, chain_accounts: true }),
    });
  }

  // Expected status PDA from chain issuer+digest
  const [expectedStatusPda] = deriveStatusPda(
    new PublicKey(anchor.issuer),
    hexToBytes(anchor.vault_digest),
    programId,
  );
  if (expectedStatusPda.toBase58() !== receipt.status_address) {
    return base(receipt.network, {
      outcome: "PDA_MISMATCH",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      issuer: anchor.issuer,
      error: `receipt.status_address ${receipt.status_address} != derived ${expectedStatusPda.toBase58()}`,
      tiers: emptyTiers({ local_digest: true, chain_accounts: true }),
      mismatches: [
        {
          field: "status_address",
          receipt: receipt.status_address,
          chain: expectedStatusPda.toBase58(),
        },
      ],
    });
  }

  // Cross-check receipt claims vs chain
  const mismatches: ReceiptMismatch[] = [];
  addMismatch(mismatches, "issuer", receipt.issuer, anchor.issuer);
  addMismatch(mismatches, "vault_digest", receipt.vault_digest, anchor.vault_digest);
  addMismatch(
    mismatches,
    "qev_schema_hash",
    receipt.qev_schema_hash,
    anchor.qev_schema_hash,
  );
  addMismatch(
    mismatches,
    "created_slot",
    String(receipt.created_slot),
    String(anchor.created_slot),
  );
  const receiptParent = receipt.parent_digest_claim ?? "0".repeat(64);
  const chainParent = isZeroHex(anchor.parent_digest_claim)
    ? "0".repeat(64)
    : anchor.parent_digest_claim;
  addMismatch(mismatches, "parent_digest_claim", receiptParent, chainParent);

  const receiptContentHash = receipt.content_reference
    ? bytesToHex(contentRefHash(receipt.content_reference))
    : "0".repeat(64);
  addMismatch(
    mismatches,
    "content_reference_hash",
    receiptContentHash,
    anchor.content_ref_hash,
  );

  // Schema string must hash to chain schema hash
  const localSchemaHash = bytesToHex(schemaHash(receipt.qev_schema));
  if (localSchemaHash !== anchor.qev_schema_hash) {
    mismatches.push({
      field: "qev_schema",
      receipt: receipt.qev_schema,
      chain: `schema_hash=${anchor.qev_schema_hash}`,
    });
  }

  if (mismatches.length > 0) {
    return base(receipt.network, {
      outcome: "RECEIPT_CHAIN_MISMATCH",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      issuer: anchor.issuer,
      program_id: receipt.program_id,
      official_program: isOfficial,
      anchor_address: anchor.address,
      status_address: receipt.status_address,
      created_slot: anchor.created_slot,
      mismatches,
      error: `${mismatches.length} receipt field(s) disagree with chain state`,
      tiers: emptyTiers({
        local_digest: true,
        chain_accounts: true,
        receipt_cross_check: true,
      }),
    });
  }

  const schemaMatch = digestResult.schemaHashHex === anchor.qev_schema_hash;
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
      official_program: isOfficial,
      error: `Local digest ${digestResult.digest} != on-chain ${anchor.vault_digest}`,
      tiers: emptyTiers({
        local_digest: true,
        chain_accounts: true,
        receipt_cross_check: true,
      }),
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
      official_program: isOfficial,
      error: "Local schema hash does not match on-chain qev_schema_hash",
      tiers: emptyTiers({
        local_digest: true,
        chain_accounts: true,
        receipt_cross_check: true,
      }),
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
      program_id: receipt.program_id,
      official_program: isOfficial,
      error: "Status account missing — INDETERMINATE (not active)",
      tiers: emptyTiers({
        local_digest: true,
        chain_accounts: true,
        receipt_cross_check: true,
      }),
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
      official_program: isOfficial,
      tiers: emptyTiers({
        local_digest: true,
        chain_accounts: true,
        receipt_cross_check: true,
      }),
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
      tiers: emptyTiers({
        local_digest: true,
        chain_accounts: true,
        receipt_cross_check: true,
      }),
    });
  }

  if (status.anchor !== receipt.anchor_address) {
    return base(receipt.network, {
      outcome: "INVALID_STATUS_RELATION",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      cryptographic_match: true,
      error: "status.anchor does not point at the verified VaultAnchor",
      tiers: emptyTiers({
        local_digest: true,
        chain_accounts: true,
        receipt_cross_check: true,
      }),
    });
  }

  // Controller receipt vs chain
  if (receipt.controller !== status.controller) {
    return base(receipt.network, {
      outcome: "RECEIPT_CHAIN_MISMATCH",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      cryptographic_match: true,
      mismatches: [
        {
          field: "controller",
          receipt: receipt.controller,
          chain: status.controller,
        },
      ],
      error: "receipt.controller disagrees with chain status.controller",
      tiers: emptyTiers({
        local_digest: true,
        chain_accounts: true,
        receipt_cross_check: true,
      }),
    });
  }

  // Transaction provenance tier
  let txTier = false;
  if (doTx) {
    const prov = await verifyAnchorTransactionProvenance(connection, {
      signature: receipt.transaction_signature,
      programId,
      issuer: new PublicKey(anchor.issuer),
      anchorAddress: anchorPk,
      vaultDigest: hexToBytes(anchor.vault_digest),
      expectedSlot: anchor.created_slot,
    });
    if (!prov.ok) {
      return base(receipt.network, {
        outcome: prov.outcome,
        vault_valid: true,
        digest: digestResult.digest,
        anchor_found: true,
        cryptographic_match: true,
        schema_hash_match: true,
        issuer: anchor.issuer,
        controller: status.controller,
        status: status.state,
        program_id: receipt.program_id,
        official_program: isOfficial,
        anchor_address: anchor.address,
        status_address: status.address,
        created_slot: anchor.created_slot,
        error: prov.error,
        tiers: emptyTiers({
          local_digest: true,
          chain_accounts: true,
          receipt_cross_check: true,
          transaction_provenance: true,
        }),
      });
    }
    txTier = true;
  }

  const outcome = outcomeFromStatus(status.state, isOfficial);

  return base(receipt.network, {
    outcome,
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
    successor_digest: isZeroHex(status.successor_digest)
      ? null
      : status.successor_digest,
    anchor_address: anchor.address,
    status_address: status.address,
    created_slot: anchor.created_slot,
    content_ref_hash: isZeroHex(anchor.content_ref_hash)
      ? null
      : anchor.content_ref_hash,
    program_id: receipt.program_id,
    official_program: isOfficial,
    tiers: emptyTiers({
      local_digest: true,
      chain_accounts: true,
      receipt_cross_check: true,
      transaction_provenance: txTier,
    }),
  });
}

/**
 * Issuer+digest verification without receipt (weaker — no DIGEST_MISMATCH path).
 * Prefer verifyVaultWithReceipt.
 */
export async function verifyVault(
  vault: unknown,
  opts: VerifyOptions & {
    network: SolanaNetwork;
    issuer?: string;
    receipt?: QalReceipt | string;
    programId?: PublicKey;
  },
): Promise<VerificationResult> {
  if (opts.receipt) {
    return verifyVaultWithReceipt(vault, opts.receipt, opts);
  }

  const network = opts.network;
  return base(network, {
    outcome: "INVALID_RECEIPT",
    vault_valid: false,
    error:
      "Receipt-directed verification is required. Pass a QAL receipt for DIGEST_MISMATCH and provenance checks.",
    tiers: emptyTiers(),
  });
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
    successor_digest: result.successor_digest,
    network: result.network,
    program_id: result.program_id,
    official_program: result.official_program,
    anchor_address: result.anchor_address,
    created_slot: result.created_slot,
    tiers: result.tiers,
    mismatches: result.mismatches ?? null,
    error: result.error ?? null,
  };
}

void ReceiptError;
