//! QAL Anchor Program — Solana-first QEV Anchor Layer (pre-alpha).
//!
//! QEV encrypts locally. This program never sees plaintext, passwords, or keys.
//! It stores only compact cryptographic commitments and endorsement state.
//!
//! Security notes (v0.1.1 remediation):
//! - VaultAnchor is fully immutable after create (no controller field).
//! - Controller lives only on VaultStatus.
//! - No global writable counter on the anchor path (parallel-safe).
//! - No first-caller protocol capture on the hot path.
//! - Unknown flag bits are rejected.
//! - `supersede_vault` is a single atomic instruction.

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

// Active development program ID (NOT the compromised historical ID).
// Keypair lives outside the repository: ~/.config/qal/qal-anchor-program-keypair.json
declare_id!("6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR");

#[program]
pub mod qal_anchor {
    use super::*;

    /// Create an immutable vault anchor + active status account.
    /// Never accepts plaintext, passwords, or encryption keys.
    pub fn anchor_vault(
        ctx: Context<AnchorVault>,
        vault_digest: [u8; 32],
        qev_schema_hash: [u8; 32],
        content_ref_hash: [u8; 32],
        parent_digest_claim: [u8; 32],
        flags: u16,
    ) -> Result<()> {
        instructions::anchor_vault::handle_anchor_vault(
            ctx,
            vault_digest,
            qev_schema_hash,
            content_ref_hash,
            parent_digest_claim,
            flags,
        )
    }

    /// Update endorsement state. Does not rewrite the immutable anchor.
    pub fn set_status(ctx: Context<SetStatus>, new_state: u8) -> Result<()> {
        instructions::set_status::handle_set_status(ctx, new_state)
    }

    /// Transfer controller on the mutable status account only.
    pub fn transfer_controller(
        ctx: Context<TransferController>,
        new_controller: Pubkey,
    ) -> Result<()> {
        instructions::transfer_controller::handle_transfer_controller(ctx, new_controller)
    }

    /// Atomically: create new anchor with parent claim, mark old status superseded.
    pub fn supersede_vault(
        ctx: Context<SupersedeVault>,
        new_vault_digest: [u8; 32],
        new_qev_schema_hash: [u8; 32],
        new_content_ref_hash: [u8; 32],
        new_flags: u16,
    ) -> Result<()> {
        instructions::supersede_vault::handle_supersede_vault(
            ctx,
            new_vault_digest,
            new_qev_schema_hash,
            new_content_ref_hash,
            new_flags,
        )
    }
}
