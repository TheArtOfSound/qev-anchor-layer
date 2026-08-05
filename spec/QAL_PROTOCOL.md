# QAL Protocol Specification v0.1.0

**QAL — QEV Anchor Layer**

> Encrypt locally. Anchor publicly. Verify anywhere.

## Architectural boundary (non-negotiable)

**QEV does not run on-chain.** QEV encrypts and decrypts locally. The blockchain
anchors **proof about** an encrypted QEV artifact — never the payload itself.

```text
QEV = the encrypted envelope
QAL = the public seal and registry for that envelope
Solana = the shared evidence ledger (first adapter)
IPFS/local storage = optional home for the encrypted envelope
```

Putting the encrypted vault on-chain would be expensive, permanently public,
and architecturally pointless. The chain holds a compact cryptographic
commitment, ownership/controller information, status, and revision history.

## Pipeline

```text
artifact
  → local QEV encryption
  → canonical vault JSON
  → SHA-256 digest
  → optional encrypted-vault storage (IPFS/local)
  → Solana anchor (digest + metadata)
  → portable verification receipt
```

Verification:

```text
supplied QEV vault
  → validate schema
  → canonicalize
  → recompute SHA-256
  → read Solana record
  → compare digests
  → report match + endorsement state separately
```

## Layering

```text
QAL Core Specification
├── canonical QEV digest rules          (DIGEST_RULES.md)
├── record semantics                    (RECORD_FORMAT.md)
├── revision semantics
├── verification result states          (VERIFICATION_STATES.md)
└── chain adapter interface
    ├── Solana (v0.1)
    ├── EVM (later)
    └── other ledgers (later)
```

The conceptual protocol is **chain-neutral**. Solana is the first implementation.

## Roles

| Role | Meaning |
|------|---------|
| **Issuer** | Wallet that signed the original `anchor_vault` transaction. Immutable. |
| **Controller** | Wallet authorized to set status / transfer control. Starts as issuer. |
| **Verifier** | Anyone who can recompute the digest and read public chain state. |

Wallet anchoring proves control of the anchoring wallet at anchor time.
It does **not** prove real-world authorship of the plaintext.

## What belongs on-chain

- Vault digest (32 bytes)
- QEV schema hash (32 bytes)
- Optional content-reference hash (32 bytes)
- Optional parent digest (32 bytes)
- Issuer and controller pubkeys
- Creation / update slots
- Endorsement status (active / revoked / superseded / disputed)
- Compact flags

## What must never go on-chain

- Plaintext
- QEV passphrase
- Derived Argon2id key
- QEV content key
- Private encryption keys
- Recovery material
- Sensitive unencrypted document labels/names

A CID is **not confidential**. Default mode is **digest-only**.

## v0.1 scope

**In:** encrypt (via QEV), anchor, verify, inspect, history, revoke, supersede,
optional IPFS adapter, CLI, SDK, browser verifier, specs, tests.

**Out:** tokens, NFTs, DAO, wallet-based decryption, fake access control,
hosted accounts, legal notarization claims, custom crypto primitives.

Wallet-controlled sharing / revocable decryption is **QAL v0.2**, after QEV
exposes a stable recipient-wrap path.

## Version

- Protocol: `0.1.0`
- Receipt field: `protocol: "QAL"`, `protocol_version: "0.1.0"`
