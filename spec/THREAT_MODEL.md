# QAL Threat Model (v0.1)

## Assets

- Confidentiality of plaintext (provided by **QEV**, not QAL)
- Integrity of the binding between a vault bytestring and a public commitment
- Integrity of endorsement status transitions (controller authorization)
- Availability of verification (RPC / ledger readability)

## Trust boundaries

| Component | Trust assumption |
|-----------|------------------|
| User endpoint | Must be uncompromised for phrase entry and encryption |
| QEV library (`@bryan237l/qev-cli`) | Correct crypto implementation |
| npm supply chain | Packages not maliciously substituted |
| Solana validators / RPC | Liveness and honest read of public state |
| Wallet / keypair | Issuer and controller keys not stolen |
| Optional IPFS | Ciphertext may be public; CID is not secret |

## In scope for QAL v0.1

- Detect tampering with vault bytes after anchoring (digest mismatch)
- Public, independently checkable commitment to a vault
- Controller-authorized status changes without erasing history
- Clear separation of match vs endorsement

## Out of scope / not protected

QAL does **not** protect against:

- Compromised endpoints (keyloggers, malware)
- Weak or exposed QEV phrases
- Malicious npm dependencies
- Wallet compromise
- RPC censorship or temporary unavailability
- Incorrect real-world identity claims (“this wallet is Alice”)
- Authorized parties copying decrypted plaintext
- Permanent public availability of published ciphertext / CIDs
- Loss of the only QEV phrase
- Bugs in Solana, Anchor, wallet adapters, or QEV
- Smart-contract vulnerabilities before independent review

## Explicit non-claims

- Not unhackable / military-grade / quantum-proof
- Not legal notarization
- Not proof of authorship of plaintext
- Not proof that verified builds equal audited security
- Not wallet-based access control or revocable decryption (v0.2)

## Residual risks

1. **Issuer ≠ author** — anyone can encrypt and anchor any ciphertext.
2. **CID correlation** — optional IPFS mode leaks size/access patterns.
3. **Upgrade authority** — early deployments use a single upgrade key; document
   path to multisig / immutability after review.
4. **PDA requires issuer** — verifiers need the issuer pubkey (receipt or known wallet).
