/** QAL protocol constants and shared types (v0.1.2 pre-devnet hardening). */

export const QAL_PROTOCOL = "QAL" as const;
/** Only this exact version is accepted for receipts in this release. */
export const QAL_PROTOCOL_VERSION = "0.1.2" as const;
export const SUPPORTED_RECEIPT_VERSIONS = ["0.1.2"] as const;

export const QEV_SCHEMA_V2 = "BRY-NFET-SX-VAULT-V2" as const;

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

export type VerificationOutcome =
  | "VALID_ACTIVE"
  | "VALID_REVOKED"
  | "VALID_SUPERSEDED"
  | "VALID_DISPUTED"
  | "VALID_CUSTOM_DEPLOYMENT"
  | "DIGEST_MISMATCH"
  | "SCHEMA_HASH_MISMATCH"
  | "RECEIPT_CHAIN_MISMATCH"
  | "ANCHOR_NOT_FOUND"
  | "STATUS_NOT_FOUND"
  | "INDETERMINATE_STATUS"
  | "INVALID_ACCOUNT"
  | "OWNER_MISMATCH"
  | "PDA_MISMATCH"
  | "INVALID_STATUS_RELATION"
  | "MALFORMED_QEV"
  | "UNSUPPORTED_QEV_SCHEMA"
  | "RPC_UNAVAILABLE"
  | "WRONG_NETWORK"
  | "INVALID_RECEIPT"
  | "UNSUPPORTED_ACCOUNT_VERSION"
  | "PROGRAM_ID_NOT_OFFICIAL"
  | "TRANSACTION_NOT_FOUND"
  | "TRANSACTION_PROGRAM_MISMATCH"
  | "TRANSACTION_ISSUER_MISMATCH"
  | "TRANSACTION_ANCHOR_MISMATCH"
  | "TRANSACTION_SLOT_MISMATCH"
  | "TRANSACTION_DIGEST_MISMATCH"
  | "TRANSACTION_INVALID_SIGNATURE";

export type VerificationTier = {
  /** Local vault schema + digest recompute. */
  local_digest: boolean;
  /** Chain account owner/discriminator/PDA checks. */
  chain_accounts: boolean;
  /** Receipt fields vs chain. */
  receipt_cross_check: boolean;
  /** Optional deeper: transaction provenance. */
  transaction_provenance: boolean;
};

export interface ReceiptMismatch {
  field: string;
  receipt: string;
  chain: string;
}

export interface QalReceipt {
  protocol: typeof QAL_PROTOCOL;
  protocol_version: string;
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
  successor_digest: string | null;
  network: SolanaNetwork | null;
  program_id: string | null;
  official_program: boolean | null;
  anchor_address: string | null;
  status_address: string | null;
  created_slot: number | null;
  content_ref_hash: string | null;
  tiers: VerificationTier;
  mismatches?: ReceiptMismatch[];
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
  version: number;
  successor_digest: string;
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

export interface VerifyOptions {
  /** When true, non-official program IDs are allowed (result labeled VALID_CUSTOM_DEPLOYMENT). */
  allowCustomProgramId?: boolean;
  /** When true (default), fetch and validate transaction provenance. */
  verifyTransaction?: boolean;
  rpcUrl?: string;
  connection?: import("@solana/web3.js").Connection;
}
