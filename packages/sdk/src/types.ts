/** QAL protocol constants and shared types (v0.1.1 security remediation). */

export const QAL_PROTOCOL = "QAL" as const;
export const QAL_PROTOCOL_VERSION = "0.1.1" as const;

export const QEV_SCHEMA_V2 = "BRY-NFET-SX-VAULT-V2" as const;

/** Supported networks in pre-alpha. Mainnet is intentionally unsupported. */
export type SolanaNetwork = "solana-localnet" | "solana-devnet";

export type EndorsementState =
  | "active"
  | "revoked"
  | "superseded"
  | "disputed";

export const STATUS_CODES = {
  active: 0,
  revoked: 1,
  superseded: 2,
  disputed: 3,
} as const;

/**
 * Structured verification outcomes. Fail closed on unknown / missing status.
 */
export type VerificationOutcome =
  | "VALID_ACTIVE"
  | "VALID_REVOKED"
  | "VALID_SUPERSEDED"
  | "VALID_DISPUTED"
  | "DIGEST_MISMATCH"
  | "SCHEMA_HASH_MISMATCH"
  | "ANCHOR_NOT_FOUND"
  | "STATUS_NOT_FOUND"
  | "INDETERMINATE_STATUS"
  | "INVALID_ACCOUNT"
  | "OWNER_MISMATCH"
  | "PDA_MISMATCH"
  | "MALFORMED_QEV"
  | "UNSUPPORTED_QEV_SCHEMA"
  | "RPC_UNAVAILABLE"
  | "WRONG_NETWORK"
  | "INVALID_RECEIPT"
  | "UNSUPPORTED_ACCOUNT_VERSION";

export interface QalReceipt {
  protocol: typeof QAL_PROTOCOL;
  protocol_version: string;
  network: SolanaNetwork;
  /** Cluster genesis hash (hex or base58 as returned by getGenesisHash). */
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
  /** Unverified parent claim unless flags indicate atomic supersede. */
  parent_digest_claim: string | null;
  transaction_signature: string;
  created_slot: number;
}

export interface VerificationResult {
  outcome: VerificationOutcome;
  vault_valid: boolean;
  digest: string | null;
  anchor_found: boolean;
  cryptographic_match: boolean;
  schema_hash_match: boolean | null;
  issuer: string | null;
  controller: string | null;
  status: EndorsementState | "indeterminate" | null;
  parent_digest_claim: string | null;
  network: SolanaNetwork | null;
  program_id: string | null;
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
  vault_digest: string;
  qev_schema_hash: string;
  content_ref_hash: string;
  parent_digest_claim: string;
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
  parentDigestClaim?: string | null;
  contentReference?: string | null;
  flags?: number;
}
