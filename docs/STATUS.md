# QAL Implementation Status

## Complete (v0.1 vertical slice)

| Area | Status |
|------|--------|
| Monorepo scaffold | Done |
| Protocol specs (`spec/*`) | Done |
| Security / disclaimer docs | Done |
| Solana program `qal-anchor` | Done + LiteSVM tests |
| TypeScript SDK `@qira/qal-sdk` | Done |
| CLI `@qira/qal-cli` | Done |
| Browser verifier (static) | Done |
| QEV pin `@bryan237l/qev-cli@0.30.0` | Done (external only) |
| Unit + tamper tests | Pass (19/19) |
| Program tests (LiteSVM) | Pass (initialize, anchor, zero-digest reject, status, unauthorized transfer, issuer immutability) |
| Fixtures | Done |

## Incomplete / blocked in this environment

| Item | Notes |
|------|-------|
| **Devnet deploy** | Wallet `13Foiem…` has **0 SOL**; public faucet rate-limited. Program built at `target/deploy/qal_anchor.so` but **not deployed** to public devnet from this session. |
| **Devnet e2e test** | Gated behind `QAL_DEVNET=1`; requires funded wallet + deployed program. |
| **Local validator e2e** | `solana-test-validator` failed to become healthy (HTTP 500) in this environment. LiteSVM covers program logic instead. |
| **npm names `@qira/qal-*`** | Availability not verified on registry. |
| **GitHub remote** | Create/push `TheArtOfSound/qev-anchor-layer` after review. |
| **Verified builds metadata** | Documented path only; not submitted. |
| **Mainnet** | Out of scope for v0.1. |

## Proof that secrets never enter transactions

1. Program instructions accept only fixed-size digests/hashes/pubkeys/flags — no string plaintext fields.
2. SDK `describeAnchorPayload` / `anchorVault` hash the vault **locally** and submit only 32-byte digests.
3. CLI refuses `--password` / `--phrase` flags.
4. LiteSVM tests exercise instruction data of fixed length (`8 + 32*4 + 2` for `anchor_vault`).

## How to finish the live chain path

```bash
# Fund wallet (devnet)
solana airdrop 2 --url https://api.devnet.solana.com

# Deploy
solana config set --url https://api.devnet.solana.com
anchor deploy --provider.cluster devnet

# E2E
QAL_DEVNET=1 pnpm test:devnet
qal doctor
qal encrypt evidence.json --out evidence.qev
qal anchor evidence.qev --network devnet
qal verify evidence.qev --network devnet
```

## Program ID

```
AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf
```
