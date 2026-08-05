use anchor_lang::prelude::*;

use crate::constants::{
    ALLOWED_CLIENT_FLAGS, ANCHOR_VERSION, FLAG_HAS_CONTENT_REF, FLAG_HAS_PARENT_CLAIM,
    FLAG_PARENT_SUPERSEDED_ATOMIC, QAL_SEED, STATUS_ACTIVE, STATUS_SEED, STATUS_SUPERSEDED,
};
use crate::error::QalError;
use crate::state::{VaultAnchor, VaultStatus};

/// Atomic supersession:
/// - requires controller of the old status
/// - creates new immutable anchor with parent_digest_claim = old.vault_digest
/// - marks old status as superseded
/// All in one transaction (all-or-nothing).
#[derive(Accounts)]
#[instruction(new_vault_digest: [u8; 32])]
pub struct SupersedeVault<'info> {
    #[account(mut)]
    pub controller: Signer<'info>,

    /// Old immutable anchor (read-only).
    #[account(
        seeds = [QAL_SEED, old_vault_anchor.issuer.as_ref(), old_vault_anchor.vault_digest.as_ref()],
        bump = old_vault_anchor.bump,
    )]
    pub old_vault_anchor: Account<'info, VaultAnchor>,

    #[account(
        mut,
        seeds = [
            QAL_SEED,
            STATUS_SEED,
            old_vault_anchor.issuer.as_ref(),
            old_vault_anchor.vault_digest.as_ref()
        ],
        bump = old_vault_status.bump,
        constraint = old_vault_status.anchor == old_vault_anchor.key() @ QalError::StatusAnchorMismatch,
        constraint = old_vault_status.controller == controller.key() @ QalError::UnauthorizedController,
    )]
    pub old_vault_status: Account<'info, VaultStatus>,

    /// New immutable anchor under the same issuer as the old anchor.
    #[account(
        init,
        payer = controller,
        space = 8 + VaultAnchor::INIT_SPACE,
        seeds = [
            QAL_SEED,
            old_vault_anchor.issuer.as_ref(),
            new_vault_digest.as_ref()
        ],
        bump
    )]
    pub new_vault_anchor: Account<'info, VaultAnchor>,

    #[account(
        init,
        payer = controller,
        space = 8 + VaultStatus::INIT_SPACE,
        seeds = [
            QAL_SEED,
            STATUS_SEED,
            old_vault_anchor.issuer.as_ref(),
            new_vault_digest.as_ref()
        ],
        bump
    )]
    pub new_vault_status: Account<'info, VaultStatus>,

    pub system_program: Program<'info, System>,
}

pub fn handle_supersede_vault(
    ctx: Context<SupersedeVault>,
    new_vault_digest: [u8; 32],
    new_qev_schema_hash: [u8; 32],
    new_content_ref_hash: [u8; 32],
    new_flags: u16,
) -> Result<()> {
    require!(new_vault_digest != [0u8; 32], QalError::ZeroVaultDigest);
    require!(new_qev_schema_hash != [0u8; 32], QalError::ZeroSchemaHash);
    require!(
        new_flags & !ALLOWED_CLIENT_FLAGS == 0,
        QalError::UnknownFlags
    );
    require!(
        new_vault_digest != ctx.accounts.old_vault_anchor.vault_digest,
        QalError::SameVaultDigest
    );

    let clock = Clock::get()?;
    let issuer = ctx.accounts.old_vault_anchor.issuer;
    let old_digest = ctx.accounts.old_vault_anchor.vault_digest;

    // Mark old superseded first in the same tx (atomicity via single instruction).
    let previous = ctx.accounts.old_vault_status.state;
    ctx.accounts.old_vault_status.state = STATUS_SUPERSEDED;
    ctx.accounts.old_vault_status.updated_slot = clock.slot;

    let mut normalized_flags: u16 = FLAG_HAS_PARENT_CLAIM | FLAG_PARENT_SUPERSEDED_ATOMIC;
    if new_content_ref_hash != [0u8; 32] {
        normalized_flags |= FLAG_HAS_CONTENT_REF;
    }

    let new_anchor = &mut ctx.accounts.new_vault_anchor;
    new_anchor.version = ANCHOR_VERSION;
    new_anchor.bump = ctx.bumps.new_vault_anchor;
    new_anchor.issuer = issuer;
    new_anchor.vault_digest = new_vault_digest;
    new_anchor.qev_schema_hash = new_qev_schema_hash;
    new_anchor.content_ref_hash = new_content_ref_hash;
    new_anchor.parent_digest_claim = old_digest;
    new_anchor.created_slot = clock.slot;
    new_anchor.flags = normalized_flags;

    let new_status = &mut ctx.accounts.new_vault_status;
    new_status.anchor = new_anchor.key();
    new_status.controller = ctx.accounts.controller.key();
    new_status.state = STATUS_ACTIVE;
    new_status.updated_slot = clock.slot;
    new_status.bump = ctx.bumps.new_vault_status;

    emit!(VaultSuperseded {
        old_anchor: ctx.accounts.old_vault_anchor.key(),
        new_anchor: new_anchor.key(),
        issuer,
        old_vault_digest: old_digest,
        new_vault_digest,
        previous_old_state: previous,
        controller: ctx.accounts.controller.key(),
        created_slot: clock.slot,
    });

    Ok(())
}

#[event]
pub struct VaultSuperseded {
    pub old_anchor: Pubkey,
    pub new_anchor: Pubkey,
    pub issuer: Pubkey,
    pub old_vault_digest: [u8; 32],
    pub new_vault_digest: [u8; 32],
    pub previous_old_state: u8,
    pub controller: Pubkey,
    pub created_slot: u64,
}
