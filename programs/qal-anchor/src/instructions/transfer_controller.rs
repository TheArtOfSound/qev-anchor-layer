use anchor_lang::prelude::*;

use crate::constants::{QAL_SEED, STATUS_REVOKED, STATUS_SEED, STATUS_SUPERSEDED};
use crate::error::QalError;
use crate::state::{VaultAnchor, VaultStatus};

#[derive(Accounts)]
pub struct TransferController<'info> {
    pub controller: Signer<'info>,

    /// Read-only immutable anchor for seed verification.
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
        constraint = vault_status.anchor == vault_anchor.key() @ QalError::StatusAnchorMismatch,
        constraint = vault_status.controller == controller.key() @ QalError::UnauthorizedController,
    )]
    pub vault_status: Account<'info, VaultStatus>,
}

pub fn handle_transfer_controller(
    ctx: Context<TransferController>,
    new_controller: Pubkey,
) -> Result<()> {
    require!(
        new_controller != Pubkey::default(),
        QalError::ZeroController
    );
    // Terminal states: no further control changes (clear evidence semantics).
    require!(
        ctx.accounts.vault_status.state != STATUS_SUPERSEDED,
        QalError::StatusTerminalSuperseded
    );
    require!(
        ctx.accounts.vault_status.state != STATUS_REVOKED,
        QalError::StatusTerminalRevoked
    );

    let previous = ctx.accounts.vault_status.controller;
    let clock = Clock::get()?;

    // Issuer on VaultAnchor is NEVER changed; controller only on VaultStatus.
    ctx.accounts.vault_status.controller = new_controller;
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
