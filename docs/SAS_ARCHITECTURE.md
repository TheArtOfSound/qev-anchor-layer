# SAS architecture decision (pre-alpha)

## Decision status

**Open — document only. Not implemented.**

QAL v0.1.1 remains a **single-artifact** digest anchor protocol.

## Why “hash a vault on Solana” is not enough alone

Hash anchoring is easy to reproduce. The moat is not the contract; it is the
end-to-end private evidence workflow:

* local-first encrypted envelopes (QEV)
* deterministic commitment rules
* fail-closed independent verification
* revision / revocation semantics
* optional enterprise batching

## Candidate future: Structured Attestation Sets (SAS)

Working name for a **batching + typed evidence** layer above QAL digests:

```text
many QEV vault digests
        ↓
Merkle tree (or similar accumulator)
        ↓
one Solana root anchor
        ↓
portable Merkle proofs per leaf
```

### Goals

1. **Economics:** thousands of AI/crypto receipts without one PDA pair per item.
2. **Semantics:** optional `subject_digest` (document/manifest identity) separate
   from `vault_digest` (exact randomized encrypted envelope).
3. **Privacy:** document that low-entropy subject digests are dictionary-attackable.
4. **Verification:** leaf proofs remain independently checkable against a root
   that was fail-closed verified on-chain.

### Non-goals (near term)

* Token utility
* Mainnet
* Wallet-based decryption / DRM

### Relation to Solana Attestation Service (if any)

Evaluate Solana’s attestation primitives as an optional adapter, not a hard
dependency. QAL core stays chain-adapter-neutral.

## Decision required before pilot

Choose one:

| Option | Implication |
|--------|-------------|
| **A. Stay single-artifact** | QAL only; high-value low-volume evidence |
| **B. Add SAS batching** | Enterprise AI receipt scale path |
| **C. Hybrid** | Single-artifact default + optional batch roots |

Recommendation for funding narrative: **C** after security remediation and one
live devnet pilot of A.

This file records the decision space; implementation waits on Bryan’s choice.
