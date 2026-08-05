# QAL On-Chain Record Format (Solana v0.1)

## Program

- Name: `qal-anchor`
- Program ID (dev/local): `AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf`

## PDAs

| Account | Seeds |
|---------|--------|
| ProtocolConfig | `["qal", "protocol"]` |
| VaultAnchor | `["qal", issuer_pubkey, vault_digest]` |
| VaultStatus | `["qal", "status", issuer_pubkey, vault_digest]` |

## VaultAnchor (immutable after create)

```rust
pub struct VaultAnchor {
    pub version: u8,
    pub bump: u8,
    pub issuer: Pubkey,
    pub controller: Pubkey,
    pub vault_digest: [u8; 32],
    pub qev_schema_hash: [u8; 32],
    pub content_ref_hash: [u8; 32],
    pub parent_digest: [u8; 32],
    pub created_slot: u64,
    pub flags: u16,
}
```

Immutable fields: issuer, vault_digest, qev_schema_hash, content_ref_hash,
parent_digest, created_slot, flags, version, bump.

`controller` may change via `transfer_controller` (issuer never changes).

### Flags

| Bit | Name | Meaning |
|-----|------|---------|
| 0 | `HAS_CONTENT_REF` | content_ref_hash non-zero |
| 1 | `HAS_PARENT` | parent_digest non-zero |

Program normalizes flags from hash fields on write.

## VaultStatus (mutable endorsement)

```rust
pub struct VaultStatus {
    pub anchor: Pubkey,
    pub controller: Pubkey,
    pub state: u8,
    pub updated_slot: u64,
    pub bump: u8,
}
```

| state | name |
|------:|------|
| 0 | active |
| 1 | revoked |
| 2 | superseded |
| 3 | disputed |

Revocation **never** deletes or rewrites the VaultAnchor.

## Instructions

### `initialize_protocol`

Creates ProtocolConfig. Once per deployment.

### `anchor_vault`

Args: `vault_digest`, `qev_schema_hash`, `content_ref_hash`, `parent_digest`, `flags`.

Rules:

- Issuer must sign
- Reject all-zero vault_digest
- Reject all-zero qev_schema_hash
- Reject duplicate PDA (account already exists)
- Record current slot
- Create VaultAnchor + VaultStatus (active)
- Emit `VaultAnchored` event
- Never accept plaintext or unbounded strings

### `set_status`

Args: `new_state` (0–3). Requires current controller. Emits previous and new status.

### `transfer_controller`

Args: `new_controller`. Requires current controller. Rejects default pubkey.
Preserves original issuer permanently.

## Receipt (off-chain convenience)

```json
{
  "protocol": "QAL",
  "protocol_version": "0.1.0",
  "network": "solana-devnet",
  "program_id": "...",
  "anchor_address": "...",
  "status_address": "...",
  "issuer": "...",
  "controller": "...",
  "vault_digest": "...",
  "qev_schema": "BRY-NFET-SX-VAULT-V2",
  "content_reference": null,
  "parent_digest": null,
  "transaction_signature": "...",
  "created_slot": 0
}
```

A receipt is **not** the source of truth. Verification reads chain state.
