use anchor_lang::prelude::*;

/// Seed prefix for all QAL PDAs.
#[constant]
pub const QAL_SEED: &[u8] = b"qal";

/// Seed for the global protocol config account.
#[constant]
pub const PROTOCOL_SEED: &[u8] = b"protocol";

/// Seed for status accounts.
#[constant]
pub const STATUS_SEED: &[u8] = b"status";

/// Current on-chain account layout version for VaultAnchor.
pub const ANCHOR_VERSION: u8 = 1;

/// Status: endorsement is active.
pub const STATUS_ACTIVE: u8 = 0;
/// Status: controller revoked endorsement (historical anchor remains).
pub const STATUS_REVOKED: u8 = 1;
/// Status: superseded by a newer revision.
pub const STATUS_SUPERSEDED: u8 = 2;
/// Status: disputed (controller flag only — not a legal finding).
pub const STATUS_DISPUTED: u8 = 3;

/// Flag bit: content_ref_hash is set (non-zero).
pub const FLAG_HAS_CONTENT_REF: u16 = 1 << 0;
/// Flag bit: parent_digest is set (non-zero).
pub const FLAG_HAS_PARENT: u16 = 1 << 1;
