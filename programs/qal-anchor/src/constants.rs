use anchor_lang::prelude::*;

#[constant]
pub const QAL_SEED: &[u8] = b"qal";

#[constant]
pub const STATUS_SEED: &[u8] = b"status";

/// Account layout version for VaultAnchor.
pub const ANCHOR_VERSION: u8 = 2;

pub const STATUS_ACTIVE: u8 = 0;
pub const STATUS_REVOKED: u8 = 1;
pub const STATUS_SUPERSEDED: u8 = 2;
pub const STATUS_DISPUTED: u8 = 3;

pub const FLAG_HAS_CONTENT_REF: u16 = 1 << 0;
/// Parent digest claim present (unverified claim unless set via supersede_vault).
pub const FLAG_HAS_PARENT_CLAIM: u16 = 1 << 1;
/// Parent claim was set by atomic supersede_vault (old status marked superseded).
pub const FLAG_PARENT_SUPERSEDED_ATOMIC: u16 = 1 << 2;

/// Only these bits may be set by clients on `anchor_vault`.
pub const ALLOWED_CLIENT_FLAGS: u16 = FLAG_HAS_CONTENT_REF | FLAG_HAS_PARENT_CLAIM;
