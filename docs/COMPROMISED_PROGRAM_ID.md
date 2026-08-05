# Compromised program identity

## Historical (DO NOT USE)

```text
AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf
```

This program ID was committed to git together with a full 64-byte keypair in the
initial monorepo commit. The secret material is permanently exposed in git history.

**Consequences:**

* Never deploy this ID to mainnet.
* Never treat it as a trusted production program identity.
* SDK/CLI refuse receipts that reference this program ID.
* Anyone can attempt to front-run this identity on clusters where it is not yet claimed.

Removing the keypair file from later commits does **not** undo exposure.

## Active pre-alpha identity (v0.1.1+)

```text
6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR
```

The corresponding keypair is **not** in this repository. Local deployers must generate
or store it outside git, for example:

```bash
# keypair location used by maintainers (example)
ls ~/.config/qal/qal-anchor-program-keypair.json
mkdir -p target/deploy
cp ~/.config/qal/qal-anchor-program-keypair.json target/deploy/qal_anchor-keypair.json
anchor build
anchor deploy --provider.cluster devnet
```

If you do not have this keypair, generate a **new** program keypair for your own
fork/deployment and update `declare_id!` / `Anchor.toml` / SDK network config
accordingly. Do not reintroduce a committed keypair.
