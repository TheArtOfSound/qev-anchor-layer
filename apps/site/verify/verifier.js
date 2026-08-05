/**
 * Minimal browser verifier for QAL (pre-alpha).
 *
 * - Vault hashing runs locally; vault is not uploaded.
 * - Dependencies must be bundled at build time (see build.mjs) — no CDN runtime loads.
 * - Fail-closed: missing status → INDETERMINATE_STATUS, not active.
 * - Prefers receipt-directed verification when a receipt is provided.
 */

const QEV_SCHEMA_V2 = "BRY-NFET-SX-VAULT-V2";
/** Active program ID — compromised AFGfc… is refused. */
const PROGRAM_ID = "6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR";
const COMPROMISED = "AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf";
const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const QAL_SEED = new TextEncoder().encode("qal");
const STATUS_SEED = new TextEncoder().encode("status");

// Anchor account discriminators (must match SDK)
async function sha256Bytes(data) {
  const hash = await crypto.subtle.digest("SHA-256", data);
  return new Uint8Array(hash);
}

async function accountDisc(name) {
  const h = await sha256Bytes(new TextEncoder().encode(`account:${name}`));
  return h.slice(0, 8);
}

function canonicalJSON(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJSON).join(",") + "]";
  const keys = Object.keys(value).sort();
  return (
    "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalJSON(value[k])).join(",") +
    "}"
  );
}

async function sha256Hex(bytes) {
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function eq8(a, b) {
  if (a.length !== 8 || b.length !== 8) return false;
  for (let i = 0; i < 8; i++) if (a[i] !== b[i]) return false;
  return true;
}

function validateVaultShape(vault) {
  if (!vault || typeof vault !== "object" || Array.isArray(vault)) {
    throw Object.assign(new Error("Vault malformed: not an object"), { code: "MALFORMED_QEV" });
  }
  if (vault.schema !== QEV_SCHEMA_V2) {
    throw Object.assign(new Error(`Unsupported QEV schema: ${vault.schema}`), {
      code: "UNSUPPORTED_QEV_SCHEMA",
    });
  }
  for (const k of ["version", "created_at", "mode", "kdf", "wrap", "content"]) {
    if (!(k in vault)) {
      throw Object.assign(new Error(`Vault malformed: missing ${k}`), {
        code: "MALFORMED_QEV",
      });
    }
  }
}

function statusName(code) {
  return { 0: "active", 1: "revoked", 2: "superseded", 3: "disputed" }[code] ?? null;
}

function hexOf(u8) {
  return [...u8].map((x) => x.toString(16).padStart(2, "0")).join("");
}

function decodeAnchor(data, web3, expectedDisc) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (u8.length < 8 + 2 + 32 + 128 + 8 + 2) throw new Error("INVALID_ACCOUNT: short");
  if (!eq8(u8.subarray(0, 8), expectedDisc)) {
    throw new Error("INVALID_ACCOUNT: discriminator mismatch");
  }
  let o = 8;
  const version = u8[o++];
  if (version !== 2) throw new Error("UNSUPPORTED_ACCOUNT_VERSION");
  const bump = u8[o++];
  const issuer = new web3.PublicKey(u8.slice(o, o + 32)).toBase58();
  o += 32;
  const vault_digest = hexOf(u8.slice(o, o + 32));
  o += 32;
  const qev_schema_hash = hexOf(u8.slice(o, o + 32));
  o += 32;
  const content_ref_hash = hexOf(u8.slice(o, o + 32));
  o += 32;
  const parent_digest_claim = hexOf(u8.slice(o, o + 32));
  o += 32;
  const createdSlot = Number(new DataView(u8.buffer, u8.byteOffset + o, 8).getBigUint64(0, true));
  o += 8;
  const flags = new DataView(u8.buffer, u8.byteOffset + o, 2).getUint16(0, true);
  return {
    version,
    bump,
    issuer,
    vault_digest,
    qev_schema_hash,
    content_ref_hash,
    parent_digest_claim,
    created_slot: createdSlot,
    flags,
  };
}

function decodeStatus(data, web3, expectedDisc) {
  const u8 = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (u8.length < 8 + 32 + 32 + 1 + 8 + 1) throw new Error("INVALID_ACCOUNT: short status");
  if (!eq8(u8.subarray(0, 8), expectedDisc)) {
    throw new Error("INVALID_ACCOUNT: status discriminator mismatch");
  }
  let o = 8;
  const anchor = new web3.PublicKey(u8.slice(o, o + 32)).toBase58();
  o += 32;
  const controller = new web3.PublicKey(u8.slice(o, o + 32)).toBase58();
  o += 32;
  const state_code = u8[o++];
  const state = statusName(state_code);
  if (!state) throw new Error("INDETERMINATE_STATUS: unknown code");
  const updated_slot = Number(
    new DataView(u8.buffer, u8.byteOffset + o, 8).getBigUint64(0, true),
  );
  return { anchor, controller, state, state_code, updated_slot };
}

let vaultObject = null;
let receiptObject = null;

const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const fileName = document.getElementById("fileName");
const verifyBtn = document.getElementById("verifyBtn");
const results = document.getElementById("results");
const receiptInput = document.getElementById("receiptFile");

function setVault(obj, name) {
  vaultObject = obj;
  fileName.textContent = name || "vault loaded";
  verifyBtn.disabled = false;
}

async function readFile(file) {
  const text = await file.text();
  setVault(JSON.parse(text), file.name);
}

fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f) readFile(f);
});

if (receiptInput) {
  receiptInput.addEventListener("change", async () => {
    const f = receiptInput.files?.[0];
    if (!f) return;
    receiptObject = JSON.parse(await f.text());
    if (receiptObject.program_id === COMPROMISED) {
      alert("Receipt uses compromised program ID — refused");
      receiptObject = null;
    }
  });
}

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

async function loadSolana() {
  // Build step copies web3 to ./vendor/solana-web3.min.js — no CDN.
  if (window.solanaWeb3) return window.solanaWeb3;
  await new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "./vendor/solana-web3.min.js";
    s.onload = resolve;
    s.onerror = () =>
      reject(
        new Error(
          "Missing ./vendor/solana-web3.min.js — run: pnpm --filter @qira/qal-verifier build",
        ),
      );
    document.head.appendChild(s);
  });
  return window.solanaWeb3;
}

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
    const schemaHash = await sha256Hex(new TextEncoder().encode(QEV_SCHEMA_V2));

    const web3 = await loadSolana();
    window.solanaWeb3 = web3;

    const network = document.getElementById("network").value;
    if (network === "mainnet-beta") {
      throw Object.assign(new Error("Mainnet not supported in pre-alpha"), {
        code: "WRONG_NETWORK",
      });
    }

    const rpcOverride = document.getElementById("rpc").value.trim();
    // Only allow known public RPCs or localhost — no silent arbitrary hosts without note
    const rpc =
      rpcOverride ||
      (network === "localnet"
        ? "http://127.0.0.1:8899"
        : "https://api.devnet.solana.com");

    const connection = new web3.Connection(rpc, "confirmed");
    const genesis = await connection.getGenesisHash();
    if (network === "devnet" && genesis !== DEVNET_GENESIS) {
      throw Object.assign(
        new Error(`WRONG_NETWORK: unexpected genesis ${genesis}`),
        { code: "WRONG_NETWORK" },
      );
    }

    const programId = new web3.PublicKey(PROGRAM_ID);
    const anchorDisc = await accountDisc("VaultAnchor");
    const statusDisc = await accountDisc("VaultStatus");

    let anchorAddress;
    let statusAddress;
    let issuerStr;

    if (receiptObject) {
      if (receiptObject.program_id !== PROGRAM_ID) {
        throw Object.assign(new Error("Receipt program_id mismatch"), {
          code: "INVALID_RECEIPT",
        });
      }
      if (receiptObject.genesis_hash && receiptObject.genesis_hash !== genesis) {
        throw Object.assign(new Error("Receipt genesis_hash mismatch"), {
          code: "WRONG_NETWORK",
        });
      }
      anchorAddress = receiptObject.anchor_address;
      statusAddress = receiptObject.status_address;
      issuerStr = receiptObject.issuer;
    } else {
      issuerStr = document.getElementById("issuer").value.trim();
      if (!issuerStr) {
        throw Object.assign(
          new Error("Provide a receipt file or issuer wallet for PDA lookup"),
          { code: "INVALID_RECEIPT" },
        );
      }
      const issuer = new web3.PublicKey(issuerStr);
      const digestBytes = new Uint8Array(
        digest.match(/.{2}/g).map((h) => parseInt(h, 16)),
      );
      const [a] = web3.PublicKey.findProgramAddressSync(
        [QAL_SEED, issuer.toBytes(), digestBytes],
        programId,
      );
      const [s] = web3.PublicKey.findProgramAddressSync(
        [QAL_SEED, STATUS_SEED, issuer.toBytes(), digestBytes],
        programId,
      );
      anchorAddress = a.toBase58();
      statusAddress = s.toBase58();
    }

    const anchorInfo = await connection.getAccountInfo(
      new web3.PublicKey(anchorAddress),
    );
    if (!anchorInfo) {
      render(
        {
          outcome: "ANCHOR_NOT_FOUND",
          vault_valid: true,
          digest,
          anchor_found: false,
          cryptographic_match: false,
          network: `solana-${network}`,
          anchor_address: anchorAddress,
        },
        pill,
        summary,
        raw,
      );
      return;
    }

    if (!anchorInfo.owner.equals(programId)) {
      throw Object.assign(new Error("OWNER_MISMATCH on anchor"), {
        code: "OWNER_MISMATCH",
      });
    }

    const anchor = decodeAnchor(anchorInfo.data, web3, anchorDisc);
    const match = anchor.vault_digest === digest;
    const schemaMatch = anchor.qev_schema_hash === schemaHash;

    if (!match) {
      render(
        {
          outcome: "DIGEST_MISMATCH",
          vault_valid: true,
          digest,
          anchor_found: true,
          cryptographic_match: false,
          schema_hash_match: schemaMatch,
          issuer: anchor.issuer,
          on_chain_digest: anchor.vault_digest,
          network: `solana-${network}`,
          anchor_address: anchorAddress,
          note: "Receipt-directed: compared local vault to fixed on-chain anchor.",
        },
        pill,
        summary,
        raw,
      );
      return;
    }

    if (!schemaMatch) {
      render(
        {
          outcome: "SCHEMA_HASH_MISMATCH",
          vault_valid: true,
          digest,
          cryptographic_match: true,
          schema_hash_match: false,
        },
        pill,
        summary,
        raw,
      );
      return;
    }

    const statusInfo = await connection.getAccountInfo(
      new web3.PublicKey(statusAddress),
    );
    if (!statusInfo) {
      render(
        {
          outcome: "STATUS_NOT_FOUND",
          vault_valid: true,
          digest,
          cryptographic_match: true,
          status: "indeterminate",
          note: "Missing status is NOT treated as active.",
        },
        pill,
        summary,
        raw,
      );
      return;
    }
    if (!statusInfo.owner.equals(programId)) {
      throw Object.assign(new Error("OWNER_MISMATCH on status"), {
        code: "OWNER_MISMATCH",
      });
    }

    const status = decodeStatus(statusInfo.data, web3, statusDisc);
    if (status.anchor !== anchorAddress) {
      throw Object.assign(new Error("status.anchor mismatch"), {
        code: "INVALID_ACCOUNT",
      });
    }

    const outcome = {
      active: "VALID_ACTIVE",
      revoked: "VALID_REVOKED",
      superseded: "VALID_SUPERSEDED",
      disputed: "VALID_DISPUTED",
    }[status.state];

    render(
      {
        outcome,
        vault_valid: true,
        digest,
        anchor_found: true,
        cryptographic_match: true,
        schema_hash_match: true,
        issuer: anchor.issuer,
        controller: status.controller,
        status: status.state,
        parent_digest_claim: /^0+$/.test(anchor.parent_digest_claim)
          ? null
          : anchor.parent_digest_claim,
        created_slot: anchor.created_slot,
        network: `solana-${network}`,
        program_id: PROGRAM_ID,
        anchor_address: anchorAddress,
        status_address: statusAddress,
        pre_alpha: true,
      },
      pill,
      summary,
      raw,
    );
  } catch (err) {
    render(
      {
        outcome: err.code || "MALFORMED_QEV",
        vault_valid: false,
        cryptographic_match: false,
        error: err.message,
      },
      pill,
      summary,
      raw,
    );
  }
});

function render(result, pill, summary, raw) {
  const ok = [
    "VALID_ACTIVE",
    "VALID_REVOKED",
    "VALID_SUPERSEDED",
    "VALID_DISPUTED",
  ].includes(result.outcome);
  const warn =
    result.outcome === "VALID_REVOKED" || result.outcome === "VALID_SUPERSEDED";
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
    ["Parent claim", result.parent_digest_claim ?? "—"],
  ];
  summary.innerHTML = rows
    .map(([k, v]) => `<span>${k}</span><span>${escapeHtml(String(v))}</span>`)
    .join("");
  raw.textContent = JSON.stringify(result, null, 2);
}

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
