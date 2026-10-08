# QAL interface system: editorial, proof-first

Production: https://bestmemecoins.app
Implemented in `apps/site/editorial-router.js`; Worker `qal-editorial-router`, with `QAL_ORIGIN` service binding to the existing `qal-web` Worker.

## Design objectives
One visual language across all 12 public HTML routes, with the complexity of each page proportional to its job. Visitors should first see the task, then the explanation, then the evidence. Never market a local practice action as a real Devnet stamp.

## Shared visual primitives
- Colors: background `#f4f5ed`, deep ink `#0e2026`, lime `#d9ff71`, muted teal borders `#b9cec2`, error/qualification amber.
- Typography: Space Grotesk where allowed, followed by the existing IBM Plex Sans and system sans-serif; IBM Plex Mono for labels, addresses, status, and provenance. **The verifier's CSP may prevent remote fonts; it must remain legible with local fallbacks.**
- Squared 2px-radius panels, editorial large headings, compact mono labels, purposeful negative space. No gratuitous pill collections or visual noise.
- Shared `qa-interior-hero` with a unique title, clear introduction, two factual links, and a graphic drawn in CSS (no extra image download); category-specific tab navigation with an `aria-current` active page.
- Design tokens and CSS are encapsulated as `QA_CSS` and `QA_INTERIOR_CSS` in the router; the extra public stylesheet is `/_qal/interior.css`. The router injects `/_qal/design-v2.css` before `/_qal/interior.css`.
- `qa-interior-end` adds an optional funding CTA. It is explicitly not an investment or token purchase.
- Mobile utility pages compact the hero and remove decorative art so forms and verifiers are closer to the top of the page. Navigation wraps. Focus outlines and reduced-motion preferences are supported.

## Pages covered
- `/` — editorial hero, beginner SHA-256 simulation and optional legacy six-level game.
- `/fund/` — community support and existing original wallet/balance UI.
- `/learn/` — conceptual entry and wayfinding.
- `/memecoins/` — the problem and specific risks.
- `/docs/` — implementation explanation.
- `/security/` — security limits and compromised-program disclaimer; the warning must remain visible.
- `/devs/` — SDK/protocol guidance.
- `/studio/` — existing practice workspace, local only.
- `/studio/new/` — existing claim form; unmodified field names or submit behavior.
- `/studio/c/` — existing dynamic practice claim view; no change to local history or digest.
- `/verify/` — existing file picker, demo, receipt, Devnet, and result logic. The page retains its Content-Security-Policy.
- `/evidence/devnet/` — existing public explorer links, program IDs and live state logic.

## Safety boundary
This release is **presentation only**. The original HTML is fetched from `qal-web`, and the router transforms only a whitelist of GET HTML paths. If a recognized page's expected structure changes, the transform returns null and its original HTML is served. The Worker forwards RPC, evidence JSON, verifier JS, Studio JS, script assets, files and all non-GET traffic untouched.

Never edit, mask or invent the status of public proof, the chain/network, the compromised-program warning or the donation wallet as part of a visual redesign. Keep the distinction between local simulation, Studio practice, and public Devnet transactions unmistakable.

## Release and verification (2026-10-08)
- Preview Worker: `qal-art-v2-preview`; latest tested version `1e1159d57ed14bc5a817c110a545ee3f`.
- Production Worker: `qal-editorial-router`; deployed version `bab0a9b3db0f4eef87ede21c757e6e07`.
- 10/10 interior routes returned HTTP 200 with `/_qal/interior.css?v=20261008-all3`, an editorial hero, category navigation, and intact original feature scripts.
- Responsive checks at mobile (390px) covered all 10 interior routes in preview; 9 passed scripted no-overflow checks. The verifier forbids script injection via CSP, so it was verified by its actual rendered mobile screenshot and resource/content checks, not a DOM injection test.
- Desktop checks covered architecture, why, Studio; homepage and fund page checked as regressions.
- Production smoke checks: 12 site HTML routes plus interior stylesheet returned 200; both `bestmemecoins.app` and `www` continue to route to this Worker (verified at deployment); the homepage still includes the SHA-256 simulation, and the original SOL donation address remains present on `/fund/`.
- These are presentation/route tests, not a complete transaction, cryptographic, accessibility or cross-browser validation of every existing workflow.

## Rollback
Quick: re-point the two Cloudflare zone routes `bestmemecoins.app/*` and `www.bestmemecoins.app/*` to original `qal-web`.
Alternatively: redeploy the preceding `qal-editorial-router` Worker version `1865a091e78e411e9374a4751a7d23ad` (design on homepage and funding only). Keep `QAL_ORIGIN` bound to `qal-web`. No DNS, RPC, wallet, or storage migration was introduced.
