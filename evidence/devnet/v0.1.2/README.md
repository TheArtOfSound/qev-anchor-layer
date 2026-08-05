# QAL v0.1.2 — experimental Solana devnet evidence

> This is an experimental Solana devnet deployment of QAL v0.1.2. It is
> **unaudited** and **unsuitable for production evidence**. The included
> transactions demonstrate encryption-envelope digest anchoring, receipt
> verification, revocation, and atomic supersession on devnet.

## Status

**Pending live deployment.** Public faucet rate limits blocked funding of the
dedicated deploy authority in the automated session. After funding, run:

```bash
./scripts/deploy-devnet.sh
```

## Official program ID

```text
6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR
```

## What must be filled after deploy

| File | Content |
|------|---------|
| `source-commit.txt` | `git rev-parse HEAD` |
| `program-id.txt` | Official program ID |
| `genesis-hash.txt` | `solana genesis-hash --url devnet` |
| `deployment-transaction.txt` | Deploy tx signature |
| `program-data.json` | `solana program show … --output json` |
| `upgrade-authority.txt` | Deploy authority pubkey |
| `binary-sha256.txt` | `shasum -a 256 target/deploy/qal_anchor.so` |
| `anchor-receipt.json` | First anchor receipt |
| `anchor-transaction.txt` | Anchor tx |
| `revoke-transaction.txt` | Revoke tx |
| `supersede-transaction.txt` | Atomic supersede tx |
| `vault-digests.json` | Digests + PDAs |
| `explorer-links.md` | Explorer URLs |
| `test-output.txt` | `QAL_DEVNET=1` test log |

## Never commit

- Wallet / program keypairs, seed phrases  
- Private RPC credentials  
- QEV passphrases, plaintext, decrypted content  

## Grant receive wallet (not deploy authority)

```text
8976JDnWQqq7uFfwJza82gZSkGj4PMGMY4JLh8b7TDGe
```

## Label

**Experimental pre-alpha. Devnet only. Unaudited. Do not use for production evidence. No token.**
