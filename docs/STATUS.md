# QAL Implementation Status (v0.1.2)

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

## Live Devnet (2026-08-13)

| Item | Notes |
|------|-------|
| Official program on Devnet | `6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR` |
| Public site | https://bestmemecoins.app |
| Evidence pack | `evidence/devnet/v0.1.2/` |
| Hosted Check vault | `apps/site/evidence/devnet/vault.json` (later demo file, not File A) |
| Grant wallet as authority | **Never** |
| Deploy slot | `483578680` |
| Upgrade authority | `3ZYTW6D7J5NRZTekzvb51GP2RfUawkviJgXuxy3rcWnz` (single key — multisig before mainnet) |
| Binary SHA-256 | `c49a71e0016c2ab4de22833ee599bf3076d3f3dc0d1dd13fa153f14ee18e0259` |
| Deployed bytes == local build | Verified via `solana program dump` (hashes equal). Reproducible build ≠ audit. |

## Still incomplete

| Item | Notes |
|------|-------|
| Green GitHub Actions on `main` | Green on `5376e6f` (2026-08-13). Re-confirm each push. |
| External audit | No |
| Token | **None** |
| Studio posting | Gated. Browser envelopes are not official QEV. |
| Mainnet | Not supported. Do not deploy unaudited. |
| Full browser QEV schema validation | Still simplified vs CLI/SDK |

## Grant wallet (receive only)

```text
8976JDnWQqq7uFfwJza82gZSkGj4PMGMY4JLh8b7TDGe
```

Not for program authority, deploy signer, or automated fee payer.
