use anchor_lang::prelude::*;

#[error_code]
pub enum QalError {
    #[msg("Vault digest must not be all zeros")]
    ZeroVaultDigest,

    #[msg("Invalid endorsement status value")]
    InvalidStatus,

    #[msg("New controller must not be the default/zero pubkey")]
    ZeroController,

    #[msg("Only the current controller may perform this action")]
    UnauthorizedController,

    #[msg("Protocol already initialized")]
    ProtocolAlreadyInitialized,

    #[msg("QEV schema hash must not be all zeros")]
    ZeroSchemaHash,
}
