# QAL Studio architecture (proposal, pre-alpha)

## Decision status

**Proposal — partially prototyped, chain integration not implemented.**

Companion to [`SAS_ARCHITECTURE.md`](./SAS_ARCHITECTURE.md). This document
records the product/architecture decisions needed to turn the existing
local-first Studio prototype (`apps/site/studio/`, `apps/site/assets/studio.js`)
into a paid issuer product without breaking what makes QAL credible.

## What already exists (inventory, 2026-08)

| Piece | State |
|-------|-------|
| Local Studio prototype | Create / seal (WebCrypto, phrase-derived key) / revoke / dispute / reopen / verify-local / export vault + record; `localStorage`; `FREE_SOFT_CAP = 3`; chain marked `gated` |
| Commitment page (`studio/c/`) | Status, history timeline, downloads, share link |
| Browser verifier | Fail-closed: official program ID pinned, mainnet blocked, devnet genesis pinned, RPC allowlist |
| Protocol | `anchor_vault` / `set_status` / `transfer_controller` / `supersede_vault`; on-chain transition matrix; `successor_digest` |
| CLI/SDK | `anchor / verify / inspect / history / revoke / supersede` |
| Game (`play.js`) | 6-level onboarding funnel |
| Deployment | Cloudflare Worker static assets → bestmemecoins.app |

The gap between prototype and product is: wallet signing, live program,
hosted share/verify pages, and billing.

## Product hierarchy

```text
QEV            private encrypted envelope (local)
QAL            public commitment protocol (chain)
QAL Studio     issuer workflow product (this doc)
Verticals      bestmemecoins.app (memecoins), qev-model-intake (AI dossiers)
SDK/CLI        developer distribution
```

## Decision 1 — custody (who signs anchors)

This decision shapes everything else. Options:

| Option | Issuer on chain | Billing | Trust story |
|--------|-----------------|---------|-------------|
| **U. User signs** | The user | Cannot meter the anchor itself | Intact: non-repudiable, matches PDA seeds `[QAL_SEED, issuer, digest]` |
| **P. Platform signs** | The platform | Trivial | **Destroyed**: every commitment attributes to us; single point of compromise/subpoena; contradicts `THREAT_MODEL.md` |
| **S. Sponsored** | The user (signs); platform pays | Clean (credits = sponsored txs) | Intact |

**Recommendation: U now, S at program v0.2, P never.**

Constraint found in code: `anchor_vault` declares `init, payer = issuer` —
the issuer both signs and funds rent. True sponsorship (platform pays rent,
user remains sole issuer-signer) requires a v0.2 instruction change:
a separate `payer: Signer` account distinct from `issuer: Signer`. Until
then, users pay their own rent, which is small (see cost model), and the
product charges for the workflow around the anchor, not the anchor.

Consequence for the UI: Studio integrates a wallet adapter; the "Seal &
Commit" transaction is built by the SDK, signed by the user's wallet, and the
Studio backend never holds keys, funds, or the ability to anchor on anyone's
behalf. A Studio database breach must be able to leak **nothing** that lets an
attacker impersonate an issuer.

## Decision 2 — verification stays trustless (invariants)

If people can only check commitments on our website, the website replaces the
chain as the trust root. These invariants are non-negotiable and should be
stated publicly:

1. Every receipt/record the Studio produces is verifiable by the open-source
   CLI/SDK/browser verifier **with the Studio offline or dead**.
2. Hosted verify pages are conveniences: static, open-source, and they perform
   verification client-side against public RPC — never "trust our API".
3. The Studio never becomes a required intermediary for `set_status`,
   `supersede_vault`, or reads.
4. Export (vault + record + receipt) is always available, free tier included.
5. Reading and verifying public commitments is free, forever.

## Decision 3 — what the money buys

Credits pay for **service**, never for protocol permission:

- hosted commitment pages (pretty, stable URLs, embeds/badges)
- history dashboards, team seats, API access
- watchers/alerts ("this commitment changed status") — genuinely valuable:
  supersede/revoke are public but nobody watches the chain by hand
- (v0.2, sponsored mode) covering rent+fees for onboarding users with no SOL
- SLAs for the vertical/enterprise gateway (see qev-platform)

Free tier: local-only Studio exactly as prototyped (`FREE_SOFT_CAP = 3`
soft cap), plus unlimited verification.

### Cost model (current program, devnet-measured sizes)

| Item | Bytes | Rent-exempt cost |
|------|-------|------------------|
| `VaultAnchor` PDA | 180 | ~0.00214 SOL |
| `VaultStatus` PDA | 115 | ~0.00169 SOL |
| Anchor (pair) | — | **~0.0038 SOL** + ~0.000005 tx fee |
| Supersede (new pair) | — | ~0.0038 SOL |
| Program deploy (220 KB) | — | ~1.53 SOL (one-time) |

Anchoring is cheap; pricing must be honest about that. The margin is in the
workflow, monitoring, and hosting — not in reselling ~0.004 SOL of rent.

### Payment hygiene

- Revenue wallet **must be separate** from the grant wallet
  `8976JDnWQqq7uFfwJza82gZSkGj4PMGMY4JLh8b7TDGe` (grant wallet stays
  receive-only for grants, per `STATUS.md`, and is never an authority).
- No token. Restate loudly at every step; the domain invites the assumption.
- Accepting SOL for services has tax/regulatory surface. Get professional
  advice before turning billing on. (This document is not legal advice.)

## Decision 4 — domains

bestmemecoins.app is a strong acquisition wedge for one vertical and a weak
home for issuer infrastructure (serious teams will not cite receipts hosted
there). Split:

| Surface | Domain |
|---------|--------|
| Game, memecoin education, memecoin-flavored Studio entry | bestmemecoins.app |
| QAL Studio (neutral), hosted commitment pages | neutral domain (qira/QAL) |
| Docs, SDK | neutral domain / GitHub |

The game's end screen funnels to Studio ("You just caught a changed
commitment → create a real one"), regardless of domain.

## Decision 5 — SAS (batching) — recommendation

`SAS_ARCHITECTURE.md` options: **A** single-artifact only, **B** Merkle
batching, **C** hybrid.

**Recommendation: C, but only after the single-artifact devnet pilot is
complete and only when triggered.** Concrete trigger: a real workload that
would create ≥ ~1,000 anchors/month (AI receipts, exchange evidence, an
enterprise pilot). Below that, per-item PDAs are simpler, individually
addressable, and cost pennies. Batching earlier adds proof-plumbing
(Merkle paths in receipts, root lifecycle vs leaf lifecycle) with no user to
justify it. Studio's data model should keep a `batch_ref` field reserved so
records don't need a migration when C lands.

## Open boundary — qev-platform

`qev-platform` ("customer-controlled gateway, SDKs, connectors, evidence
packages") overlaps this proposal. Pick one before building:

| Option | Meaning |
|--------|---------|
| Studio ⊂ qev-platform | Studio is the self-serve tier of the platform |
| Studio ≠ platform | Studio = individual/teams UX; platform = enterprise gateway; shared SDK |
| Merge | One product, one repo |

Needs Bryan's call; the wrong outcome is three half-built commercial layers.

## Sequencing gates

```text
1. Devnet deploy + public evidence run          (in progress)
2. Studio ↔ wallet ↔ devnet integration         (chain un-gated on devnet only)
3. Watchers/alerts MVP + hosted pages           (still devnet)
4. Hardening: multisig upgrade authority,
   verified builds, external audit              (funding narrative)
5. Mainnet deploy                               (after 4, never before audit)
6. Billing ON (mainnet)                         (after 5 + counsel review)
```

Rule stated plainly: **no paid mainnet anchoring before an external audit.**
Selling "production evidence" on an unaudited pre-alpha contradicts the
project's own disclaimers and would deserve the distrust it earned.

## Non-goals (near term)

- Token utility of any kind
- Custodial anchoring (option P) — permanently out
- DRM / wallet-gated decryption
- "Truth" claims: QAL proves commitment integrity, not honesty. A liar can
  anchor a lie; what they cannot do is quietly replace it. Marketing copy
  keeps this distinction or loses the only credibility that matters.
