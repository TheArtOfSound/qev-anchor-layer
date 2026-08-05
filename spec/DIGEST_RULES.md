# QAL Digest Rules

## Definition

```text
digest = SHA-256( UTF-8( canonicalJSON( vault ) ) )
```

- Algorithm: **SHA-256**
- Encoding of digest for receipts/CLI: **lowercase hex** (64 characters)
- On-chain storage: **32 raw bytes**

The digest commits to the **complete** QEV vault object after schema validation.

## Canonicalization

QAL uses the public QEV export:

```ts
import { canonicalJSON, validateVaultSchemaV2 } from "@bryan237l/qev-cli";

validateVaultSchemaV2(vault);
const canonicalVault = canonicalJSON(vault);
const bytes = new TextEncoder().encode(canonicalVault);
const digest = sha256(bytes);
```

`canonicalJSON` invariants (from QEV):

1. Object keys are sorted **recursively**.
2. No whitespace in the output.
3. Strings/numbers/booleans/null use `JSON.stringify` rules.
4. Arrays preserve element order.

Therefore:

- Pretty-printed vs compact JSON of the same logical vault → **same digest**
- Reordered object keys → **same digest**
- Changing one ciphertext byte → **different digest**
- Changing bound metadata → **different digest**

## Schema support (v0.1)

| Schema | Supported |
|--------|-----------|
| `BRY-NFET-SX-VAULT-V2` | Yes |
| `BRY-NFET-SX-VAULT-V1` | No (explicit failure) |
| Other | No (explicit failure) |

Unsupported or malformed vaults **must fail before anchoring**.

## Schema hash (on-chain field)

```text
qev_schema_hash = SHA-256( UTF-8( schema_string ) )
```

Example: SHA-256 of `BRY-NFET-SX-VAULT-V2`.

## Content reference hash

When an optional external reference is associated (e.g. `ipfs://bafy…`):

```text
content_ref_hash = SHA-256( UTF-8( normalized_reference ) )
```

Normalization: trim whitespace. Empty / null → 32 zero bytes.

The full reference string may live in the local receipt; only the hash is on-chain.

## Parent digest

Revision lineage:

```text
parent_digest = previous vault's digest bytes, or 32 zero bytes if none
```

## Non-goals

- Do **not** hash only ciphertext — metadata is part of the vault identity.
- Do **not** silently drop unknown fields before hashing.
- Do **not** depend on filesystem mtime or local path.

## Fixtures

See `fixtures/expected-digests.json` and tests under `tests/compatibility/` and
`tests/tamper/`.

SDK, CLI, and browser verifier **must** produce identical digests for the same vault.
