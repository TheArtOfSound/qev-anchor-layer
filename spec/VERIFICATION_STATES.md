# Verification States (v0.1.2)

## Tiers

Every verification result includes:

```json
{
  "tiers": {
    "local_digest": true,
    "chain_accounts": true,
    "receipt_cross_check": true,
    "transaction_provenance": true
  }
}
```

- **local_digest** — QEV schema validate + canonical SHA-256
- **chain_accounts** — owner, discriminator, version, PDAs
- **receipt_cross_check** — every receipt claim vs chain (`RECEIPT_CHAIN_MISMATCH` if any disagree)
- **transaction_provenance** — fetch signature; program, issuer, anchor, digest, slot (default on)

## Success outcomes

| Outcome | Meaning |
|---------|---------|
| `VALID_ACTIVE` | Official program; crypto match; status active |
| `VALID_REVOKED` | Match; endorsement revoked (terminal) |
| `VALID_SUPERSEDED` | Match; superseded with successor_digest |
| `VALID_DISPUTED` | Match; disputed |
| `VALID_CUSTOM_DEPLOYMENT` | Match under `allowCustomProgramId` (not official QAL) |

## Failure / indeterminate

| Outcome | Meaning |
|---------|---------|
| `DIGEST_MISMATCH` | Receipt-directed: local vault ≠ on-chain digest |
| `SCHEMA_HASH_MISMATCH` | Schema hash disagree |
| `RECEIPT_CHAIN_MISMATCH` | Receipt metadata lies relative to chain |
| `PROGRAM_ID_NOT_OFFICIAL` | Non-official program without opt-in |
| `ANCHOR_NOT_FOUND` / `STATUS_NOT_FOUND` | Missing accounts |
| `INDETERMINATE_STATUS` | Status missing/undecodable (never treated as active) |
| `OWNER_MISMATCH` / `PDA_MISMATCH` / `INVALID_STATUS_RELATION` | Account relation failures |
| `TRANSACTION_*` | Provenance failures |
| `WRONG_NETWORK` / `RPC_UNAVAILABLE` / `INVALID_RECEIPT` | Environment / input |

## CLI

```bash
qal verify vault.qev --receipt vault.qal-receipt.json
qal verify vault.qev --receipt r.json --allow-custom-program
qal verify vault.qev --receipt r.json --skip-tx-check   # accounts only
```
