/**
 * Bundle browser dependencies locally — no CDN at runtime.
 */
import { createRequire } from "node:module";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vendorDir = path.join(__dirname, "vendor");

await fs.mkdir(vendorDir, { recursive: true });

// Prefer IIFE build from @solana/web3.js package if present in monorepo
let src;
try {
  const pkgDir = path.dirname(require.resolve("@solana/web3.js/package.json"));
  const candidates = [
    path.join(pkgDir, "lib", "index.iife.min.js"),
    path.join(pkgDir, "lib", "index.iife.js"),
  ];
  for (const c of candidates) {
    try {
      await fs.access(c);
      src = c;
      break;
    } catch {
      // try next
    }
  }
} catch {
  // fall through
}

if (!src) {
  // Download once at build time with pinned URL (not runtime CDN in the page).
  const url =
    "https://unpkg.com/@solana/web3.js@1.98.2/lib/index.iife.min.js";
  console.log("Fetching pinned @solana/web3.js IIFE for vendor bundle…");
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch web3: ${res.status}`);
  const body = Buffer.from(await res.arrayBuffer());
  const dest = path.join(vendorDir, "solana-web3.min.js");
  await fs.writeFile(dest, body);
  console.log(`Wrote ${dest} (${body.length} bytes)`);
} else {
  const dest = path.join(vendorDir, "solana-web3.min.js");
  await fs.copyFile(src, dest);
  console.log(`Copied ${src} → ${dest}`);
}

console.log("Verifier build complete (static, no runtime CDN).");
