use anchor_lang::prelude::*;

use crate::constants::{PROTOCOL_SEED, QAL_SEED};
use crate::state::ProtocolConfig;

#[derive(Accounts)]
pub struct InitializeProtocol<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + ProtocolConfig::INIT_SPACE,
        seeds = [QAL_SEED, PROTOCOL_SEED],
        bump
    )]
    pub protocol: Account<'info, ProtocolConfig>,

    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_protocol(ctx: Context<InitializeProtocol>) -> Result<()> {
    let protocol = &mut ctx.accounts.protocol;
    protocol.authority = ctx.accounts.authority.key();
    protocol.version = 1;
    protocol.bump = ctx.bumps.protocol;
    protocol.anchors_created = 0;

    emit!(ProtocolInitialized {
        authority: protocol.authority,
        version: protocol.version,
    });

    Ok(())
}

#[event]
pub struct ProtocolInitialized {
    pub authority: Pubkey,
    pub version: u8,
}
