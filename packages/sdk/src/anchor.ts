/**
 * Anchor a QEV vault digest to Solana.
 * Never sends plaintext, passwords, or keys on-chain.
 * No auto protocol-init race. No global writable counter.
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
  buildAnchorVaultIx,
  buildSetStatusIx,
  buildSupersedeVaultIx,
  programExists,
  assertNetwork,
  deriveAnchorPda,
  deriveStatusPda,
} from "./program.js";
import { decodeVaultAnchor, decodeVaultStatus } from "./decode.js";
import { buildReceipt } from "./receipt.js";
import { getNetworkConfig, programIdForNetwork } from "./network.js";
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
  return new Connection(
    opts.rpcUrl ?? getNetworkConfig(opts.network).defaultRpcUrl,
    "confirmed",
  );
}

export function describeAnchorPayload(
  params: AnchorVaultParams & { issuer: string },
): {
  vault_digest: string;
  qev_schema: string;
  qev_schema_hash: string;
  content_ref_hash: string;
  parent_digest_claim: string | null;
  flags: number;
  issuer: string;
  note: string;
} {
  const d = computeVaultDigest(params.vault);
  const refHash = contentRefHash(params.contentReference ?? null);
  const parent =
    params.parentDigestClaim && params.parentDigestClaim !== "0".repeat(64)
      ? hexToBytes(params.parentDigestClaim)
      : new Uint8Array(32);

  let flags = params.flags ?? 0;
  if (!isZeroDigest(refHash)) flags |= 1;
  if (!isZeroDigest(parent)) flags |= 2;

  return {
    vault_digest: d.digest,
    qev_schema: d.schema,
    qev_schema_hash: d.schemaHashHex,
    content_ref_hash: bytesToHex(refHash),
    parent_digest_claim: isZeroDigest(parent) ? null : bytesToHex(parent),
    flags,
    issuer: params.issuer,
    note:
      "On-chain payload is digests and pubkeys only. parent_digest_claim is an unverified claim unless set via atomic supersede_vault.",
  };
}

export async function anchorVault(
  params: AnchorVaultParams,
  signer: Keypair,
  opts: AnchorClientOptions,
): Promise<{ receipt: QalReceipt; signature: string; anchor: VaultAnchorAccount }> {
  const connection = createConnection(opts);
  const programId = opts.programId ?? new PublicKey(programIdForNetwork(opts.network));

  const genesis = await assertNetwork(connection, opts.network);

  const exists = await programExists(connection, programId);
  if (!exists) {
    throw new Error(
      `QAL program ${programId.toBase58()} not found on ${opts.network}. Deploy first (keypair is NOT in git).`,
    );
  }

  const d = computeVaultDigest(params.vault);
  const refHash = contentRefHash(params.contentReference ?? null);
  const parent = params.parentDigestClaim
    ? hexToBytes(params.parentDigestClaim)
    : new Uint8Array(32);

  let flags = params.flags ?? 0;
  // Only allowed client bits 0..1
  flags &= 0b11;
  if (!isZeroDigest(refHash)) flags |= 1;
  if (!isZeroDigest(parent)) flags |= 2;

  const [anchorPda] = deriveAnchorPda(signer.publicKey, d.digestBytes, programId);
  const existing = await connection.getAccountInfo(anchorPda);
  if (existing) {
    throw new Error(
      `Duplicate anchor: PDA ${anchorPda.toBase58()} already exists for this issuer+digest`,
    );
  }

  const ix = buildAnchorVaultIx({
    issuer: signer.publicKey,
    vaultDigest: d.digestBytes,
    qevSchemaHash: d.schemaHash,
    contentRefHash: refHash,
    parentDigestClaim: parent,
    flags,
    programId,
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
    commitment: "confirmed",
  });

  const anchorInfo = await connection.getAccountInfo(anchorPda, "confirmed");
  if (!anchorInfo) {
    throw new Error("Post-write verification failed: anchor account missing");
  }
  if (!anchorInfo.owner.equals(programId)) {
    throw new Error("Post-write verification failed: wrong account owner");
  }
  const anchor = decodeVaultAnchor(Buffer.from(anchorInfo.data), anchorPda.toBase58());
  if (anchor.vault_digest !== d.digest) {
    throw new Error(
      `Post-write digest mismatch: on-chain=${anchor.vault_digest} local=${d.digest}`,
    );
  }

  const [statusPda] = deriveStatusPda(signer.publicKey, d.digestBytes, programId);
  const statusInfo = await connection.getAccountInfo(statusPda, "confirmed");
  if (!statusInfo) {
    throw new Error("Post-write verification failed: status account missing");
  }
  const status = decodeVaultStatus(Buffer.from(statusInfo.data), statusPda.toBase58());

  const receipt = buildReceipt({
    network: opts.network,
    genesis_hash: genesis,
    program_id: programId.toBase58(),
    anchor_address: anchorPda.toBase58(),
    status_address: statusPda.toBase58(),
    issuer: signer.publicKey.toBase58(),
    controller: status.controller,
    vault_digest: d.digest,
    qev_schema: d.schema,
    qev_schema_hash: d.schemaHashHex,
    content_reference: params.contentReference ?? null,
    parent_digest_claim: isZeroDigest(parent) ? null : bytesToHex(parent),
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
  const programId = opts.programId ?? new PublicKey(programIdForNetwork(opts.network));
  await assertNetwork(connection, opts.network);

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

/**
 * Atomic supersede: one instruction creates new anchor and marks old superseded.
 */
export async function supersedeVault(
  params: {
    oldVault: unknown;
    newVault: unknown;
    /** Original issuer of the old vault (required; may differ from controller). */
    issuer: PublicKey;
    contentReference?: string | null;
  },
  controller: Keypair,
  opts: AnchorClientOptions,
): Promise<{
  receipt: QalReceipt;
  signature: string;
  oldDigest: string;
  newDigest: string;
  fullySuperseded: true;
}> {
  const connection = createConnection(opts);
  const programId = opts.programId ?? new PublicKey(programIdForNetwork(opts.network));
  const genesis = await assertNetwork(connection, opts.network);

  const oldD = computeVaultDigest(params.oldVault);
  const newD = computeVaultDigest(params.newVault);
  const refHash = contentRefHash(params.contentReference ?? null);
  let flags = 0;
  if (!isZeroDigest(refHash)) flags |= 1;

  const issuer = params.issuer;
  const [oldAnchorPda] = deriveAnchorPda(issuer, oldD.digestBytes, programId);
  const oldInfo = await connection.getAccountInfo(oldAnchorPda);
  if (!oldInfo) {
    throw new Error(`Old anchor not found at ${oldAnchorPda.toBase58()}`);
  }
  if (!oldInfo.owner.equals(programId)) {
    throw new Error("Old anchor OWNER_MISMATCH");
  }
  const oldDecoded = decodeVaultAnchor(Buffer.from(oldInfo.data), oldAnchorPda.toBase58());
  if (oldDecoded.issuer !== issuer.toBase58()) {
    throw new Error("Issuer mismatch on old anchor");
  }

  const ix = buildSupersedeVaultIx({
    controller: controller.publicKey,
    issuer,
    oldVaultDigest: oldD.digestBytes,
    newVaultDigest: newD.digestBytes,
    newQevSchemaHash: newD.schemaHash,
    newContentRefHash: refHash,
    newFlags: flags,
    programId,
  });

  const tx = new Transaction().add(ix);
  const signature = await sendAndConfirmTransaction(connection, tx, [controller], {
    commitment: "confirmed",
  });

  const [newAnchorPda] = deriveAnchorPda(issuer, newD.digestBytes, programId);
  const [newStatusPda] = deriveStatusPda(issuer, newD.digestBytes, programId);
  const [oldStatusPda] = deriveStatusPda(issuer, oldD.digestBytes, programId);

  const newInfo = await connection.getAccountInfo(newAnchorPda, "confirmed");
  if (!newInfo) throw new Error("Post-supersede: new anchor missing");
  const newAnchor = decodeVaultAnchor(Buffer.from(newInfo.data), newAnchorPda.toBase58());

  const oldStatusInfo = await connection.getAccountInfo(oldStatusPda, "confirmed");
  if (!oldStatusInfo) throw new Error("Post-supersede: old status missing");
  const oldStatus = decodeVaultStatus(
    Buffer.from(oldStatusInfo.data),
    oldStatusPda.toBase58(),
  );
  if (oldStatus.state !== "superseded") {
    throw new Error(
      `Post-supersede: old status is ${oldStatus.state}, expected superseded — atomic path failed`,
    );
  }

  const statusInfo = await connection.getAccountInfo(newStatusPda, "confirmed");
  if (!statusInfo) throw new Error("Post-supersede: new status missing");
  const newStatus = decodeVaultStatus(
    Buffer.from(statusInfo.data),
    newStatusPda.toBase58(),
  );

  const receipt = buildReceipt({
    network: opts.network,
    genesis_hash: genesis,
    program_id: programId.toBase58(),
    anchor_address: newAnchorPda.toBase58(),
    status_address: newStatusPda.toBase58(),
    issuer: issuer.toBase58(),
    controller: newStatus.controller,
    vault_digest: newD.digest,
    qev_schema: newD.schema,
    qev_schema_hash: newD.schemaHashHex,
    content_reference: params.contentReference ?? null,
    parent_digest_claim: oldD.digest,
    transaction_signature: signature,
    created_slot: newAnchor.created_slot,
  });

  return {
    receipt,
    signature,
    oldDigest: oldD.digest,
    newDigest: newD.digest,
    fullySuperseded: true,
  };
}

export async function fetchAnchorByAddress(
  address: string,
  opts: AnchorClientOptions,
): Promise<VaultAnchorAccount | null> {
  const connection = createConnection(opts);
  const programId = opts.programId ?? new PublicKey(programIdForNetwork(opts.network));
  const info = await connection.getAccountInfo(new PublicKey(address), "confirmed");
  if (!info) return null;
  if (!info.owner.equals(programId)) {
    throw new Error(`OWNER_MISMATCH: account not owned by QAL program`);
  }
  return decodeVaultAnchor(Buffer.from(info.data), address);
}

export async function fetchStatusByAddress(address: string, opts: AnchorClientOptions) {
  const connection = createConnection(opts);
  const programId = opts.programId ?? new PublicKey(programIdForNetwork(opts.network));
  const info = await connection.getAccountInfo(new PublicKey(address), "confirmed");
  if (!info) return null;
  if (!info.owner.equals(programId)) {
    throw new Error(`OWNER_MISMATCH: status account not owned by QAL program`);
  }
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
  const programId = opts.programId ?? new PublicKey(programIdForNetwork(opts.network));
  const connection = createConnection(opts);
  const [anchorPda] = deriveAnchorPda(issuer, vaultDigest, programId);
  const [statusPda] = deriveStatusPda(issuer, vaultDigest, programId);

  const [aInfo, sInfo] = await Promise.all([
    connection.getAccountInfo(anchorPda, "confirmed"),
    connection.getAccountInfo(statusPda, "confirmed"),
  ]);

  if (aInfo && !aInfo.owner.equals(programId)) {
    throw new Error("OWNER_MISMATCH on anchor PDA");
  }
  if (sInfo && !sInfo.owner.equals(programId)) {
    throw new Error("OWNER_MISMATCH on status PDA");
  }

  return {
    anchor: aInfo
      ? decodeVaultAnchor(Buffer.from(aInfo.data), anchorPda.toBase58())
      : null,
    status: sInfo
      ? decodeVaultStatus(Buffer.from(sInfo.data), statusPda.toBase58())
      : null,
    anchorAddress: anchorPda.toBase58(),
    statusAddress: statusPda.toBase58(),
  };
}
