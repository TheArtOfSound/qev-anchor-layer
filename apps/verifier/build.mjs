/**
 * Bundle browser dependencies from the lockfile-installed package only.
 * No network fallback. Fail if the artifact is missing.
 */
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(__dirname, "vendor");

await fs.mkdir(vendorDir, { recursive: true });

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
    // try next
  }
}

if (!src) {
  throw new Error(
    `Reproducible verifier build failed: no IIFE build found under ${pkgDir}/lib. ` +
      `Install @solana/web3.js from the lockfile; network fallback is disabled.`,
  );
}

const dest = path.join(vendorDir, "solana-web3.min.js");
await fs.copyFile(src, dest);
const bytes = await fs.readFile(dest);
const sha = createHash("sha256").update(bytes).digest("hex");
console.log(`Copied ${src} → ${dest}`);
console.log(`SHA-256: ${sha}`);
console.log(`Bytes: ${bytes.length}`);

// Fail if anyone left remote script URLs in verifier sources
const sources = ["verifier.js", "index.html"];
for (const f of sources) {
  const text = await fs.readFile(path.join(__dirname, f), "utf8");
  if (/https?:\/\/[^"'\s]+/i.test(text) && /script/i.test(text)) {
    // allow only comments that mention https without loading
  }
  // Block explicit remote script tags / CDN hosts used as executable sources
  if (
    /src\s*=\s*["']https?:\/\//i.test(text) ||
    /unpkg\.com|cdn\.jsdelivr|cdnjs\.cloudflare/i.test(text)
  ) {
    throw new Error(`Remote executable URL found in ${f} — not allowed`);
  }
}

console.log("Verifier build complete (lockfile-only, no network, no runtime CDN).");
