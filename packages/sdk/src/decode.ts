/**
 * Strict decode of on-chain accounts. Fail closed on discriminator / layout issues.
 */

import { PublicKey } from "@solana/web3.js";
import { bytesToHex } from "./digest.js";
import { DISC } from "./program.js";
import type {
  EndorsementState,
  VaultAnchorAccount,
  VaultStatusAccount,
} from "./types.js";

export class DecodeError extends Error {
  readonly code: "INVALID_ACCOUNT" | "UNSUPPORTED_ACCOUNT_VERSION";

  constructor(
    code: "INVALID_ACCOUNT" | "UNSUPPORTED_ACCOUNT_VERSION",
    message: string,
  ) {
    super(message);
    this.name = "DecodeError";
    this.code = code;
  }
}

function readPubkey(data: Buffer, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

function readU64LE(data: Buffer, offset: number): number {
  return Number(data.readBigUInt64LE(offset));
}

export function statusCodeToState(code: number): EndorsementState | null {
  switch (code) {
    case 0:
      return "active";
    case 1:
      return "revoked";
    case 2:
      return "superseded";
    case 3:
      return "disputed";
    default:
      return null;
  }
}

/**
 * Layout after disc (v2, no controller on anchor):
 * version u8, bump u8, issuer 32,
 * vault_digest 32, qev_schema_hash 32, content_ref_hash 32, parent_digest_claim 32,
 * created_slot u64, flags u16
 * = 8 + 2 + 32 + 128 + 8 + 2 = 178
 */
export function decodeVaultAnchor(
  data: Buffer,
  address: string,
): VaultAnchorAccount {
  const min = 8 + 2 + 32 + 32 * 4 + 8 + 2;
  if (data.length < min) {
    throw new DecodeError(
      "INVALID_ACCOUNT",
      `VaultAnchor account too short: ${data.length} bytes (need >= ${min})`,
    );
  }
  const disc = data.subarray(0, 8);
  if (!disc.equals(Buffer.from(DISC.vaultAnchor))) {
    throw new DecodeError(
      "INVALID_ACCOUNT",
      "VaultAnchor discriminator mismatch — not a QAL VaultAnchor account",
    );
  }
  let o = 8;
  const version = data.readUInt8(o);
  o += 1;
  if (version !== 2) {
    throw new DecodeError(
      "UNSUPPORTED_ACCOUNT_VERSION",
      `Unsupported VaultAnchor version ${version} (expected 2)`,
    );
  }
  const bump = data.readUInt8(o);
  o += 1;
  const issuer = readPubkey(data, o).toBase58();
  o += 32;
  const vault_digest = bytesToHex(data.subarray(o, o + 32));
  o += 32;
  const qev_schema_hash = bytesToHex(data.subarray(o, o + 32));
  o += 32;
  const content_ref_hash = bytesToHex(data.subarray(o, o + 32));
  o += 32;
  const parent_digest_claim = bytesToHex(data.subarray(o, o + 32));
  o += 32;
  const created_slot = readU64LE(data, o);
  o += 8;
  const flags = data.readUInt16LE(o);

  return {
    version,
    bump,
    issuer,
    vault_digest,
    qev_schema_hash,
    content_ref_hash,
    parent_digest_claim,
    created_slot,
    flags,
    address,
  };
}

/**
 * Layout after disc: anchor 32, controller 32, state u8, updated_slot u64, bump u8
 */
export function decodeVaultStatus(
  data: Buffer,
  address: string,
): VaultStatusAccount {
  const min = 8 + 32 + 32 + 1 + 8 + 1;
  if (data.length < min) {
    throw new DecodeError(
      "INVALID_ACCOUNT",
      `VaultStatus account too short: ${data.length} bytes`,
    );
  }
  const disc = data.subarray(0, 8);
  if (!disc.equals(Buffer.from(DISC.vaultStatus))) {
    throw new DecodeError(
      "INVALID_ACCOUNT",
      "VaultStatus discriminator mismatch — not a QAL VaultStatus account",
    );
  }
  let o = 8;
  const anchor = readPubkey(data, o).toBase58();
  o += 32;
  const controller = readPubkey(data, o).toBase58();
  o += 32;
  const state_code = data.readUInt8(o);
  o += 1;
  const state = statusCodeToState(state_code);
  if (state === null) {
    throw new DecodeError(
      "INVALID_ACCOUNT",
      `Unknown status code ${state_code} — fail closed`,
    );
  }
  const updated_slot = readU64LE(data, o);
  o += 8;
  const bump = data.readUInt8(o);

  return {
    anchor,
    controller,
    state,
    state_code,
    updated_slot,
    bump,
    address,
  };
}
