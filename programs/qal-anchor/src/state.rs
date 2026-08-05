use anchor_lang::prelude::*;

use crate::constants::ANCHOR_VERSION;

/// Fully immutable vault commitment. Created once; never rewritten.
///
/// Does NOT contain a controller. Control authority lives only on VaultStatus.
///
/// `parent_digest_claim` is an optional 32-byte claim. Unless
/// `FLAG_PARENT_SUPERSEDED_ATOMIC` is set (via `supersede_vault`), the program
/// does not prove the parent exists or is controlled by the issuer.
#[account]
#[derive(InitSpace)]
pub struct VaultAnchor {
    /// Account layout version (2 after security remediation).
    pub version: u8,
    /// PDA bump.
    pub bump: u8,
    /// Wallet that signed the original anchor transaction (permanent).
    pub issuer: Pubkey,
    /// SHA-256(canonicalJSON(vault)).
    pub vault_digest: [u8; 32],
    /// SHA-256 of the QEV schema string.
    pub qev_schema_hash: [u8; 32],
    /// SHA-256 of normalized content reference, or zeros.
    pub content_ref_hash: [u8; 32],
    /// Optional parent vault digest claim, or zeros.
    pub parent_digest_claim: [u8; 32],
    /// Slot at which the anchor was created.
    pub created_slot: u64,
    /// Bit flags (known bits only).
    pub flags: u16,
}

impl VaultAnchor {
    pub fn expected_version() -> u8 {
        ANCHOR_VERSION
    }
}

/// Mutable endorsement / control state. Separated so revocation never erases history.
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
}
