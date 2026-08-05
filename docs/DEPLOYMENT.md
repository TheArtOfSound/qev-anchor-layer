# QAL Program Deployment

Deploy only to **localnet** and **devnet** during initial development.

## Prerequisites

- `solana` CLI
- `anchor` 1.0.x
- Wallet with SOL on the target cluster (`~/.config/solana/id.json`)

## Build

```bash
cd qev-anchor-layer
anchor build
```

Binary: `target/deploy/qal_anchor.so`  
Keypair: `target/deploy/qal_anchor-keypair.json`  
Program ID: `AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf`

## Localnet

```bash
solana-test-validator
# other terminal
solana config set --url localhost
anchor deploy
```

## Devnet

```bash
solana config set --url https://api.devnet.solana.com
solana airdrop 2   # if faucet allows
anchor deploy --provider.cluster devnet
# or
solana program deploy target/deploy/qal_anchor.so \
  --program-id target/deploy/qal_anchor-keypair.json \
  --url devnet
```

## Record after each deploy

| Field | Value |
|-------|--------|
| Program ID | |
| Upgrade authority | |
| Source commit | `git rev-parse HEAD` |
| `rustc` / `solana` / `anchor` versions | |
| Deployment transaction | |
| Cluster | localnet / devnet |
| Program binary hash | `sha256sum target/deploy/qal_anchor.so` |

## Initialize protocol

After deploy, the first `qal anchor` call auto-runs `initialize_protocol` if needed.

## Upgrade path

1. **Early:** single-key upgrade authority (current)
2. **Next:** multisig upgrade authority
3. **Later:** immutable deployment after review + optional verified build metadata

Do **not** make the program immutable during early development.

## Verified builds

See [Solana verified builds](https://solana.com/docs/programs/verified-builds).  
Verified source correspondence ≠ security audit.
