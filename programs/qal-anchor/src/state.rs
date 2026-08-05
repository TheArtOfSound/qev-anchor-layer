use anchor_lang::prelude::*;

use crate::constants::ANCHOR_VERSION;

/// Global protocol configuration (one per program deployment).
#[account]
#[derive(InitSpace)]
pub struct ProtocolConfig {
    /// Admin / initialize authority (not the vault issuer).
    pub authority: Pubkey,
    /// Protocol config layout version.
    pub version: u8,
    /// PDA bump.
    pub bump: u8,
    /// Monotonic counter of anchors created (informational).
    pub anchors_created: u64,
}

/// Immutable vault anchor. Fields set at creation are never overwritten.
///
/// This account intentionally contains only commitments:
/// - SHA-256 of the full canonical QEV vault JSON
/// - SHA-256 of the QEV schema identifier string
/// - optional hash of an external content reference (e.g. IPFS CID)
/// - optional parent vault digest for revision lineage
///
/// Never stores plaintext, passwords, keys, or sensitive labels.
#[account]
#[derive(InitSpace)]
pub struct VaultAnchor {
    /// Account layout version.
    pub version: u8,
    /// PDA bump.
    pub bump: u8,
    /// Wallet that signed the original anchor transaction (permanent).
    pub issuer: Pubkey,
    /// Current controller (may be transferred; starts as issuer).
    pub controller: Pubkey,
    /// SHA-256(canonicalJSON(vault)).
    pub vault_digest: [u8; 32],
    /// SHA-256 of the QEV schema string (e.g. BRY-NFET-SX-VAULT-V2).
    pub qev_schema_hash: [u8; 32],
    /// SHA-256 of normalized content reference, or zeros if none.
    pub content_ref_hash: [u8; 32],
    /// Parent vault digest for supersession lineage, or zeros if none.
    pub parent_digest: [u8; 32],
    /// Slot at which the anchor was created.
    pub created_slot: u64,
    /// Bit flags (HAS_CONTENT_REF, HAS_PARENT, ...).
    pub flags: u16,
}

impl VaultAnchor {
    pub fn expected_version() -> u8 {
        ANCHOR_VERSION
    }
}

/// Mutable endorsement state, separated from the immutable anchor.
/// Revocation never erases historical existence of the anchor.
#[account]
#[derive(InitSpace)]
pub struct VaultStatus {
    /// Address of the immutable VaultAnchor PDA.
    pub anchor: Pubkey,
    /// Current controller (kept in sync on transfer).
    pub controller: Pubkey,
    /// 0=active, 1=revoked, 2=superseded, 3=disputed.
    pub state: u8,
    /// Slot of last status update.
    pub updated_slot: u64,
    /// PDA bump.
    pub bump: u8,
}
