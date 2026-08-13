> **Experimental pre-alpha. Devnet only. Unaudited. Do not use for production evidence.**  
> Not a token. Not a coin picker. A liar can lock a lie.  
> Compromised historical program ID: `AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf` — see `docs/COMPROMISED_PROGRAM_ID.md`.  
> Official program ID: `6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR` (keypair **not** in git).

# QAL — QEV Anchor Layer

**Lock locally. Post only a fingerprint. Anyone can check.**

This is the public repository for QAL. There is not a second QAL repo.

- **Live site:** [bestmemecoins.app](https://bestmemecoins.app) (domain is leftover; the product is not a token list)
- **QEV locker (sibling):** [TheArtOfSound/qev-desktop](https://github.com/TheArtOfSound/qev-desktop)

```text
QEV     = official locker (BRY-NFET-SX-VAULT-V2) — local encryption
QAL     = public fingerprint + status on Solana (active / revoked / superseded / disputed)
Studio  = browser practice locker (QAL-STUDIO-ENVELOPE-V1) — not an official vault, cannot post
```

QEV does not run on-chain. The chain stores digests and status, not the file, phrase, or keys.

## What this is / is not

| Is | Is not |
|----|--------|
| A local locker plus a public fingerprint | A token, coin, or memecoin picker |
| Status you can take back or replace | Proof the words are true |
| Independent Check in the browser or CLI | A wallet required to check |
| Open protocol + program + SDK + CLI + site | Finished, audited, or mainnet-ready |
| | Legal notarization or authorship |

Studio practice files are rejected by Check on purpose. Official lockers come from QEV (`qal encrypt` / `qev`).

## Live Devnet proof

The official program is on Solana Devnet. Public transactions and a hosted official vault live on the site:

- Proof: https://bestmemecoins.app/evidence/devnet/
- Check (hosted demo file): https://bestmemecoins.app/verify/
- This repo: `evidence/devnet/v0.1.2/` and `apps/site/evidence/devnet/`

File A was stamped then taken back (`2379d8e3…`, revoked). File B is a **different** replace pair. Original A/B locker bytes were not saved. A later hosted official vault (`052699c2…`) is published so Check has bytes — that demo is not File A.

Grant receive wallet `8976JDnWQqq7uFfwJza82gZSkGj4PMGMY4JLh8b7TDGe` is **receive-only**. It is not program authority.

## Quick start

```bash
pnpm install
pnpm build

# health check (QEV self-test, RPC, wallet, program)
pnpm --filter @qira/qal-cli exec node dist/index.js doctor

# encrypt with QEV (passphrase prompted — never --password)
pnpm --filter @qira/qal-cli exec node dist/index.js encrypt evidence.json --out evidence.qev

# stamp the fingerprint on Solana Devnet
pnpm --filter @qira/qal-cli exec node dist/index.js anchor evidence.qev --network devnet

# check later (reads chain; recomputes digest locally)
pnpm --filter @qira/qal-cli exec node dist/index.js verify evidence.qev --network devnet
```

After global/link install of the CLI:

```bash
qal doctor
qal encrypt evidence.json --out evidence.qev
qal anchor evidence.qev --network devnet
qal verify evidence.qev --network devnet
```

## Packages

| Package | Role |
|---------|------|
| `@qira/qal-sdk` | Digest, anchor, verify, storage adapters |
| `@qira/qal-cli` | `qal` command |
| `programs/qal-anchor` | Solana program |
| `apps/site` | Public site (Play, Studio, Check, Proof) |
| `apps/verifier` | Standalone browser Check (no vault upload) |

**QEV dependency (pinned):** `@bryan237l/qev-cli@0.30.0`

QAL consumes only QEV’s public exports. It does **not** copy QEV crypto source.

## Digest

```ts
validateVaultSchemaV2(vault);
const canonicalVault = canonicalJSON(vault);
const digest = sha256(utf8(canonicalVault));
```

See [`spec/DIGEST_RULES.md`](./spec/DIGEST_RULES.md).

## CLI

```bash
qal doctor
qal encrypt INPUT --out OUTPUT
qal anchor VAULT --network devnet
qal verify VAULT --network devnet
qal inspect ANCHOR_ADDRESS
qal history VAULT_DIGEST --issuer PUBKEY
qal revoke ANCHOR_ADDRESS
qal supersede OLD_VAULT NEW_VAULT
```

## Repository layout

```text
qev-anchor-layer/
├── spec/                      # protocol, digest, records, threat model
├── programs/qal-anchor/       # Solana program
├── packages/sdk/              # @qira/qal-sdk
├── packages/cli/              # @qira/qal-cli
├── apps/site/                 # bestmemecoins.app
├── apps/verifier/             # standalone Check
├── evidence/devnet/v0.1.2/    # public Devnet receipts (no keys, no phrases)
├── tests/                     # compatibility, tamper, devnet
└── fixtures/
```

## Program (Solana)

```bash
anchor build
anchor test
# deploy only to localnet/devnet — never unaudited mainnet
solana program deploy target/deploy/qal_anchor.so --url devnet
solana program show 6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR --url devnet
```

On-chain accounts hold digests and status only. See [`spec/RECORD_FORMAT.md`](./spec/RECORD_FORMAT.md).

Never commit wallet keypairs, program keypairs, RPC API keys, or lock phrases.

## Security

- [`SECURITY.md`](./SECURITY.md)
- [`DISCLAIMER.md`](./DISCLAIMER.md)
- [`spec/THREAT_MODEL.md`](./spec/THREAT_MODEL.md)

No “unhackable,” “military-grade,” or “quantum-proof” claims. Verified builds ≠ audits.

## License

MIT
