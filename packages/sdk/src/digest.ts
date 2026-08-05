/**
 * Deterministic vault digest rules for QAL.
 *
 * Digest = SHA-256( UTF-8( canonicalJSON( vault ) ) )
 *
 * The full vault object is committed. Formatting, whitespace, and key order
 * must not affect the digest. See spec/DIGEST_RULES.md.
 */

import { createHash } from "node:crypto";
import {
  canonicalJSON,
  validateVaultSchemaV2,
} from "@bryan237l/qev-cli";
import { QEV_SCHEMA_V2 } from "./types.js";

export class DigestError extends Error {
  readonly code: "MALFORMED_QEV" | "UNSUPPORTED_QEV_SCHEMA";

  constructor(code: "MALFORMED_QEV" | "UNSUPPORTED_QEV_SCHEMA", message: string) {
    super(message);
    this.name = "DigestError";
    this.code = code;
  }
}

/**
 * SHA-256 of UTF-8 bytes, returned as lowercase hex (64 chars).
 */
export function sha256Hex(data: Uint8Array | string): string {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
  return createHash("sha256").update(buf).digest("hex");
}

/**
 * SHA-256 as a 32-byte Uint8Array.
 */
export function sha256Bytes(data: Uint8Array | string): Uint8Array {
  const buf = typeof data === "string" ? Buffer.from(data, "utf8") : Buffer.from(data);
  return new Uint8Array(createHash("sha256").update(buf).digest());
}

/**
 * SHA-256 of a QEV schema identifier string (e.g. BRY-NFET-SX-VAULT-V2).
 */
export function schemaHash(schema: string): Uint8Array {
  return sha256Bytes(schema);
}

/**
 * SHA-256 of a normalized content reference string, or zeros if null/empty.
 */
export function contentRefHash(reference: string | null | undefined): Uint8Array {
  if (!reference) {
    return new Uint8Array(32);
  }
  const normalized = reference.trim();
  if (normalized.length === 0) {
    return new Uint8Array(32);
  }
  return sha256Bytes(normalized);
}

/**
 * Parse hex digest (with optional 0x) to 32 bytes.
 */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (!/^[0-9a-fA-F]{64}$/.test(clean)) {
    throw new Error(`Invalid 32-byte hex digest: expected 64 hex chars, got ${clean.length}`);
  }
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

/**
 * 32-byte array to lowercase hex.
 */
export function bytesToHex(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("hex");
}

/**
 * True if all bytes are zero.
 */
export function isZeroDigest(bytes: Uint8Array): boolean {
  return bytes.every((b) => b === 0);
}

export interface VaultDigestResult {
  /** Lowercase hex SHA-256 of the full canonical vault. */
  digest: string;
  digestBytes: Uint8Array;
  /** Canonical JSON string that was hashed. */
  canonical: string;
  /** Vault schema string. */
  schema: string;
  schemaHash: Uint8Array;
  schemaHashHex: string;
}

/**
 * Validate a QEV vault and compute its QAL digest.
 *
 * Uses QEV's public `validateVaultSchemaV2` and `canonicalJSON`.
 * Does not silently strip unknown fields — the full object is committed.
 */
export function computeVaultDigest(vault: unknown): VaultDigestResult {
  if (vault === null || typeof vault !== "object" || Array.isArray(vault)) {
    throw new DigestError("MALFORMED_QEV", "Vault must be a non-null object");
  }

  const record = vault as Record<string, unknown>;
  const schema = record.schema;

  if (typeof schema !== "string") {
    throw new DigestError("MALFORMED_QEV", "Vault missing schema string");
  }

  if (schema !== QEV_SCHEMA_V2) {
    throw new DigestError(
      "UNSUPPORTED_QEV_SCHEMA",
      `Unsupported QEV schema: "${schema}" (expected ${QEV_SCHEMA_V2})`,
    );
  }

  try {
    validateVaultSchemaV2(vault);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("Unsupported vault schema")) {
      throw new DigestError("UNSUPPORTED_QEV_SCHEMA", message);
    }
    throw new DigestError("MALFORMED_QEV", message);
  }

  const canonical = canonicalJSON(vault);
  if (typeof canonical !== "string" || canonical.length === 0) {
    throw new DigestError("MALFORMED_QEV", "canonicalJSON returned empty result");
  }

  const digestBytes = sha256Bytes(canonical);
  const sHash = schemaHash(schema);

  return {
    digest: bytesToHex(digestBytes),
    digestBytes,
    canonical,
    schema,
    schemaHash: sHash,
    schemaHashHex: bytesToHex(sHash),
  };
}

/**
 * Browser-safe SHA-256 (Web Crypto). Use in the verifier app.
 * Node path prefers node:crypto via sha256Bytes for consistency in tests.
 */
export async function sha256HexWeb(data: Uint8Array | string): Promise<string> {
  const bytes =
    typeof data === "string" ? new TextEncoder().encode(data) : data;
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
