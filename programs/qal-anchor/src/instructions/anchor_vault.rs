use anchor_lang::prelude::*;

use crate::constants::{
    ALLOWED_CLIENT_FLAGS, ANCHOR_VERSION, FLAG_HAS_CONTENT_REF, FLAG_HAS_PARENT_CLAIM, QAL_SEED,
    STATUS_ACTIVE, STATUS_SEED,
};
use crate::error::QalError;
use crate::state::{VaultAnchor, VaultStatus};

#[derive(Accounts)]
#[instruction(vault_digest: [u8; 32])]
pub struct AnchorVault<'info> {
    /// Issuer must sign. Becomes permanent issuer and initial controller on status.
    #[account(mut)]
    pub issuer: Signer<'info>,

    /// Immutable anchor PDA: seeds = ["qal", issuer, vault_digest]
    #[account(
        init,
        payer = issuer,
        space = 8 + VaultAnchor::INIT_SPACE,
        seeds = [QAL_SEED, issuer.key().as_ref(), vault_digest.as_ref()],
        bump
    )]
    pub vault_anchor: Account<'info, VaultAnchor>,

    /// Mutable status PDA: seeds = ["qal", "status", issuer, vault_digest]
    #[account(
        init,
        payer = issuer,
        space = 8 + VaultStatus::INIT_SPACE,
        seeds = [QAL_SEED, STATUS_SEED, issuer.key().as_ref(), vault_digest.as_ref()],
        bump
    )]
    pub vault_status: Account<'info, VaultStatus>,

    pub system_program: Program<'info, System>,
}

pub fn handle_anchor_vault(
    ctx: Context<AnchorVault>,
    vault_digest: [u8; 32],
    qev_schema_hash: [u8; 32],
    content_ref_hash: [u8; 32],
    parent_digest_claim: [u8; 32],
    flags: u16,
) -> Result<()> {
    require!(vault_digest != [0u8; 32], QalError::ZeroVaultDigest);
    require!(qev_schema_hash != [0u8; 32], QalError::ZeroSchemaHash);
    // Reject unknown bits; do not preserve client-supplied reserved flags.
    require!(
        flags & !ALLOWED_CLIENT_FLAGS == 0,
        QalError::UnknownFlags
    );

    let clock = Clock::get()?;
    let issuer_key = ctx.accounts.issuer.key();

    let mut normalized_flags: u16 = 0;
    if content_ref_hash != [0u8; 32] {
        normalized_flags |= FLAG_HAS_CONTENT_REF;
    }
    if parent_digest_claim != [0u8; 32] {
        // Unverified parent claim unless supersede path set the atomic flag.
        normalized_flags |= FLAG_HAS_PARENT_CLAIM;
    }

    let anchor = &mut ctx.accounts.vault_anchor;
    anchor.version = ANCHOR_VERSION;
    anchor.bump = ctx.bumps.vault_anchor;
    anchor.issuer = issuer_key;
    anchor.vault_digest = vault_digest;
    anchor.qev_schema_hash = qev_schema_hash;
    anchor.content_ref_hash = content_ref_hash;
    anchor.parent_digest_claim = parent_digest_claim;
    anchor.created_slot = clock.slot;
    anchor.flags = normalized_flags;

    let status = &mut ctx.accounts.vault_status;
    status.anchor = anchor.key();
    status.controller = issuer_key;
    status.state = STATUS_ACTIVE;
    status.updated_slot = clock.slot;
    status.bump = ctx.bumps.vault_status;

    emit!(VaultAnchored {
        anchor: anchor.key(),
        status: status.key(),
        issuer: issuer_key,
        vault_digest,
        qev_schema_hash,
        content_ref_hash,
        parent_digest_claim,
        created_slot: clock.slot,
        flags: normalized_flags,
    });

    Ok(())
}

#[event]
pub struct VaultAnchored {
    pub anchor: Pubkey,
    pub status: Pubkey,
    pub issuer: Pubkey,
    pub vault_digest: [u8; 32],
    pub qev_schema_hash: [u8; 32],
    pub content_ref_hash: [u8; 32],
    pub parent_digest_claim: [u8; 32],
    pub created_slot: u64,
    pub flags: u16,
}
