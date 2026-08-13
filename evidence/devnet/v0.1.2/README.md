# QAL v0.1.2 — experimental Solana Devnet evidence

> Experimental. Unaudited. Devnet only. **Not production proof.** No token.

## Status

**Live on Devnet as of 2026-08-13.**

| Item | Value |
|------|--------|
| Program | `6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR` |
| Deploy tx | `2G4pDhJ8b1ZWFjNzUcorMGTbKpVTqhk6Yqa6R3srBwkT3K4qnYWUc5Sa32HzyL8DpTo6oPW4eG54pQz9opSHKrkt` |
| Upgrade authority | `3ZYTW6D7J5NRZTekzvb51GP2RfUawkviJgXuxy3rcWnz` (not the grant wallet) |
| Integration test | PASS — lock → stamp → check → fake file fails → take back → replace |

Grant receive wallet `8976JDnWQqq7uFfwJza82gZSkGj4PMGMY4JLh8b7TDGe` was **not** used as authority.

## What this proves

- A locked file’s fingerprint can be posted
- A changed file does **not** match (`DIGEST_MISMATCH`)
- Taking it back still matches the file (`VALID_REVOKED`)
- A new version can replace the old one, with the parent fingerprint kept

It does **not** prove the words are true. A liar can still lock a lie.

## Explorer

See [`explorer-links.md`](./explorer-links.md).

## Never commit

- Wallet / program keypairs, seed phrases
- Private RPC credentials
- Lock phrases, plaintext, decrypted content

## Label

**Experimental pre-alpha. Devnet only. Unaudited. Do not use for production evidence. No token.**
