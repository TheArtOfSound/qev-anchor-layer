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

    #[msg("QEV schema hash must not be all zeros")]
    ZeroSchemaHash,

    #[msg("Unknown or reserved flag bits are not allowed in v0.1")]
    UnknownFlags,

    #[msg("Status account does not reference the expected anchor")]
    StatusAnchorMismatch,

    #[msg("Parent digest claim does not match old vault digest")]
    ParentDigestMismatch,

    #[msg("Old and new vault digests must differ")]
    SameVaultDigest,

    #[msg("Issuer mismatch between accounts")]
    IssuerMismatch,

    #[msg("Invalid status transition for set_status")]
    InvalidStatusTransition,

    #[msg("Superseded is terminal; cannot change status")]
    StatusTerminalSuperseded,

    #[msg("Revoked is terminal; cannot change status")]
    StatusTerminalRevoked,

    #[msg("set_status cannot set superseded; use supersede_vault")]
    SupersedeRequiresAtomicIx,

    #[msg("Old anchor is already superseded")]
    AlreadySuperseded,

    #[msg("Old anchor is revoked and cannot be superseded")]
    CannotSupersedeRevoked,

    #[msg("Old anchor status does not allow supersession")]
    CannotSupersedeFromState,
}
