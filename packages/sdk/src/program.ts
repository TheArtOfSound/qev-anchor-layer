/**
 * Program IDs, PDA derivation, and instruction builders for qal-anchor v2 layout.
 */

import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type Connection,
} from "@solana/web3.js";
import { createHash } from "node:crypto";
import { QAL_PROGRAM_ID_STRING } from "./network.js";
import type { SolanaNetwork } from "./types.js";
import { programIdForNetwork } from "./network.js";

export const QAL_PROGRAM_ID = new PublicKey(QAL_PROGRAM_ID_STRING);

export const QAL_SEED = Buffer.from("qal");
export const STATUS_SEED = Buffer.from("status");

function accountDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

function ixDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export const DISC = {
  vaultAnchor: accountDiscriminator("VaultAnchor"),
  vaultStatus: accountDiscriminator("VaultStatus"),
  anchorVault: ixDiscriminator("anchor_vault"),
  setStatus: ixDiscriminator("set_status"),
  transferController: ixDiscriminator("transfer_controller"),
  supersedeVault: ixDiscriminator("supersede_vault"),
} as const;

export function programIdPubkey(network?: SolanaNetwork): PublicKey {
  if (network) return new PublicKey(programIdForNetwork(network));
  return QAL_PROGRAM_ID;
}

export function deriveAnchorPda(
  issuer: PublicKey,
  vaultDigest: Uint8Array,
  programId: PublicKey = QAL_PROGRAM_ID,
): [PublicKey, number] {
  if (vaultDigest.length !== 32) throw new Error("vaultDigest must be 32 bytes");
  return PublicKey.findProgramAddressSync(
    [QAL_SEED, issuer.toBuffer(), Buffer.from(vaultDigest)],
    programId,
  );
}

export function deriveStatusPda(
  issuer: PublicKey,
  vaultDigest: Uint8Array,
  programId: PublicKey = QAL_PROGRAM_ID,
): [PublicKey, number] {
  if (vaultDigest.length !== 32) throw new Error("vaultDigest must be 32 bytes");
  return PublicKey.findProgramAddressSync(
    [QAL_SEED, STATUS_SEED, issuer.toBuffer(), Buffer.from(vaultDigest)],
    programId,
  );
}

function u16le(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

export function buildAnchorVaultIx(params: {
  issuer: PublicKey;
  vaultDigest: Uint8Array;
  qevSchemaHash: Uint8Array;
  contentRefHash: Uint8Array;
  parentDigestClaim: Uint8Array;
  flags: number;
  programId?: PublicKey;
}): TransactionInstruction {
  const programId = params.programId ?? QAL_PROGRAM_ID;
  const [vaultAnchor] = deriveAnchorPda(params.issuer, params.vaultDigest, programId);
  const [vaultStatus] = deriveStatusPda(params.issuer, params.vaultDigest, programId);

  const data = Buffer.concat([
    Buffer.from(DISC.anchorVault),
    Buffer.from(params.vaultDigest),
    Buffer.from(params.qevSchemaHash),
    Buffer.from(params.contentRefHash),
    Buffer.from(params.parentDigestClaim),
    u16le(params.flags),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.issuer, isSigner: true, isWritable: true },
      { pubkey: vaultAnchor, isSigner: false, isWritable: true },
      { pubkey: vaultStatus, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export function buildSetStatusIx(params: {
  controller: PublicKey;
  issuer: PublicKey;
  vaultDigest: Uint8Array;
  newState: number;
  programId?: PublicKey;
}): TransactionInstruction {
  const programId = params.programId ?? QAL_PROGRAM_ID;
  const [vaultAnchor] = deriveAnchorPda(params.issuer, params.vaultDigest, programId);
  const [vaultStatus] = deriveStatusPda(params.issuer, params.vaultDigest, programId);

  const data = Buffer.concat([
    Buffer.from(DISC.setStatus),
    Buffer.from([params.newState]),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.controller, isSigner: true, isWritable: false },
      { pubkey: vaultAnchor, isSigner: false, isWritable: false },
      { pubkey: vaultStatus, isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function buildTransferControllerIx(params: {
  controller: PublicKey;
  issuer: PublicKey;
  vaultDigest: Uint8Array;
  newController: PublicKey;
  programId?: PublicKey;
}): TransactionInstruction {
  const programId = params.programId ?? QAL_PROGRAM_ID;
  const [vaultAnchor] = deriveAnchorPda(params.issuer, params.vaultDigest, programId);
  const [vaultStatus] = deriveStatusPda(params.issuer, params.vaultDigest, programId);

  const data = Buffer.concat([
    Buffer.from(DISC.transferController),
    params.newController.toBuffer(),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.controller, isSigner: true, isWritable: false },
      { pubkey: vaultAnchor, isSigner: false, isWritable: false },
      { pubkey: vaultStatus, isSigner: false, isWritable: true },
    ],
    data,
  });
}

export function buildSupersedeVaultIx(params: {
  controller: PublicKey;
  issuer: PublicKey;
  oldVaultDigest: Uint8Array;
  newVaultDigest: Uint8Array;
  newQevSchemaHash: Uint8Array;
  newContentRefHash: Uint8Array;
  newFlags: number;
  programId?: PublicKey;
}): TransactionInstruction {
  const programId = params.programId ?? QAL_PROGRAM_ID;
  const [oldAnchor] = deriveAnchorPda(params.issuer, params.oldVaultDigest, programId);
  const [oldStatus] = deriveStatusPda(params.issuer, params.oldVaultDigest, programId);
  const [newAnchor] = deriveAnchorPda(params.issuer, params.newVaultDigest, programId);
  const [newStatus] = deriveStatusPda(params.issuer, params.newVaultDigest, programId);

  const data = Buffer.concat([
    Buffer.from(DISC.supersedeVault),
    Buffer.from(params.newVaultDigest),
    Buffer.from(params.newQevSchemaHash),
    Buffer.from(params.newContentRefHash),
    u16le(params.newFlags),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.controller, isSigner: true, isWritable: true },
      { pubkey: oldAnchor, isSigner: false, isWritable: false },
      { pubkey: oldStatus, isSigner: false, isWritable: true },
      { pubkey: newAnchor, isSigner: false, isWritable: true },
      { pubkey: newStatus, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data,
  });
}

export async function programExists(
  connection: Connection,
  programId: PublicKey = QAL_PROGRAM_ID,
): Promise<boolean> {
  const info = await connection.getAccountInfo(programId);
  return info !== null && info.executable;
}

export async function fetchGenesisHash(connection: Connection): Promise<string> {
  return connection.getGenesisHash();
}

export async function assertNetwork(
  connection: Connection,
  network: SolanaNetwork,
): Promise<string> {
  const { getNetworkConfig } = await import("./network.js");
  const cfg = getNetworkConfig(network);
  const genesis = await fetchGenesisHash(connection);
  if (cfg.expectedGenesisHash && genesis !== cfg.expectedGenesisHash) {
    throw new Error(
      `WRONG_NETWORK: expected genesis ${cfg.expectedGenesisHash} for ${network}, got ${genesis}`,
    );
  }
  return genesis;
}
