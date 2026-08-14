/**
 * Copy verifier assets into the site (lockfile-only web3, no CDN).
 */
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const root = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(root, "verify", "vendor");
const verifyDir = path.join(root, "verify");

await fs.mkdir(vendorDir, { recursive: true });

// Copy verifier logic from the sibling app, but never clobber a site copy
// that has diverged. The site verifier carries site-only behaviour (hosted
// demo vault + receipt, Studio-envelope messaging); an unconditional copy
// silently deleted it, and `pnpm build` runs inside deploy-devnet.sh.
// Set QAL_SYNC_VERIFIER=1 to force the overwrite on purpose.
const siblingVerifier = path.join(root, "..", "verifier", "verifier.js");
const siteVerifier = path.join(verifyDir, "verifier.js");
const force = process.env.QAL_SYNC_VERIFIER === "1";

async function readOrNull(p) {
  try {
    return await fs.readFile(p, "utf8");
  } catch {
    return null;
  }
}

const [siblingSrc, siteSrc] = await Promise.all([
  readOrNull(siblingVerifier),
  readOrNull(siteVerifier),
]);

if (siblingSrc === null) {
  console.log("No apps/verifier/verifier.js — using site copy as-is");
} else if (siteSrc === null || siblingSrc === siteSrc || force) {
  await fs.writeFile(siteVerifier, siblingSrc);
  console.log(
    force
      ? "Forced verifier.js copy from apps/verifier (QAL_SYNC_VERIFIER=1)"
      : "Copied verifier.js from apps/verifier",
  );
} else {
  console.log(
    "WARNING: apps/site/verify/verifier.js has diverged from apps/verifier/verifier.js — keeping the site copy.\n" +
      "         Reconcile them, or run with QAL_SYNC_VERIFIER=1 to overwrite the site copy.",
  );
}

const pkgDir = path.dirname(require.resolve("@solana/web3.js/package.json"));
const candidates = [
  path.join(pkgDir, "lib", "index.iife.min.js"),
  path.join(pkgDir, "lib", "index.iife.js"),
];
let src = null;
for (const c of candidates) {
  try {
    await fs.access(c);
    src = c;
    break;
  } catch {
    // next
  }
}
if (!src) {
  throw new Error("No lockfile-installed @solana/web3.js IIFE found");
}
await fs.copyFile(src, path.join(vendorDir, "solana-web3.min.js"));
console.log(`Vendor web3: ${src}`);
console.log("Site build complete.");
