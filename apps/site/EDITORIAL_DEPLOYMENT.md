# QAL — The Receipt Issue / art direction v2b

## Production (2026-10-08)
- Site: https://bestmemecoins.app/ and https://www.bestmemecoins.app/
- Production router: `qal-editorial-router`
- Active deployed Worker version: `0b5f650f5fc9440580f76820087fa323`
- Source of truth: `apps/site/editorial-router.js`, contains **complete HTML/CSS/JS and fetch handler**.
- Git commit with latest source: `4fb56394a5b78439a8df771ee8c8c11d0cee4530`.
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
