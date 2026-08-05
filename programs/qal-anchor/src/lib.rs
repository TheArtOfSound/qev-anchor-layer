//! QAL Anchor Program — Solana-first implementation of the QEV Anchor Layer.
//!
//! QEV encrypts locally. This program never sees plaintext, passwords, or keys.
//! It stores only compact cryptographic commitments and registry state.

pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf");

#[program]
pub mod qal_anchor {
    use super::*;

    /// One-time protocol bootstrap. Records the upgrade/admin authority.
    pub fn initialize_protocol(ctx: Context<InitializeProtocol>) -> Result<()> {
        instructions::initialize_protocol::handle_initialize_protocol(ctx)
    }

    /// Create an immutable vault anchor + active status account.
    ///
    /// Never accepts plaintext, passwords, or encryption keys.
    /// `vault_digest` must be a non-zero 32-byte SHA-256 of the full canonical QEV vault.
    pub fn anchor_vault(
        ctx: Context<AnchorVault>,
        vault_digest: [u8; 32],
        qev_schema_hash: [u8; 32],
        content_ref_hash: [u8; 32],
        parent_digest: [u8; 32],
        flags: u16,
    ) -> Result<()> {
        instructions::anchor_vault::handle_anchor_vault(
            ctx,
            vault_digest,
            qev_schema_hash,
            content_ref_hash,
            parent_digest,
            flags,
        )
    }

    /// Update endorsement state (active / revoked / superseded / disputed).
    /// Does not delete or rewrite the immutable anchor.
    pub fn set_status(ctx: Context<SetStatus>, new_state: u8) -> Result<()> {
        instructions::set_status::handle_set_status(ctx, new_state)
    }

    /// Transfer controller authority. Issuer remains permanently on the anchor.
    pub fn transfer_controller(ctx: Context<TransferController>, new_controller: Pubkey) -> Result<()> {
        instructions::transfer_controller::handle_transfer_controller(ctx, new_controller)
    }
}
