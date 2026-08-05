use anchor_lang::prelude::*;

use crate::constants::ANCHOR_VERSION;

/// Fully immutable vault commitment. Created once; never rewritten.
#[account]
#[derive(InitSpace)]
pub struct VaultAnchor {
    pub version: u8,
    pub bump: u8,
    pub issuer: Pubkey,
    pub vault_digest: [u8; 32],
    pub qev_schema_hash: [u8; 32],
    pub content_ref_hash: [u8; 32],
    pub parent_digest_claim: [u8; 32],
    pub created_slot: u64,
    pub flags: u16,
}

impl VaultAnchor {
    pub fn expected_version() -> u8 {
        ANCHOR_VERSION
    }
}

/// Mutable endorsement / control state.
///
/// `successor_digest` is set exactly once by `supersede_vault` (non-zero when superseded).
#[account]
#[derive(InitSpace)]
pub struct VaultStatus {
    /// Address of the immutable VaultAnchor PDA.
    pub anchor: Pubkey,
    /// Current controller (may be transferred).
    pub controller: Pubkey,
    /// 0=active, 1=revoked, 2=superseded, 3=disputed.
    pub state: u8,
    /// Slot of last status update.
    pub updated_slot: u64,
    /// PDA bump.
    pub bump: u8,
    /// Status layout version (2 after successor_digest addition).
    pub version: u8,
    /// Exact successor vault digest when superseded; otherwise zeros.
    pub successor_digest: [u8; 32],
}
