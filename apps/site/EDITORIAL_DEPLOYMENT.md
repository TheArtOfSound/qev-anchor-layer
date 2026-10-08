# QAL — The Receipt Issue / art direction sim2

## Production (2026-10-08)
- Site: https://bestmemecoins.app/ and https://www.bestmemecoins.app/
- Production router: `qal-editorial-router`
- Active deployed Worker version: `1865a091e78e411e9374a4751a7d23ad`
- Source of truth: `apps/site/editorial-router.js`, contains **complete HTML/CSS/JS and fetch handler**.
- Git commit with latest source: `8792c55986f99c3078f08b01196eedc7276b0b51`.
- Runtime data source: Cloudflare service binding `QAL_ORIGIN` → Worker `qal-web`.
- Existing apex and www Worker routes both point to `qal-editorial-router`; neither DNS nor payment destinations were changed.

### Design coverage
Only `GET /` and `GET /fund/` (also `/fund`) are HTML-transformed.
The router directly serves `/_qal/design-v2.css` and `/_qal/design-v2.js` from constants in its source.
It forwards every other path and all other HTTP methods unchanged to the original `qal-web` Worker.

- The v2b finishing pass also brings the original interactive game stage, process marks and controls into the same art direction without changing game logic.
- Homepage: high-contrast editorial hero, clearly illustrative original/edited file demonstration, interactive change highlighting, 2-minute demo CTA, real Devnet proof CTA, branded ticker, graphic demo introduction, improved cards, independent support CTA, existing funding component.
- Funding: distinct dark hero, real milestones, CTA scroll to original wallet and live balance, all original donation notices and wallet.
- Known boundary: this version does not replace the visual design of every internal QAL page. Existing evidence, verifier, and Studio routes remain served by the original Worker.

### Preview & production evidence
- Preview Worker: `qal-art-v2-preview` / version `07bc890992034716aeb631bbcfa58962` (same source).
- Browser snapshots checked the homepage at desktop and mobile widths, and donation page on desktop.
- JavaScript-enabled checks (390px and 1366px) confirmed CSS applies, the comparison button sets `aria-pressed=true` and `.is-revealed`, and no horizontal document overflow was detected at these widths.
- Production browser content checks succeeded for apex, www, `/fund/`, `/verify/`, `/studio/`, `/evidence/devnet/`, and both design assets. The final v2b production check also confirmed numbered learning-pipeline marks on apex and www.
- The funding wallet remains `8976JDnWQqq7uFfwJza82gZSkGj4PMGMY4JLh8b7TDGe`; no destination changed.
- End-to-end Solana transactions, donations, third-party wallet compatibility and all gameplay branches were **not** executed as part of this graphic-design release.

### Rollback
Option A (quick): set both existing `bestmemecoins.app/*` and `www.bestmemecoins.app/*` Worker routes back to `qal-web`; original static site and RPC remain intact.
Option B (previous editorial): redeploy the preceding `qal-editorial-router` version `d39aa44096034aaaa5c755536a6fc99a` if this remains available in version history. Verify the bound service and routes after either action.

### Re-deployment
Fetch `apps/site/editorial-router.js` from GitHub. Upload as `worker.mjs` with Cloudflare Worker module metadata:
```json
{"main_module":"worker.mjs","compatibility_date":"2026-08-05","bindings":[{"name":"QAL_ORIGIN","type":"service","service":"qal-web"}]}
```
Then verify apex + www homepage, fund page, CSS and JS endpoints, and the unchanged verifier, proof and Studio routes. Do not replace QAL Origin Static Assets, modify the Solana wallet address, or suppress the security and non-audited notices to simplify marketing.

## Beginner-first guided simulation (2026-10-08 sim2)
- Replaces the default homepage six-level game experience with a single fictional policy document and three stages: save original text, choose original versus altered text, compare SHA-256.
- The browser's native Web Crypto SHA-256 hashes canonical demo strings, without remote upload, wallet interaction, blockchain transaction or permanent persistence. The result proves equality/inequality of the example bytes only; it does **not** certify a true statement, malicious intent or an on-chain entry.
- The altered case uses a 24-hour withdrawal window changed to 72 hours; the unchanged case keeps 24 hours.
- The original six-level game and Three.js scene remain intact inside `#qa-advanced` and load their original game and scene scripts only when clicked. The existing QAL Origin scripts, proofs, assets, funding code and wallet are unchanged.
- The homepage primary CTA now targets `#try-it` rather than the hidden advanced game. Beginner-first simulation CSS/JS are served by the editorial router as `/_qal/design-v2.css` and `/_qal/design-v2.js`, version `20261008-sim2`.
- Production browser test: apex 390px and www 1366px SHA-256 altered-case interaction produced `MISMATCH. YOU CAUGHT THE CHANGE.`, mobile terms `72 HOURS`, and no horizontal overflow. Preview browser test confirmed unchanged-case `MATCH. THE TEXT DID NOT CHANGE.` and that advanced original game opens and initializes. Apex, www, fund, verifier, proof, Studio and new CSS/JS all returned 200 in production.
- Prior production router version before the sim2 change: `0b5f650f5fc9440580f76820087fa323`. Follow standard route or Worker version rollback in the section above. Preserve the working `QAL_ORIGIN` service binding during redeploy.
