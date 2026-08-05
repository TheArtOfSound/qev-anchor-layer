import { PublicKey } from "@solana/web3.js";
import {
  QAL_PROTOCOL,
  QAL_PROTOCOL_VERSION,
  type QalReceipt,
  type SolanaNetwork,
} from "./types.js";
import { COMPROMISED_PROGRAM_ID } from "./network.js";

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
    const pk = new PublicKey(value);
    return pk.toBase58();
  } catch {
    throw new ReceiptError(`Receipt ${field} is not a valid Base58 pubkey: ${value}`);
  }
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
 * Strict receipt parse. Receipt is untrusted convenience input — always re-check chain.
 */
export function parseReceipt(json: string): QalReceipt {
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
  if (!protocol_version.startsWith("0.1.")) {
    throw new ReceiptError(
      `Unsupported receipt protocol_version ${protocol_version}`,
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

  const genesis_hash =
    typeof obj.genesis_hash === "string" && obj.genesis_hash.length > 0
      ? obj.genesis_hash
      : "";
  if (!genesis_hash && network === "solana-devnet") {
    throw new ReceiptError("Receipt missing genesis_hash (required for devnet)");
  }

  const vault_digest = requireHexDigest(
    requireString(obj, "vault_digest"),
    "vault_digest",
  );
  const qev_schema_hash =
    typeof obj.qev_schema_hash === "string"
      ? requireHexDigest(obj.qev_schema_hash, "qev_schema_hash")
      : "0".repeat(64);

  const parentRaw =
    obj.parent_digest_claim ?? obj.parent_digest ?? null;
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
    transaction_signature: requireString(obj, "transaction_signature"),
    created_slot,
  };
}
