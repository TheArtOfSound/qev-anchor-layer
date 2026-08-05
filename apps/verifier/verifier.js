/**
 * Minimal browser verifier for QAL.
 * - Canonical JSON + SHA-256 locally (Web Crypto)
 * - Reads public Solana account data via JSON-RPC
 * - Does not upload the vault
 *
 * Note: full QEV schema validation uses the Node QEV package in CLI/SDK.
 * Browser path validates structural V2 shape + schema string, then digests.
 */

const QEV_SCHEMA_V2 = "BRY-NFET-SX-VAULT-V2";
const PROGRAM_ID = "AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf";
const QAL_SEED = new TextEncoder().encode("qal");
const STATUS_SEED = new TextEncoder().encode("status");

/** Recursive sorted-keys JSON — must match QEV canonicalJSON. */
function canonicalJSON(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJSON).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  const parts = keys.map(
    (k) => JSON.stringify(k) + ":" + canonicalJSON(value[k]),
  );
  return "{" + parts.join(",") + "}";
}

async function sha256Hex(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function validateVaultShape(vault) {
  if (!vault || typeof vault !== "object" || Array.isArray(vault)) {
    throw Object.assign(new Error("Vault malformed: not an object"), {
      code: "MALFORMED_QEV",
    });
  }
  if (vault.schema !== QEV_SCHEMA_V2) {
    throw Object.assign(
      new Error(`Unsupported QEV schema: ${vault.schema}`),
      { code: "UNSUPPORTED_QEV_SCHEMA" },
    );
  }
  for (const k of ["version", "created_at", "mode", "kdf", "wrap", "content"]) {
    if (!(k in vault)) {
      throw Object.assign(new Error(`Vault malformed: missing ${k}`), {
        code: "MALFORMED_QEV",
      });
    }
  }
}

// Minimal base58 decode for pubkey bytes (browser, no deps)
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b58decode(str) {
  const bytes = [0];
  for (const c of str) {
    const val = B58.indexOf(c);
    if (val < 0) throw new Error("Invalid base58");
    let carry = val;
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58;
      bytes[i] = carry & 0xff;
      carry >>= 8;
    }
    while (carry > 0) {
      bytes.push(carry & 0xff);
      carry >>= 8;
    }
  }
  for (const c of str) {
    if (c === "1") bytes.push(0);
    else break;
  }
  return new Uint8Array(bytes.reverse());
}

function b58encode(bytes) {
  let zeros = 0;
  while (zeros < bytes.length && bytes[zeros] === 0) zeros++;
  const digits = [0];
  for (let i = zeros; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = "1".repeat(zeros);
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]];
  return out;
}

// ed25519 PDA derivation needs findProgramAddress — use RPC getProgramAccounts
// is heavy. Instead we derive client-side with sha256 + off-curve check via
// Tweet-free approach: call a tiny WebAssembly-free PDA finder using
// Solana's documented algorithm with Web Crypto SHA-256.

async function createProgramAddress(seeds, programIdBytes) {
  const parts = [];
  for (const s of seeds) parts.push(s);
  parts.push(programIdBytes);
  parts.push(new TextEncoder().encode("ProgramDerivedAddress"));
  const totalLen = parts.reduce((n, p) => n + p.length, 0);
  const buf = new Uint8Array(totalLen);
  let o = 0;
  for (const p of parts) {
    buf.set(p, o);
    o += p.length;
  }
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", buf));
  // Reject if on ed25519 curve — simplified: Solana uses is_on_curve.
  // For browser verifier we still try bumps; most PDAs are off-curve.
  // We use a pure JS point check would be large; instead we ask RPC by
  // trying bumps until getAccountInfo hits — but we need the address.
  // Include is_on_curve via tweetnacl-free: use @noble if available.
  // Fallback: compute all 256 bumps and check which account exists (too heavy).
  // Practical approach: export a simple curve check.
  if (isOnCurve(hash)) {
    throw new Error("Invalid seeds: address on curve");
  }
  return hash;
}

// Minimal ed25519 on-curve check (Solana PDA requirement)
// Port of solana_sdk pubkey::is_on_curve using field arithmetic would be long.
// Use: try bump from 255 downward; create hash; skip is_on_curve false positives
// by verifying via RPC getAccountInfo on candidate — if program wrote it, OK.
// For correctness matching Solana, we implement a compact check.

function isOnCurve(_p) {
  // Without full ed25519 field ops, return false so createProgramAddress accepts
  // the first hash. This can theoretically collide with on-curve points (~50%
  // of hashes). Proper PDA needs full check. We therefore implement find with
  // bump loop and RPC confirmation as authority.
  return false;
}

async function findProgramAddress(seeds, programIdStr) {
  const programIdBytes = b58decode(programIdStr);
  for (let bump = 255; bump >= 0; bump--) {
    try {
      const addr = await createProgramAddress(
        [...seeds, new Uint8Array([bump])],
        programIdBytes,
      );
      // Without on-curve filter, first bump (255) always "works" but may be wrong.
      // We improve: use @solana/web3.js if loaded; else document limitation.
      return { address: b58encode(addr), bump };
    } catch {
      continue;
    }
  }
  throw new Error("Unable to find PDA");
}

// Load solana web3 from CDN for correct PDA + connection
async function loadSolana() {
  if (window.solanaWeb3) return window.solanaWeb3;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/@solana/web3.js@1.98.2/lib/index.iife.min.js";
    s.onload = resolve;
    s.onerror = () => reject(new Error("Failed to load @solana/web3.js"));
    document.head.appendChild(s);
  });
  return window.solanaWeb3;
}

function statusName(code) {
  return ["active", "revoked", "superseded", "disputed"][code] ?? "unknown";
}

function decodeAnchor(data) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  let o = 8;
  const version = u8[o++];
  const bump = u8[o++];
  const issuer = u8.slice(o, o + 32);
  o += 32;
  const controller = u8.slice(o, o + 32);
  o += 32;
  const vaultDigest = u8.slice(o, o + 32);
  o += 32;
  const schemaHash = u8.slice(o, o + 32);
  o += 32;
  const contentRef = u8.slice(o, o + 32);
  o += 32;
  const parent = u8.slice(o, o + 32);
  o += 32;
  const slotView = new DataView(u8.buffer, u8.byteOffset + o, 8);
  const createdSlot = Number(slotView.getBigUint64(0, true));
  o += 8;
  const flags = new DataView(u8.buffer, u8.byteOffset + o, 2).getUint16(0, true);
  const hex = (b) => [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  const web3 = window.solanaWeb3;
  return {
    version,
    bump,
    issuer: new web3.PublicKey(issuer).toBase58(),
    controller: new web3.PublicKey(controller).toBase58(),
    vault_digest: hex(vaultDigest),
    qev_schema_hash: hex(schemaHash),
    content_ref_hash: hex(contentRef),
    parent_digest: hex(parent),
    created_slot: createdSlot,
    flags,
  };
}

function decodeStatus(data) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  let o = 8;
  const web3 = window.solanaWeb3;
  const anchor = new web3.PublicKey(u8.slice(o, o + 32)).toBase58();
  o += 32;
  const controller = new web3.PublicKey(u8.slice(o, o + 32)).toBase58();
  o += 32;
  const state = u8[o++];
  const slotView = new DataView(u8.buffer, u8.byteOffset + o, 8);
  const updatedSlot = Number(slotView.getBigUint64(0, true));
  return {
    anchor,
    controller,
    state: statusName(state),
    state_code: state,
    updated_slot: updatedSlot,
  };
}

let vaultObject = null;

const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const fileName = document.getElementById("fileName");
const verifyBtn = document.getElementById("verifyBtn");
const results = document.getElementById("results");

function setVault(obj, name) {
  vaultObject = obj;
  fileName.textContent = name || "vault loaded";
  verifyBtn.disabled = false;
}

async function readFile(file) {
  const text = await file.text();
  const obj = JSON.parse(text);
  setVault(obj, file.name);
}

fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f) readFile(f);
});

["dragenter", "dragover"].forEach((ev) => {
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.add("drag");
  });
});
["dragleave", "drop"].forEach((ev) => {
  drop.addEventListener(ev, (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
  });
});
drop.addEventListener("drop", (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (f) readFile(f);
});

verifyBtn.addEventListener("click", async () => {
  results.hidden = false;
  const raw = document.getElementById("raw");
  const summary = document.getElementById("summary");
  const pill = document.getElementById("outcomePill");
  raw.textContent = "Verifying…";
  summary.innerHTML = "";

  try {
    validateVaultShape(vaultObject);
    const canonical = canonicalJSON(vaultObject);
    const digest = await sha256Hex(new TextEncoder().encode(canonical));

    const issuerStr = document.getElementById("issuer").value.trim();
    if (!issuerStr) {
      throw Object.assign(new Error("Issuer wallet required to derive PDA"), {
        code: "ANCHOR_NOT_FOUND",
        digest,
      });
    }

    const web3 = await loadSolana();
    window.solanaWeb3 = web3;

    const network = document.getElementById("network").value;
    const rpcOverride = document.getElementById("rpc").value.trim();
    const rpc =
      rpcOverride ||
      (network === "localnet"
        ? "http://127.0.0.1:8899"
        : network === "mainnet-beta"
          ? "https://api.mainnet-beta.solana.com"
          : "https://api.devnet.solana.com");

    const connection = new web3.Connection(rpc, "confirmed");
    const programId = new web3.PublicKey(PROGRAM_ID);
    const issuer = new web3.PublicKey(issuerStr);
    const digestBytes = new Uint8Array(
      digest.match(/.{2}/g).map((h) => parseInt(h, 16)),
    );

    const [anchorPda] = web3.PublicKey.findProgramAddressSync(
      [QAL_SEED, issuer.toBytes(), digestBytes],
      programId,
    );
    const [statusPda] = web3.PublicKey.findProgramAddressSync(
      [QAL_SEED, STATUS_SEED, issuer.toBytes(), digestBytes],
      programId,
    );

    const anchorInfo = await connection.getAccountInfo(anchorPda);
    const statusInfo = await connection.getAccountInfo(statusPda);

    if (!anchorInfo) {
      const result = {
        outcome: "ANCHOR_NOT_FOUND",
        vault_valid: true,
        digest,
        anchor_found: false,
        cryptographic_match: false,
        network: `solana-${network}`,
        anchor_address: anchorPda.toBase58(),
        status_address: statusPda.toBase58(),
      };
      render(result, pill, summary, raw);
      return;
    }

    const anchor = decodeAnchor(anchorInfo.data);
    const status = statusInfo ? decodeStatus(statusInfo.data) : null;
    const match = anchor.vault_digest === digest;
    const st = status?.state ?? "active";
    let outcome = "DIGEST_MISMATCH";
    if (match) {
      outcome =
        {
          active: "VALID_ACTIVE",
          revoked: "VALID_REVOKED",
          superseded: "VALID_SUPERSEDED",
          disputed: "VALID_DISPUTED",
        }[st] ?? "VALID_ACTIVE";
    }

    const result = {
      outcome,
      vault_valid: true,
      digest,
      anchor_found: true,
      cryptographic_match: match,
      issuer: anchor.issuer,
      controller: status?.controller ?? anchor.controller,
      status: st,
      parent_digest: /^0+$/.test(anchor.parent_digest) ? null : anchor.parent_digest,
      created_slot: anchor.created_slot,
      network: `solana-${network}`,
      anchor_address: anchorPda.toBase58(),
      status_address: statusPda.toBase58(),
      program_id: PROGRAM_ID,
    };
    render(result, pill, summary, raw);
  } catch (err) {
    const result = {
      outcome: err.code || "MALFORMED_QEV",
      vault_valid: false,
      cryptographic_match: false,
      error: err.message,
      digest: err.digest ?? null,
    };
    render(result, pill, summary, raw);
  }
});

function render(result, pill, summary, raw) {
  const ok =
    result.cryptographic_match &&
    ["VALID_ACTIVE", "VALID_REVOKED", "VALID_SUPERSEDED", "VALID_DISPUTED"].includes(
      result.outcome,
    );
  const warn = result.outcome === "VALID_REVOKED" || result.outcome === "VALID_SUPERSEDED";
  pill.textContent = result.outcome;
  pill.className = "pill " + (ok ? (warn ? "warn" : "ok") : "bad");

  const rows = [
    ["Digest match", String(!!result.cryptographic_match)],
    ["Endorsement", result.status ?? "—"],
    ["Digest", result.digest ?? "—"],
    ["Issuer", result.issuer ?? "—"],
    ["Controller", result.controller ?? "—"],
    ["Slot", result.created_slot ?? "—"],
    ["Anchor", result.anchor_address ?? "—"],
    ["Parent", result.parent_digest ?? "—"],
  ];
  summary.innerHTML = rows
    .map(([k, v]) => `<span>${k}</span><span>${escapeHtml(String(v))}</span>`)
    .join("");
  raw.textContent = JSON.stringify(result, null, 2);
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
