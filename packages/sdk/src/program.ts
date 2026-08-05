/**
 * Program IDs, PDA derivation, and instruction builders for qal-anchor.
 */

import {
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  type Connection,
} from "@solana/web3.js";
import type { SolanaNetwork } from "./types.js";

/** Deployed program id (localnet + devnet for v0.1 development). */
export const QAL_PROGRAM_ID = new PublicKey(
  "AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf",
);

export const QAL_SEED = Buffer.from("qal");
export const PROTOCOL_SEED = Buffer.from("protocol");
export const STATUS_SEED = Buffer.from("status");

/** Anchor account discriminator = first 8 bytes of sha256("account:Name") */
import { createHash } from "node:crypto";

function accountDiscriminator(name: string): Buffer {
  return createHash("sha256").update(`account:${name}`).digest().subarray(0, 8);
}

function ixDiscriminator(name: string): Buffer {
  // Anchor 0.29+/1.0: sha256("global:<ix_name>")[0..8]
  return createHash("sha256").update(`global:${name}`).digest().subarray(0, 8);
}

export const DISC = {
  protocolConfig: accountDiscriminator("ProtocolConfig"),
  vaultAnchor: accountDiscriminator("VaultAnchor"),
  vaultStatus: accountDiscriminator("VaultStatus"),
  initializeProtocol: ixDiscriminator("initialize_protocol"),
  anchorVault: ixDiscriminator("anchor_vault"),
  setStatus: ixDiscriminator("set_status"),
  transferController: ixDiscriminator("transfer_controller"),
} as const;

export function programIdForNetwork(_network: SolanaNetwork): PublicKey {
  return QAL_PROGRAM_ID;
}

export function deriveProtocolPda(programId: PublicKey = QAL_PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([QAL_SEED, PROTOCOL_SEED], programId);
}

export function deriveAnchorPda(
  issuer: PublicKey,
  vaultDigest: Uint8Array,
  programId: PublicKey = QAL_PROGRAM_ID,
): [PublicKey, number] {
  if (vaultDigest.length !== 32) {
    throw new Error("vaultDigest must be 32 bytes");
  }
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
  if (vaultDigest.length !== 32) {
    throw new Error("vaultDigest must be 32 bytes");
  }
  return PublicKey.findProgramAddressSync(
    [QAL_SEED, STATUS_SEED, issuer.toBuffer(), Buffer.from(vaultDigest)],
    programId,
  );
}

export function defaultRpcUrl(network: SolanaNetwork): string {
  switch (network) {
    case "solana-localnet":
      return "http://127.0.0.1:8899";
    case "solana-devnet":
      return process.env.QAL_RPC_URL ?? "https://api.devnet.solana.com";
    case "solana-mainnet-beta":
      return process.env.QAL_RPC_URL ?? "https://api.mainnet-beta.solana.com";
    default:
      return "https://api.devnet.solana.com";
  }
}

export function networkFromCli(flag: string | undefined): SolanaNetwork {
  const n = (flag ?? "devnet").toLowerCase();
  if (n === "localnet" || n === "solana-localnet" || n === "local") {
    return "solana-localnet";
  }
  if (n === "mainnet" || n === "mainnet-beta" || n === "solana-mainnet-beta") {
    return "solana-mainnet-beta";
  }
  return "solana-devnet";
}

function u16le(n: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(n);
  return b;
}

/**
 * Build initialize_protocol instruction.
 */
export function buildInitializeProtocolIx(
  authority: PublicKey,
  programId: PublicKey = QAL_PROGRAM_ID,
): TransactionInstruction {
  const [protocol] = deriveProtocolPda(programId);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: authority, isSigner: true, isWritable: true },
      { pubkey: protocol, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.from(DISC.initializeProtocol),
  });
}

/**
 * Build anchor_vault instruction data + accounts.
 */
export function buildAnchorVaultIx(params: {
  issuer: PublicKey;
  vaultDigest: Uint8Array;
  qevSchemaHash: Uint8Array;
  contentRefHash: Uint8Array;
  parentDigest: Uint8Array;
  flags: number;
  programId?: PublicKey;
}): TransactionInstruction {
  const programId = params.programId ?? QAL_PROGRAM_ID;
  const [protocol] = deriveProtocolPda(programId);
  const [vaultAnchor] = deriveAnchorPda(params.issuer, params.vaultDigest, programId);
  const [vaultStatus] = deriveStatusPda(params.issuer, params.vaultDigest, programId);

  const data = Buffer.concat([
    Buffer.from(DISC.anchorVault),
    Buffer.from(params.vaultDigest),
    Buffer.from(params.qevSchemaHash),
    Buffer.from(params.contentRefHash),
    Buffer.from(params.parentDigest),
    u16le(params.flags),
  ]);

  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: params.issuer, isSigner: true, isWritable: true },
      { pubkey: protocol, isSigner: false, isWritable: true },
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
      { pubkey: vaultAnchor, isSigner: false, isWritable: true },
      { pubkey: vaultStatus, isSigner: false, isWritable: true },
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
