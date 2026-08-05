/**
 * Independent verification: recompute local digest, read chain, compare.
 * Cryptographic match and endorsement state are reported separately.
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { computeVaultDigest, DigestError, isZeroDigest, hexToBytes } from "./digest.js";
import { createConnection, type AnchorClientOptions } from "./anchor.js";
import {
  QAL_PROGRAM_ID,
  deriveAnchorPda,
  deriveStatusPda,
} from "./program.js";
import { decodeVaultAnchor, decodeVaultStatus } from "./decode.js";
import type {
  SolanaNetwork,
  VerificationOutcome,
  VerificationResult,
} from "./types.js";

function baseResult(
  network: SolanaNetwork,
  partial: Partial<VerificationResult> & { outcome: VerificationOutcome },
): VerificationResult {
  return {
    outcome: partial.outcome,
    vault_valid: partial.vault_valid ?? false,
    digest: partial.digest ?? null,
    anchor_found: partial.anchor_found ?? false,
    cryptographic_match: partial.cryptographic_match ?? false,
    issuer: partial.issuer ?? null,
    controller: partial.controller ?? null,
    status: partial.status ?? null,
    parent_digest: partial.parent_digest ?? null,
    network,
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
      return "VALID_ACTIVE";
  }
}

export interface VerifyOptions extends AnchorClientOptions {
  /**
   * If set, only look up this issuer's PDA.
   * If omitted, `issuerHint` from receipt or explicit issuer is required for PDA derivation.
   */
  issuer?: string;
}

/**
 * Verify a local QEV vault against on-chain state.
 *
 * PDA seeds require the issuer pubkey. Pass `issuer` (from receipt or known wallet).
 */
export async function verifyVault(
  vault: unknown,
  opts: VerifyOptions,
): Promise<VerificationResult> {
  const network = opts.network;
  const programId = opts.programId ?? QAL_PROGRAM_ID;

  let digestResult;
  try {
    digestResult = computeVaultDigest(vault);
  } catch (err) {
    if (err instanceof DigestError) {
      return baseResult(network, {
        outcome: err.code,
        vault_valid: false,
        error: err.message,
      });
    }
    return baseResult(network, {
      outcome: "MALFORMED_QEV",
      vault_valid: false,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!opts.issuer) {
    return baseResult(network, {
      outcome: "ANCHOR_NOT_FOUND",
      vault_valid: true,
      digest: digestResult.digest,
      error:
        "Issuer public key required to derive anchor PDA. Pass --issuer or a receipt with issuer.",
    });
  }

  let connection: Connection;
  try {
    connection = createConnection(opts);
    await connection.getEpochInfo();
  } catch (err) {
    return baseResult(network, {
      outcome: "RPC_UNAVAILABLE",
      vault_valid: true,
      digest: digestResult.digest,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const issuer = new PublicKey(opts.issuer);
  const [anchorPda] = deriveAnchorPda(issuer, digestResult.digestBytes, programId);
  const [statusPda] = deriveStatusPda(issuer, digestResult.digestBytes, programId);

  let anchorInfo;
  let statusInfo;
  try {
    [anchorInfo, statusInfo] = await Promise.all([
      connection.getAccountInfo(anchorPda, "confirmed"),
      connection.getAccountInfo(statusPda, "confirmed"),
    ]);
  } catch (err) {
    return baseResult(network, {
      outcome: "RPC_UNAVAILABLE",
      vault_valid: true,
      digest: digestResult.digest,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  if (!anchorInfo) {
    return baseResult(network, {
      outcome: "ANCHOR_NOT_FOUND",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: false,
      cryptographic_match: false,
      anchor_address: anchorPda.toBase58(),
      status_address: statusPda.toBase58(),
    });
  }

  const anchor = decodeVaultAnchor(Buffer.from(anchorInfo.data), anchorPda.toBase58());
  const status = statusInfo
    ? decodeVaultStatus(Buffer.from(statusInfo.data), statusPda.toBase58())
    : null;

  const match = anchor.vault_digest === digestResult.digest;

  if (!match) {
    return baseResult(network, {
      outcome: "DIGEST_MISMATCH",
      vault_valid: true,
      digest: digestResult.digest,
      anchor_found: true,
      cryptographic_match: false,
      issuer: anchor.issuer,
      controller: anchor.controller,
      status: status?.state ?? null,
      parent_digest: isZeroHex(anchor.parent_digest) ? null : anchor.parent_digest,
      anchor_address: anchor.address,
      status_address: status?.address ?? statusPda.toBase58(),
      created_slot: anchor.created_slot,
      content_ref_hash: isZeroHex(anchor.content_ref_hash) ? null : anchor.content_ref_hash,
      error: `Local digest ${digestResult.digest} != on-chain ${anchor.vault_digest}`,
    });
  }

  const endorsement = status?.state ?? "active";
  return baseResult(network, {
    outcome: outcomeFromStatus(endorsement),
    vault_valid: true,
    digest: digestResult.digest,
    anchor_found: true,
    cryptographic_match: true,
    issuer: anchor.issuer,
    controller: status?.controller ?? anchor.controller,
    status: endorsement,
    parent_digest: isZeroHex(anchor.parent_digest) ? null : anchor.parent_digest,
    anchor_address: anchor.address,
    status_address: status?.address ?? statusPda.toBase58(),
    created_slot: anchor.created_slot,
    content_ref_hash: isZeroHex(anchor.content_ref_hash) ? null : anchor.content_ref_hash,
  });
}

function isZeroHex(hex: string): boolean {
  return isZeroDigest(hexToBytes(hex));
}

/**
 * CLI / machine-readable JSON shape from the handoff (subset fields required).
 */
export function toCliVerifyJson(result: VerificationResult): Record<string, unknown> {
  return {
    outcome: result.outcome,
    vault_valid: result.vault_valid,
    digest: result.digest,
    anchor_found: result.anchor_found,
    cryptographic_match: result.cryptographic_match,
    issuer: result.issuer,
    controller: result.controller,
    status: result.status,
    parent_digest: result.parent_digest,
    network: result.network,
    anchor_address: result.anchor_address,
    created_slot: result.created_slot,
    error: result.error ?? null,
  };
}
