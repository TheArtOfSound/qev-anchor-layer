# Security Policy

## Status

**Experimental pre-alpha. Devnet/localnet only. Unaudited.**  
**Do not use for production evidence or security-sensitive workflows.**

## Reporting

Report suspected vulnerabilities privately to the repository maintainers
(TheArtOfSound / Qira). Do not open public issues for exploitable flaws in
the Solana program or key handling.

## Compromised program ID

See [`docs/COMPROMISED_PROGRAM_ID.md`](./docs/COMPROMISED_PROGRAM_ID.md).

The original committed keypair / program ID is permanently untrusted.

## What QAL is

QAL anchors **cryptographic digests** of QEV encrypted vaults on a public
ledger. QEV encryption remains **local**.

A matching digest proves:

> This exact encrypted envelope matches what was committed.

It does **not** prove real-world authorship, legal notarization, or that the
underlying plaintext is true.

## What QAL is not

- A substitute for QEV passphrase security
- A custody service
- Wallet-based access control / DRM (v0.1)
- An audited smart-contract product
- Mainnet-ready infrastructure
- A token or investment product

## Verification guarantees (v0.1.1)

Fail-closed verification requires:

- expected program owner on accounts
- exact account discriminators
- supported account version
- PDA consistency for stored issuer + digest
- schema hash comparison
- status account presence (missing → `STATUS_NOT_FOUND` / `INDETERMINATE_STATUS`, **not** active)
- unknown status codes fail closed
- receipt-directed path for meaningful `DIGEST_MISMATCH`

## Passphrases

Never pass QEV phrases as CLI flags (`--password`, `--phrase`).

## Program upgrades

Pre-alpha deployments may retain upgrade authority for fixes. Path:

1. Single-key upgrade authority (early)
2. Multisig
3. Optional immutability after review

Verified builds ≠ audits.

## Dependencies

- `@bryan237l/qev-cli@0.30.0` (pinned; doctor fails on mismatch)
- Solana / Anchor
- Optional IPFS HTTP API

## Explicit non-claims

No “unhackable,” “military-grade,” or “quantum-proof” claims.
