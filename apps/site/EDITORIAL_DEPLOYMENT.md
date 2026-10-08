# QAL editorial production router — October 8, 2026

Source: `apps/site/editorial-router.js`.

Production domain `bestmemecoins.app` and `www.bestmemecoins.app` are configured through Cloudflare Worker routes, both targeting `qal-editorial-router`.

This router has a Cloudflare service binding `QAL_ORIGIN` to the original `qal-web` Worker (not an HTTP redirect). It preserves the deployed Workers Static Assets, protected Devnet RPC, security metadata, existing wallet, and all application routes. Only GET `/` and `/fund/` HTML receive the editorial replacement.

**Important:** QAL's Workers Static Assets are served before user code on routes other than `/rpc`, so putting the replacement into `qal-web` alone does **not** show it in production. The router executes first on the registered domain routes, then forwards every request through the original Worker.

To reproduce, deploy `editorial-router.js` as an ES module Worker named `qal-editorial-router`, with service binding `QAL_ORIGIN` pointing at `qal-web`. Verify the public site after updating BOTH zone routes. Never change the donation address, RPC handling, program IDs, or evidence data during a visual update.

Rollback: change the two existing `bestmemecoins.app/*` and `www.bestmemecoins.app/*` Worker routes back to `qal-web`, retaining the original script and asset bundle. No DNS changes are needed.

Production smoke test: GET `/` and `/fund/` must include `id="qal-editorial-20261008"`; GET `/verify/`, `/studio/`, and `/evidence/devnet/` must return their original site content. Browser-check desktop and mobile layouts and check that interactive game/proof/donation scripts still run.
