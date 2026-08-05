# QAL Implementation Status (v0.1.1 security remediation)

## Label

> **Experimental pre-alpha. Devnet only. Unaudited. Do not use for production evidence.**

## Remediation vs audit launch blockers

| # | Blocker | Status |
|---|---------|--------|
| 1 | Committed program keypair | **Fixed** — removed from tree; old ID documented compromised; new ID + local-only keypair |
| 2 | Fail-open VALID_ACTIVE | **Fixed** — missing/unknown status → INDETERMINATE / STATUS_NOT_FOUND |
| 3 | Decoder accepts non-QAL data | **Fixed** — strict discriminator + owner checks |
| 4 | Mutable “immutable” anchor | **Fixed** — controller only on VaultStatus; anchor layout v2 |
| 5 | Protocol init capture | **Fixed** — `initialize_protocol` removed; no global config on hot path |
| 6 | Global counter contention | **Fixed** — no ProtocolConfig writes on anchor |
| 7 | Browser CDN runtime | **Fixed** — vendor build; CSP; no mainnet option |
| 8 | Supersede false success | **Fixed** — atomic `supersede_vault` instruction; honest CLI errors |
| 9 | Permissive mainnet/network | **Fixed** — reject mainnet/unknown; genesis hash binding on receipts |
| 10 | Weak default tests | **Improved** — unit + program tests in `pnpm test`; CI workflow added |

## Still incomplete

| Item | Notes |
|------|-------|
| Live devnet deploy + e2e evidence | Requires funded wallet + deployer keypair outside git |
| External audit | Not done |
| Package split (`qal-core` browser-neutral) | Documented; not fully split |
| Parent claim on-chain verification | Atomic supersede only; free-form claims labeled unverified |
| SAS batching | Decision doc only (`docs/SAS_ARCHITECTURE.md`) |
| Token | **None. Do not launch a token.** |

## Program IDs

| | |
|--|--|
| Compromised | `AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf` |
| Active pre-alpha | `6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR` |

## Package release

Not published to npm. Names `@qira/qal-*` remain private workspace packages.
