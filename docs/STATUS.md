# QAL Implementation Status (v0.1.2 pre-devnet hardening)

## Label

> **Experimental pre-alpha. Devnet/localnet only. Unaudited. Do not use for production evidence.**

## Official pre-alpha program ID

```text
6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR
```

Compromised (abandoned):

```text
AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf
```

## v0.1.2 hardening (this pass)

| Item | Status |
|------|--------|
| CI without ignored failures | Done (workflow blocks on all steps) |
| Official program ID required | Done (`PROGRAM_ID_NOT_OFFICIAL` / custom opt-in) |
| Receipt ↔ chain cross-check | Done (`RECEIPT_CHAIN_MISMATCH` + mismatches[]) |
| Status PDA independent derivation | Done |
| Transaction provenance | Done (default on; `--skip-tx-check` opt-out) |
| Status transition matrix | Done (on-chain) |
| successor_digest | Done |
| Second successor blocked | Done |
| Manual superseded via set_status blocked | Done |
| Browser lockfile-only vendor | Done (no unpkg) |
| Adversarial tests | Done |

## Verification tiers (reported every time)

```text
local_digest
chain_accounts
receipt_cross_check
transaction_provenance   # default on for receipt-directed verify
```

## Status transition matrix

```text
set_status:
  active   → disputed | revoked
  disputed → active | revoked
  revoked  → terminal
  superseded → terminal
  superseded is NEVER set by set_status

supersede_vault:
  active|disputed → superseded (stores successor_digest)
  revoked/superseded → error
  second successor → error
```

## Still incomplete before “devnet evidence complete”

| Item | Notes |
|------|-------|
| Green GitHub Actions on `main` | Must be confirmed after push |
| Live devnet deploy | Not done — do not use grant wallet as authority |
| External audit | No |
| Token | **None** |
| Full browser QEV schema validation | Still simplified vs CLI/SDK |

## Grant wallet (receive only)

```text
8976JDnWQqq7uFfwJza82gZSkGj4PMGMY4JLh8b7TDGe
```

Not for program authority, deploy signer, or automated fee payer.
