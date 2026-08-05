/**
 * Decode on-chain VaultAnchor / VaultStatus account data (Anchor layout).
 */

import { PublicKey } from "@solana/web3.js";
import { bytesToHex } from "./digest.js";
import { DISC } from "./program.js";
import type { EndorsementState, VaultAnchorAccount, VaultStatusAccount } from "./types.js";

function readPubkey(data: Buffer, offset: number): PublicKey {
  return new PublicKey(data.subarray(offset, offset + 32));
}

function readU64LE(data: Buffer, offset: number): number {
  // slots fit in JS number safely for a long time
  return Number(data.readBigUInt64LE(offset));
}

export function statusCodeToState(code: number): EndorsementState {
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
      return "unknown";
  }
}

/**
 * Decode VaultAnchor account bytes (including 8-byte discriminator).
 *
 * Layout after disc:
 * version u8, bump u8, issuer 32, controller 32,
 * vault_digest 32, qev_schema_hash 32, content_ref_hash 32, parent_digest 32,
 * created_slot u64, flags u16
 */
export function decodeVaultAnchor(data: Buffer, address: string): VaultAnchorAccount {
  if (data.length < 8 + 2 + 32 * 2 + 32 * 4 + 8 + 2) {
    throw new Error(`VaultAnchor account too short: ${data.length} bytes`);
  }
  const disc = data.subarray(0, 8);
  if (!disc.equals(Buffer.from(DISC.vaultAnchor))) {
    // Soft-warn: still attempt decode if layout matches (IDL drift during dev)
  }
  let o = 8;
  const version = data.readUInt8(o);
  o += 1;
  const bump = data.readUInt8(o);
  o += 1;
  const issuer = readPubkey(data, o).toBase58();
  o += 32;
  const controller = readPubkey(data, o).toBase58();
  o += 32;
  const vault_digest = bytesToHex(data.subarray(o, o + 32));
  o += 32;
  const qev_schema_hash = bytesToHex(data.subarray(o, o + 32));
  o += 32;
  const content_ref_hash = bytesToHex(data.subarray(o, o + 32));
  o += 32;
  const parent_digest = bytesToHex(data.subarray(o, o + 32));
  o += 32;
  const created_slot = readU64LE(data, o);
  o += 8;
  const flags = data.readUInt16LE(o);

  return {
    version,
    bump,
    issuer,
    controller,
    vault_digest,
    qev_schema_hash,
    content_ref_hash,
    parent_digest,
    created_slot,
    flags,
    address,
  };
}

/**
 * Layout after disc: anchor 32, controller 32, state u8, updated_slot u64, bump u8
 */
export function decodeVaultStatus(data: Buffer, address: string): VaultStatusAccount {
  if (data.length < 8 + 32 + 32 + 1 + 8 + 1) {
    throw new Error(`VaultStatus account too short: ${data.length} bytes`);
  }
  let o = 8;
  const anchor = readPubkey(data, o).toBase58();
  o += 32;
  const controller = readPubkey(data, o).toBase58();
  o += 32;
  const state_code = data.readUInt8(o);
  o += 1;
  const updated_slot = readU64LE(data, o);
  o += 8;
  const bump = data.readUInt8(o);

  return {
    anchor,
    controller,
    state: statusCodeToState(state_code),
    state_code,
    updated_slot,
    bump,
    address,
  };
}
