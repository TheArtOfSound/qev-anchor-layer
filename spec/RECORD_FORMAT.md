# QAL On-Chain Record Format (Solana v0.1.1)

## Program

- Name: `qal-anchor`
- Active pre-alpha program ID: `6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR`
- Compromised historical ID (never use): `AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf`

## PDAs

| Account | Seeds |
|---------|--------|
| VaultAnchor | `["qal", issuer_pubkey, vault_digest]` |
| VaultStatus | `["qal", "status", issuer_pubkey, vault_digest]` |

No global ProtocolConfig on the hot path.

## VaultAnchor (fully immutable)

```rust
pub struct VaultAnchor {
    pub version: u8,              // 2
    pub bump: u8,
    pub issuer: Pubkey,
    pub vault_digest: [u8; 32],
    pub qev_schema_hash: [u8; 32],
    pub content_ref_hash: [u8; 32],
    pub parent_digest_claim: [u8; 32],
    pub created_slot: u64,
    pub flags: u16,
}
```

No controller field. Control lives on VaultStatus only.

### Flags

| Bit | Name | Meaning |
|-----|------|---------|
| 0 | HAS_CONTENT_REF | content_ref_hash non-zero |
| 1 | HAS_PARENT_CLAIM | parent claim non-zero (unverified unless bit 2) |
| 2 | PARENT_SUPERSEDED_ATOMIC | set only by supersede_vault |

Unknown bits rejected.

## VaultStatus (mutable)

```rust
pub struct VaultStatus {
    pub anchor: Pubkey,
    pub controller: Pubkey,
    pub state: u8,
    pub updated_slot: u64,
    pub bump: u8,
}
```

States: 0 active, 1 revoked, 2 superseded, 3 disputed.

## Instructions

- `anchor_vault` — create immutable anchor + active status
- `set_status` — controller only
- `transfer_controller` — status only
- `supersede_vault` — atomic new anchor + mark old superseded

## Receipt

Must include genesis_hash, program_id, addresses, digests. Strict parse.
Compromised program IDs refused. Chain remains source of truth.
