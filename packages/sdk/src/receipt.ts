import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import {
  QAL_PROTOCOL,
  QAL_PROTOCOL_VERSION,
  SUPPORTED_RECEIPT_VERSIONS,
  type QalReceipt,
  type SolanaNetwork,
} from "./types.js";
import { COMPROMISED_PROGRAM_ID, programIdForNetwork } from "./network.js";

export class ReceiptError extends Error {
  readonly code = "INVALID_RECEIPT" as const;
  constructor(message: string) {
    super(message);
    this.name = "ReceiptError";
  }
}

const SUPPORTED_NETWORKS = new Set<string>(["solana-localnet", "solana-devnet"]);

function requireString(obj: Record<string, unknown>, key: string): string {
  const v = obj[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new ReceiptError(`Receipt missing or invalid string field: ${key}`);
  }
  return v;
}

function requireHexDigest(value: string, field: string): string {
  const clean = value.startsWith("0x") ? value.slice(2) : value;
  if (!/^[0-9a-f]{64}$/.test(clean)) {
    throw new ReceiptError(
      `Receipt ${field} must be 64 lowercase hex chars, got: ${value}`,
    );
  }
  return clean;
}

function requirePubkey(value: string, field: string): string {
  try {
    return new PublicKey(value).toBase58();
  } catch {
    throw new ReceiptError(`Receipt ${field} is not a valid Base58 pubkey: ${value}`);
  }
}

/** Solana signatures are 64 bytes, base58-encoded. */
export function requireSolanaSignature(value: string, field = "transaction_signature"): string {
  if (typeof value !== "string" || value.length < 64 || value.length > 128) {
    throw new ReceiptError(`${field} is not a plausible Solana signature string`);
  }
  try {
    const bytes = bs58.decode(value);
    if (bytes.length !== 64) {
      throw new ReceiptError(`${field} must decode to 64 bytes, got ${bytes.length}`);
    }
  } catch (err) {
    if (err instanceof ReceiptError) throw err;
    throw new ReceiptError(`${field} is not valid base58: ${value.slice(0, 16)}…`);
  }
  return value;
}

export function buildReceipt(params: {
  network: SolanaNetwork;
  genesis_hash: string;
  program_id: string;
  anchor_address: string;
  status_address: string;
  issuer: string;
  controller: string;
  vault_digest: string;
  qev_schema: string;
  qev_schema_hash: string;
  content_reference: string | null;
  parent_digest_claim: string | null;
  transaction_signature: string;
  created_slot: number;
}): QalReceipt {
  return {
    protocol: QAL_PROTOCOL,
    protocol_version: QAL_PROTOCOL_VERSION,
    network: params.network,
    genesis_hash: params.genesis_hash,
    program_id: params.program_id,
    anchor_address: params.anchor_address,
    status_address: params.status_address,
    issuer: params.issuer,
    controller: params.controller,
    vault_digest: params.vault_digest,
    qev_schema: params.qev_schema,
    qev_schema_hash: params.qev_schema_hash,
    content_reference: params.content_reference,
    parent_digest_claim: params.parent_digest_claim,
    transaction_signature: params.transaction_signature,
    created_slot: params.created_slot,
  };
}

export function serializeReceipt(receipt: QalReceipt): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

/**
 * Strict receipt parse. Receipt is untrusted — always re-check chain.
 */
export function parseReceipt(
  json: string,
  options?: { allowCustomProgramId?: boolean },
): QalReceipt {
  let raw: unknown;
  try {
    raw = JSON.parse(json) as unknown;
  } catch {
    throw new ReceiptError("Receipt is not valid JSON");
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new ReceiptError("Receipt must be a JSON object");
  }
  const obj = raw as Record<string, unknown>;

  if (obj.protocol !== QAL_PROTOCOL) {
    throw new ReceiptError(`Not a QAL receipt (protocol=${String(obj.protocol)})`);
  }

  const protocol_version = requireString(obj, "protocol_version");
  if (!(SUPPORTED_RECEIPT_VERSIONS as readonly string[]).includes(protocol_version)) {
    throw new ReceiptError(
      `Unsupported receipt protocol_version ${protocol_version} (supported: ${SUPPORTED_RECEIPT_VERSIONS.join(", ")})`,
    );
  }

  const network = requireString(obj, "network");
  if (!SUPPORTED_NETWORKS.has(network)) {
    throw new ReceiptError(
      `Receipt network not allowed: ${network} (mainnet unsupported in pre-alpha)`,
    );
  }

  const program_id = requirePubkey(requireString(obj, "program_id"), "program_id");
  if (program_id === COMPROMISED_PROGRAM_ID) {
    throw new ReceiptError(
      "Receipt uses the compromised historical program ID — refuse verification",
    );
  }

  const official = programIdForNetwork(network as SolanaNetwork);
  if (!options?.allowCustomProgramId && program_id !== official) {
    throw new ReceiptError(
      `Receipt program_id ${program_id} is not the official QAL deployment ${official}. Pass allowCustomProgramId to verify custom deployments.`,
    );
  }

  const genesis_hash = requireString(obj, "genesis_hash");

  const vault_digest = requireHexDigest(
    requireString(obj, "vault_digest"),
    "vault_digest",
  );
  // Required for 0.1.2 — no zero default
  const qev_schema_hash = requireHexDigest(
    requireString(obj, "qev_schema_hash"),
    "qev_schema_hash",
  );

  const parentRaw = obj.parent_digest_claim ?? null;
  let parent_digest_claim: string | null = null;
  if (parentRaw !== null && parentRaw !== undefined) {
    if (typeof parentRaw !== "string") {
      throw new ReceiptError("parent_digest_claim must be string or null");
    }
    parent_digest_claim = requireHexDigest(parentRaw, "parent_digest_claim");
  }

  const created_slot = obj.created_slot;
  if (typeof created_slot !== "number" || !Number.isFinite(created_slot) || created_slot < 0) {
    throw new ReceiptError("Receipt created_slot must be a non-negative number");
  }

  const txSig = requireSolanaSignature(requireString(obj, "transaction_signature"));

  return {
    protocol: QAL_PROTOCOL,
    protocol_version,
    network: network as SolanaNetwork,
    genesis_hash,
    program_id,
    anchor_address: requirePubkey(requireString(obj, "anchor_address"), "anchor_address"),
    status_address: requirePubkey(requireString(obj, "status_address"), "status_address"),
    issuer: requirePubkey(requireString(obj, "issuer"), "issuer"),
    controller: requirePubkey(requireString(obj, "controller"), "controller"),
    vault_digest,
    qev_schema: requireString(obj, "qev_schema"),
    qev_schema_hash,
    content_reference:
      obj.content_reference === null || obj.content_reference === undefined
        ? null
        : requireString(obj as Record<string, unknown>, "content_reference"),
    parent_digest_claim,
    transaction_signature: txSig,
    created_slot,
  };
}
