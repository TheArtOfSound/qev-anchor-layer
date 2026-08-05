> **Experimental pre-alpha. Devnet/localnet only. Unaudited. Do not use for production evidence.**  
> Compromised historical program ID: `AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf` — see `docs/COMPROMISED_PROGRAM_ID.md`.  
> Active program ID: `6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR` (keypair **not** in git).

# QAL — QEV Anchor Layer

**Encrypt locally. Anchor publicly. Verify anywhere.**

An open-source **anchor and verification layer** for [QEV](https://github.com/TheArtOfSound/qev-desktop) encrypted artifacts.

> **QEV does not run on-chain.** QEV encrypts locally. The blockchain stores a compact cryptographic commitment about the encrypted vault — not the payload, phrase, or keys.

```text
QEV  = encrypted envelope (local)
QAL  = public seal + registry
Solana = evidence ledger (first adapter)
IPFS/local = optional encrypted-vault storage
```

## Quick start

```bash
pnpm install
pnpm build

# health check (QEV self-test, RPC, wallet, program)
pnpm --filter @qira/qal-cli exec node dist/index.js doctor

# encrypt with QEV (passphrase prompted — never --password)
pnpm --filter @qira/qal-cli exec node dist/index.js encrypt evidence.json --out evidence.qev

# anchor digest to Solana devnet
pnpm --filter @qira/qal-cli exec node dist/index.js anchor evidence.qev --network devnet

# verify later (reads chain; recomputes digest locally)
pnpm --filter @qira/qal-cli exec node dist/index.js verify evidence.qev --network devnet
```

After global/link install of the CLI:

```bash
qal doctor
qal encrypt evidence.json --out evidence.qev
qal anchor evidence.qev --network devnet
qal verify evidence.qev --network devnet
```

## What this is / is not

| Is | Is not |
|----|--------|
| Digest anchoring for QEV vaults | A new blockchain |
| Independent verification | A cryptocurrency or token |
| Revision + revoke/supersede status | A replacement for QEV |
| Solana-first, chain-neutral spec | On-chain encryption |
| Optional IPFS for ciphertext | Default decentralized storage |
| Open protocol + SDK + CLI | Legal notarization |
| | Proof of real-world authorship |
| | A security audit |

## Packages

| Package | Role |
|---------|------|
| `@qira/qal-sdk` | Digest, anchor, verify, storage adapters |
| `@qira/qal-cli` | `qal` command |
| `programs/qal-anchor` | Solana Anchor program |
| `apps/verifier` | Local browser verifier (no vault upload) |

**QEV dependency (pinned):** `@bryan237l/qev-cli@0.30.0`

```ts
import {
  encryptVaultV2,
  decryptVaultV2,
  validateVaultSchemaV2,
  canonicalJSON,
  runSelfTest,
} from "@bryan237l/qev-cli";
```

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
├── spec/                 # protocol, digest, records, threat model
├── programs/qal-anchor/  # Solana program (Anchor)
├── packages/sdk/         # @qira/qal-sdk
├── packages/cli/         # @qira/qal-cli
├── apps/verifier/        # browser verifier
├── tests/                # compatibility, tamper, devnet
└── fixtures/
```

## Program (Solana)

```bash
anchor build
anchor test
# deploy only to localnet/devnet during development
solana program deploy target/deploy/qal_anchor.so --url devnet
solana program show AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf --url devnet
```

On-chain accounts hold digests and registry state only. See [`spec/RECORD_FORMAT.md`](./spec/RECORD_FORMAT.md).

## Security

- [`SECURITY.md`](./SECURITY.md)
- [`DISCLAIMER.md`](./DISCLAIMER.md)
- [`spec/THREAT_MODEL.md`](./spec/THREAT_MODEL.md)

No “unhackable,” “military-grade,” or “quantum-proof” claims. Verified builds ≠ audits.

## License

MIT
