use anchor_lang::prelude::*;

use crate::constants::{QAL_SEED, STATUS_SEED};
use crate::error::QalError;
use crate::state::{VaultAnchor, VaultStatus};

#[derive(Accounts)]
pub struct TransferController<'info> {
    pub controller: Signer<'info>,

    #[account(
        mut,
        seeds = [QAL_SEED, vault_anchor.issuer.as_ref(), vault_anchor.vault_digest.as_ref()],
        bump = vault_anchor.bump,
        constraint = vault_anchor.controller == controller.key() @ QalError::UnauthorizedController,
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

pub fn handle_transfer_controller(ctx: Context<TransferController>, new_controller: Pubkey) -> Result<()> {
    require!(new_controller != Pubkey::default(), QalError::ZeroController);

    let previous = ctx.accounts.vault_anchor.controller;

    // Issuer is NEVER changed.
    ctx.accounts.vault_anchor.controller = new_controller;
    ctx.accounts.vault_status.controller = new_controller;

    let clock = Clock::get()?;
    ctx.accounts.vault_status.updated_slot = clock.slot;

    emit!(ControllerTransferred {
        anchor: ctx.accounts.vault_anchor.key(),
        issuer: ctx.accounts.vault_anchor.issuer,
        previous_controller: previous,
        new_controller,
        updated_slot: clock.slot,
    });

    Ok(())
}

#[event]
pub struct ControllerTransferred {
    pub anchor: Pubkey,
    pub issuer: Pubkey,
    pub previous_controller: Pubkey,
    pub new_controller: Pubkey,
    pub updated_slot: u64,
}
