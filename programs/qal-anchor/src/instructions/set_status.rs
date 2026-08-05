use anchor_lang::prelude::*;

use crate::constants::{
    QAL_SEED, STATUS_ACTIVE, STATUS_DISPUTED, STATUS_REVOKED, STATUS_SEED, STATUS_SUPERSEDED,
};
use crate::error::QalError;
use crate::state::{VaultAnchor, VaultStatus};

#[derive(Accounts)]
pub struct SetStatus<'info> {
    pub controller: Signer<'info>,

    #[account(
        seeds = [QAL_SEED, vault_anchor.issuer.as_ref(), vault_anchor.vault_digest.as_ref()],
        bump = vault_anchor.bump,
    )]
    pub vault_anchor: Account<'info, VaultAnchor>,

    #[account(
        mut,
        seeds = [
            QAL_SEED,
            STATUS_SEED,
            vault_anchor.issuer.as_ref(),
            vault_anchor.vault_digest.as_ref()
        ],
        bump = vault_status.bump,
        constraint = vault_status.anchor == vault_anchor.key() @ QalError::UnauthorizedController,
        constraint = vault_status.controller == controller.key() @ QalError::UnauthorizedController,
    )]
    pub vault_status: Account<'info, VaultStatus>,
}

pub fn handle_set_status(ctx: Context<SetStatus>, new_state: u8) -> Result<()> {
    require!(
        matches!(
            new_state,
            STATUS_ACTIVE | STATUS_REVOKED | STATUS_SUPERSEDED | STATUS_DISPUTED
        ),
        QalError::InvalidStatus
    );

    // Defense in depth: controller on immutable anchor must match signer.
    require_keys_eq!(
        ctx.accounts.vault_anchor.controller,
        ctx.accounts.controller.key(),
        QalError::UnauthorizedController
    );

    let clock = Clock::get()?;
    let status = &mut ctx.accounts.vault_status;
    let previous = status.state;
    status.state = new_state;
    status.updated_slot = clock.slot;

    emit!(StatusUpdated {
        anchor: ctx.accounts.vault_anchor.key(),
        previous_state: previous,
        new_state,
        controller: ctx.accounts.controller.key(),
        updated_slot: clock.slot,
    });

    Ok(())
}

#[event]
pub struct StatusUpdated {
    pub anchor: Pubkey,
    pub previous_state: u8,
    pub new_state: u8,
    pub controller: Pubkey,
    pub updated_slot: u64,
}
