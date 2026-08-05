# Security Policy

## Reporting

Report suspected vulnerabilities privately to the repository maintainers
(TheArtOfSound / Qira). Do not open public issues for exploitable flaws in
the Solana program or key handling.

## What QAL is

QAL anchors **cryptographic digests** of QEV encrypted vaults on a public
ledger. QEV encryption remains **local**.

## What QAL is not

- A substitute for QEV passphrase security
- A custody service
- An access-control or DRM system (v0.1)
- An audited smart-contract product (unless an audit report is linked)

## Dependencies

- `@bryan237l/qev-cli@0.30.0` (pinned) — encryption/decryption
- Solana / Anchor runtime
- Optional IPFS HTTP API

Pin and verify dependency integrity in production deployments.

## Program upgrades

Initial deployments **retain upgrade authority** for bug fixes. A later path:

1. Single-key upgrade authority (early development)
2. Multisig upgrade authority
3. Optional immutable deployment after review

Verified builds (Solana program verification metadata) prove source↔binary
correspondence. **Verified ≠ audited.**

## Passphrases

Never pass QEV phrases as CLI flags (`--password`, `--phrase`). Use interactive
prompts or stdin only.
