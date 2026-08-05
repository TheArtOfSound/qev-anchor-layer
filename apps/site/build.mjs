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

// Copy verifier logic from sibling app if present, else keep local
const siblingVerifier = path.join(root, "..", "verifier", "verifier.js");
try {
  await fs.copyFile(siblingVerifier, path.join(verifyDir, "verifier.js"));
  console.log("Copied verifier.js from apps/verifier");
} catch {
  console.log("Using apps/site/verify/verifier.js as-is");
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
