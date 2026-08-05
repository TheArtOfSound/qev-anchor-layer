/** QAL protocol constants and shared types. */

export const QAL_PROTOCOL = "QAL" as const;
export const QAL_PROTOCOL_VERSION = "0.1.0" as const;

/** Supported QEV schema for digests in v0.1. */
export const QEV_SCHEMA_V2 = "BRY-NFET-SX-VAULT-V2" as const;

export type SolanaNetwork = "solana-localnet" | "solana-devnet" | "solana-mainnet-beta";

export type EndorsementState = "active" | "revoked" | "superseded" | "disputed" | "unknown";

export const STATUS_CODES = {
  active: 0,
  revoked: 1,
  superseded: 2,
  disputed: 3,
} as const;

export type StatusCode = (typeof STATUS_CODES)[keyof typeof STATUS_CODES];

/**
 * Structured verification outcomes. Distinct so callers never collapse
 * cryptographic match with endorsement state.
 */
export type VerificationOutcome =
  | "VALID_ACTIVE"
  | "VALID_REVOKED"
  | "VALID_SUPERSEDED"
  | "VALID_DISPUTED"
  | "DIGEST_MISMATCH"
  | "ANCHOR_NOT_FOUND"
  | "MALFORMED_QEV"
  | "UNSUPPORTED_QEV_SCHEMA"
  | "RPC_UNAVAILABLE"
  | "WRONG_NETWORK";

export interface QevVaultV2 {
  schema: string;
  version: string;
  created_at: string;
  mode: string;
  kdf: Record<string, unknown>;
  wrap: Record<string, unknown>;
  content: Record<string, unknown>;
  [key: string]: unknown;
}

export interface QalReceipt {
  protocol: typeof QAL_PROTOCOL;
  protocol_version: typeof QAL_PROTOCOL_VERSION;
  network: SolanaNetwork;
  program_id: string;
  anchor_address: string;
  status_address: string;
  issuer: string;
  controller: string;
  vault_digest: string;
  qev_schema: string;
  content_reference: string | null;
  parent_digest: string | null;
  transaction_signature: string;
  created_slot: number;
}

export interface VerificationResult {
  outcome: VerificationOutcome;
  vault_valid: boolean;
  digest: string | null;
  anchor_found: boolean;
  cryptographic_match: boolean;
  issuer: string | null;
  controller: string | null;
  status: EndorsementState | null;
  parent_digest: string | null;
  network: SolanaNetwork;
  anchor_address: string | null;
  status_address: string | null;
  created_slot: number | null;
  content_ref_hash: string | null;
  error?: string;
}

export interface VaultAnchorAccount {
  version: number;
  bump: number;
  issuer: string;
  controller: string;
  vault_digest: string;
  qev_schema_hash: string;
  content_ref_hash: string;
  parent_digest: string;
  created_slot: number;
  flags: number;
  address: string;
}

export interface VaultStatusAccount {
  anchor: string;
  controller: string;
  state: EndorsementState;
  state_code: number;
  updated_slot: number;
  bump: number;
  address: string;
}

export interface StorageReceipt {
  reference: string;
  content_ref_hash: string;
  adapter: string;
}

export interface VaultStorageAdapter {
  put(vaultBytes: Uint8Array): Promise<StorageReceipt>;
  get(reference: string): Promise<Uint8Array>;
}

export interface AnchorVaultParams {
  vault: unknown;
  network: SolanaNetwork;
  /** Base58 parent digest, or null. */
  parentDigest?: string | null;
  /** Optional external content reference (e.g. IPFS CID). */
  contentReference?: string | null;
  /** Optional flags bits (HAS_CONTENT_REF / HAS_PARENT set automatically when hashes present). */
  flags?: number;
}

export interface InspectResult {
  anchor: VaultAnchorAccount;
  status: VaultStatusAccount | null;
  network: SolanaNetwork;
  program_id: string;
}
