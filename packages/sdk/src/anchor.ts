/**
 * Anchor a QEV vault digest to Solana.
 * Never sends plaintext, passwords, or keys on-chain.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import {
  computeVaultDigest,
  contentRefHash,
  hexToBytes,
  isZeroDigest,
  bytesToHex,
} from "./digest.js";
import {
  QAL_PROGRAM_ID,
  buildAnchorVaultIx,
  buildInitializeProtocolIx,
  buildSetStatusIx,
  defaultRpcUrl,
  deriveAnchorPda,
  deriveProtocolPda,
  deriveStatusPda,
  programExists,
} from "./program.js";
import { decodeVaultAnchor, decodeVaultStatus } from "./decode.js";
import { buildReceipt } from "./receipt.js";
import type {
  AnchorVaultParams,
  QalReceipt,
  SolanaNetwork,
  VaultAnchorAccount,
} from "./types.js";
import { STATUS_CODES } from "./types.js";

export interface AnchorClientOptions {
  network: SolanaNetwork;
  rpcUrl?: string;
  connection?: Connection;
  programId?: PublicKey;
}

export function createConnection(opts: AnchorClientOptions): Connection {
  if (opts.connection) return opts.connection;
  return new Connection(opts.rpcUrl ?? defaultRpcUrl(opts.network), "confirmed");
}

export async function ensureProtocolInitialized(
  connection: Connection,
  payer: Keypair,
  programId: PublicKey = QAL_PROGRAM_ID,
): Promise<string | null> {
  const [protocol] = deriveProtocolPda(programId);
  const info = await connection.getAccountInfo(protocol);
  if (info) return null;

  const ix = buildInitializeProtocolIx(payer.publicKey, programId);
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection, tx, [payer], {
    commitment: "confirmed",
  });
  return sig;
}

/**
 * Public metadata that will be submitted on-chain (for CLI preflight display).
 */
export function describeAnchorPayload(params: AnchorVaultParams & { issuer: string }): {
  vault_digest: string;
  qev_schema: string;
  qev_schema_hash: string;
  content_ref_hash: string;
  parent_digest: string | null;
  flags: number;
  issuer: string;
  note: string;
} {
  const d = computeVaultDigest(params.vault);
  const refHash = contentRefHash(params.contentReference ?? null);
  const parent =
    params.parentDigest && params.parentDigest !== "0".repeat(64)
      ? hexToBytes(params.parentDigest)
      : new Uint8Array(32);

  let flags = params.flags ?? 0;
  if (!isZeroDigest(refHash)) flags |= 1;
  if (!isZeroDigest(parent)) flags |= 2;

  return {
    vault_digest: d.digest,
    qev_schema: d.schema,
    qev_schema_hash: d.schemaHashHex,
    content_ref_hash: bytesToHex(refHash),
    parent_digest: isZeroDigest(parent) ? null : bytesToHex(parent),
    flags,
    issuer: params.issuer,
    note:
      "On-chain payload is digests and pubkeys only. No plaintext, password, or keys are transmitted.",
  };
}

export async function anchorVault(
  params: AnchorVaultParams,
  signer: Keypair,
  opts: AnchorClientOptions,
): Promise<{ receipt: QalReceipt; signature: string; anchor: VaultAnchorAccount }> {
  const connection = createConnection(opts);
  const programId = opts.programId ?? QAL_PROGRAM_ID;

  const exists = await programExists(connection, programId);
  if (!exists) {
    throw new Error(
      `QAL program ${programId.toBase58()} not found on ${opts.network}. Deploy with anchor deploy first.`,
    );
  }

  await ensureProtocolInitialized(connection, signer, programId);

  const d = computeVaultDigest(params.vault);
  const refHash = contentRefHash(params.contentReference ?? null);
  const parent = params.parentDigest
    ? hexToBytes(params.parentDigest)
    : new Uint8Array(32);

  let flags = params.flags ?? 0;
  if (!isZeroDigest(refHash)) flags |= 1;
  if (!isZeroDigest(parent)) flags |= 2;

  const [anchorPda] = deriveAnchorPda(signer.publicKey, d.digestBytes, programId);
  const existing = await connection.getAccountInfo(anchorPda);
  if (existing) {
    throw new Error(`Duplicate anchor: PDA ${anchorPda.toBase58()} already exists for this issuer+digest`);
  }

  const ix = buildAnchorVaultIx({
    issuer: signer.publicKey,
    vaultDigest: d.digestBytes,
    qevSchemaHash: d.schemaHash,
    contentRefHash: refHash,
    parentDigest: parent,
    flags,
    programId,
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
    commitment: "confirmed",
  });

  // Post-write verification: re-read account and confirm digest.
  const anchorInfo = await connection.getAccountInfo(anchorPda, "confirmed");
  if (!anchorInfo) {
    throw new Error("Post-write verification failed: anchor account missing after confirmation");
  }
  const anchor = decodeVaultAnchor(Buffer.from(anchorInfo.data), anchorPda.toBase58());
  if (anchor.vault_digest !== d.digest) {
    throw new Error(
      `Post-write digest mismatch: on-chain=${anchor.vault_digest} local=${d.digest}`,
    );
  }
  if (anchor.issuer !== signer.publicKey.toBase58()) {
    throw new Error("Post-write issuer mismatch");
  }

  const [statusPda] = deriveStatusPda(signer.publicKey, d.digestBytes, programId);

  const receipt = buildReceipt({
    network: opts.network,
    program_id: programId.toBase58(),
    anchor_address: anchorPda.toBase58(),
    status_address: statusPda.toBase58(),
    issuer: signer.publicKey.toBase58(),
    controller: anchor.controller,
    vault_digest: d.digest,
    qev_schema: d.schema,
    content_reference: params.contentReference ?? null,
    parent_digest: isZeroDigest(parent) ? null : bytesToHex(parent),
    transaction_signature: signature,
    created_slot: anchor.created_slot,
  });

  return { receipt, signature, anchor };
}

export async function setStatus(
  params: {
    issuer: PublicKey;
    vaultDigest: Uint8Array;
    newState: number;
  },
  controller: Keypair,
  opts: AnchorClientOptions,
): Promise<string> {
  const connection = createConnection(opts);
  const programId = opts.programId ?? QAL_PROGRAM_ID;

  if (![0, 1, 2, 3].includes(params.newState)) {
    throw new Error(`Invalid status code: ${params.newState}`);
  }

  const ix = buildSetStatusIx({
    controller: controller.publicKey,
    issuer: params.issuer,
    vaultDigest: params.vaultDigest,
    newState: params.newState,
    programId,
  });

  const tx = new Transaction().add(ix);
  return sendAndConfirmTransaction(connection, tx, [controller], {
    commitment: "confirmed",
  });
}

export async function revokeAnchor(
  issuer: PublicKey,
  vaultDigest: Uint8Array,
  controller: Keypair,
  opts: AnchorClientOptions,
): Promise<string> {
  return setStatus(
    { issuer, vaultDigest, newState: STATUS_CODES.revoked },
    controller,
    opts,
  );
}

export async function fetchAnchorByAddress(
  address: string,
  opts: AnchorClientOptions,
): Promise<VaultAnchorAccount | null> {
  const connection = createConnection(opts);
  const info = await connection.getAccountInfo(new PublicKey(address), "confirmed");
  if (!info) return null;
  return decodeVaultAnchor(Buffer.from(info.data), address);
}

export async function fetchStatusByAddress(
  address: string,
  opts: AnchorClientOptions,
) {
  const connection = createConnection(opts);
  const info = await connection.getAccountInfo(new PublicKey(address), "confirmed");
  if (!info) return null;
  return decodeVaultStatus(Buffer.from(info.data), address);
}

export async function fetchAnchorForIssuerDigest(
  issuer: PublicKey,
  vaultDigest: Uint8Array,
  opts: AnchorClientOptions,
): Promise<{
  anchor: VaultAnchorAccount | null;
  status: ReturnType<typeof decodeVaultStatus> | null;
  anchorAddress: string;
  statusAddress: string;
}> {
  const programId = opts.programId ?? QAL_PROGRAM_ID;
  const connection = createConnection(opts);
  const [anchorPda] = deriveAnchorPda(issuer, vaultDigest, programId);
  const [statusPda] = deriveStatusPda(issuer, vaultDigest, programId);

  const [aInfo, sInfo] = await Promise.all([
    connection.getAccountInfo(anchorPda, "confirmed"),
    connection.getAccountInfo(statusPda, "confirmed"),
  ]);

  return {
    anchor: aInfo ? decodeVaultAnchor(Buffer.from(aInfo.data), anchorPda.toBase58()) : null,
    status: sInfo ? decodeVaultStatus(Buffer.from(sInfo.data), statusPda.toBase58()) : null,
    anchorAddress: anchorPda.toBase58(),
    statusAddress: statusPda.toBase58(),
  };
}
