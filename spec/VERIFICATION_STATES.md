# Verification States

Verification always separates:

1. **Cryptographic match** — local digest equals on-chain `vault_digest`
2. **Endorsement state** — active / revoked / superseded / disputed

Never collapse a revoked-but-matching vault into a single generic “fail”.

## Outcomes

| Outcome | Meaning |
|---------|---------|
| `VALID_ACTIVE` | Schema OK, digest matches, status active |
| `VALID_REVOKED` | Digest matches; controller revoked endorsement |
| `VALID_SUPERSEDED` | Digest matches; superseded by a newer revision |
| `VALID_DISPUTED` | Digest matches; disputed flag set by controller |
| `DIGEST_MISMATCH` | Anchor found but digests differ |
| `ANCHOR_NOT_FOUND` | No PDA for issuer+digest (or issuer missing) |
| `MALFORMED_QEV` | Vault failed structural validation |
| `UNSUPPORTED_QEV_SCHEMA` | Schema not supported by this QAL version |
| `RPC_UNAVAILABLE` | Could not reach configured RPC |
| `WRONG_NETWORK` | Reserved for explicit network mismatch checks |

## CLI JSON shape

```json
{
  "outcome": "VALID_ACTIVE",
  "vault_valid": true,
  "digest": "...",
  "anchor_found": true,
  "cryptographic_match": true,
  "issuer": "...",
  "controller": "...",
  "status": "active",
  "parent_digest": null,
  "network": "solana-devnet"
}
```

Example revoked:

```json
{
  "outcome": "VALID_REVOKED",
  "cryptographic_match": true,
  "status": "revoked"
}
```
