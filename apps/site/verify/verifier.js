/**
 * Minimal browser verifier for QAL (pre-alpha).
 *
 * - Vault hashing runs locally; vault is not uploaded.
 * - Dependencies must be bundled at build time (see build.mjs) — no CDN runtime loads.
 * - Fail-closed: missing status → INDETERMINATE_STATUS, not active.
 * - Prefers receipt-directed verification when a receipt is provided.
 */

const QEV_SCHEMA_V2 = "BRY-NFET-SX-VAULT-V2";
const STUDIO_SCHEMA = "QAL-STUDIO-ENVELOPE-V1";
const DEMO_VAULT_URL = "/evidence/devnet/vault.json";
const DEMO_RECEIPT_URL = "/evidence/devnet/demo-receipt.json";
const DEMO_ISSUER = "3ZYTW6D7J5NRZTekzvb51GP2RfUawkviJgXuxy3rcWnz";
/** Active program ID — compromised AFGfc… is refused. */
const PROGRAM_ID = "6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR";
const COMPROMISED = "AFGfcVVNtucEjJXvL7QSrRLdujr7yWqnC8FdhP7rpixf";
const DEVNET_GENESIS = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const QAL_SEED = new TextEncoder().encode("qal");
const STATUS_SEED = new TextEncoder().encode("status");

const COPY = {
  studio: {
    title: "Studio practice locker",
    html:
      'This is a Studio practice locker, not an official vault. Studio cannot post a stamp. <a href="/studio/">Open Studio</a> to keep practicing, or use an official QEV file. <a href="/learn/">Learn how Check works</a>.',
  },
  receipt: {
    title: "Stamp receipt, not a vault",
    html:
      'This is a stamp receipt, not the locked file. <a href="/evidence/devnet/">Open the live proof page</a> or drop the matching official vault.',
  },
  not_vault: {
    title: "Not an official vault",
    html: "This file is not an official QEV vault.",
  },
  demo_missing: {
    title: "Demo vault not published yet",
    html: "Demo vault not published yet.",
  },
};

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

function isReceiptLike(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
  if (typeof obj.qev_schema === "string") return true;
  if (typeof obj.vault_digest === "string" && (obj.anchor_address || obj.program_id)) {
    return true;
  }
  if (obj.anchor_address && obj.status_address) return true;
  if (obj.transaction_signature && (obj.created_slot != null || obj.issuer)) return true;
  if (obj.fingerprint && (obj.anchor_tx || obj.deploy_tx || obj.explorer_cluster)) {
    return true;
  }
  if (obj.program_id && (obj.anchor_tx || obj.revoke_tx || obj.supersede_tx)) return true;
  if (
    (obj.signature || obj.transaction_signature) &&
    (obj.slot != null || obj.created_slot != null)
  ) {
    return true;
  }
  if (obj.result && typeof obj.result === "object") {
    if (obj.result.slot != null || obj.result.transaction) return true;
  }
  if (obj.transaction && (obj.slot != null || obj.meta)) return true;
  return false;
}

function classifyDroppedJson(obj) {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return "not_vault";
  if (obj.schema === QEV_SCHEMA_V2) return "official";
  if (obj.schema === STUDIO_SCHEMA) return "studio";
  if (isReceiptLike(obj)) return "receipt";
  return "not_vault";
}

function isRpcFailure(err) {
  if (!err) return false;
  if (err.code === "RPC_UNAVAILABLE" || err.code === "CHAIN_LOOKUP_FAILED") return true;
  if (err.status === 429 || err.code === 429) return true;
  const msg = err.message ? String(err.message) : String(err);
  const s = msg.toLowerCase();
  if (/\b429\b/.test(msg) || s.includes("too many requests") || s.includes("rate limit")) {
    return true;
  }
  if (
    s.includes("failed to fetch") ||
    s.includes("networkerror") ||
    s.includes("network request failed") ||
    s.includes("load failed") ||
    s.includes("timeout") ||
    s.includes("econnreset") ||
    s.includes("econnrefused") ||
    s.includes("fetch")
  ) {
    return true;
  }
  return false;
}

function rpcFailureResult(digest, err) {
  const msg = err && err.message ? String(err.message) : String(err);
  const rate =
    /\b429\b/.test(msg) || /too many requests|rate limit/i.test(msg) || err?.status === 429;
  const reason = rate ? "rate limit" : "network";
  return {
    outcome: "CHAIN_LOOKUP_FAILED",
    vault_valid: true,
    digest: digest || null,
    cryptographic_match: false,
    message:
      "Chain lookup failed (" +
      reason +
      "). The file fingerprint was still computed here. This does not mean the program is dead.",
    error: msg,
  };
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
let droppedKind = null;
let checking = false;

const drop = document.getElementById("drop");
const fileInput = document.getElementById("file");
const fileName = document.getElementById("fileName");
const fileStatus = document.getElementById("fileStatus");
const verifyBtn = document.getElementById("verifyBtn");
const demoBtn = document.getElementById("demoBtn");
const results = document.getElementById("results");
const receiptInput = document.getElementById("receiptFile");

function setFileStatus(kind, html) {
  if (!fileStatus) return;
  if (!html) {
    fileStatus.hidden = true;
    fileStatus.className = "";
    fileStatus.innerHTML = "";
    return;
  }
  fileStatus.hidden = false;
  fileStatus.className = kind === "official" ? "note" : "warn";
  fileStatus.innerHTML = html;
}

function showClassification(kind) {
  const copy = COPY[kind] || COPY.not_vault;
  setFileStatus(kind, copy.html);
  renderPlain(kind, copy);
}

function setLoadedJson(obj, name, opts) {
  const autoRun = !opts || opts.autoRun !== false;
  droppedKind = classifyDroppedJson(obj);
  fileName.textContent = name || "file loaded";
  if (droppedKind === "official") {
    vaultObject = obj;
    verifyBtn.disabled = false;
    const issuerReady = !!(
      receiptObject || document.getElementById("issuer")?.value.trim()
    );
    setFileStatus(
      "official",
      issuerReady
        ? "Official QEV vault loaded. Checking…"
        : "Official QEV vault loaded. Add a proof slip or the poster’s address, then Check.",
    );
    if (autoRun && issuerReady) runCheck();
    return;
  }
  vaultObject = obj;
  verifyBtn.disabled = false;
  showClassification(droppedKind);
}

async function readFile(file) {
  let text;
  try {
    text = await file.text();
  } catch {
    vaultObject = null;
    droppedKind = "not_vault";
    fileName.textContent = file.name || "file";
    verifyBtn.disabled = false;
    showClassification("not_vault");
    return;
  }
  let obj;
  try {
    obj = JSON.parse(text);
  } catch {
    vaultObject = null;
    droppedKind = "not_vault";
    fileName.textContent = file.name || "file";
    verifyBtn.disabled = false;
    showClassification("not_vault");
    return;
  }
  setLoadedJson(obj, file.name);
}

fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f) readFile(f);
});

if (receiptInput) {
  receiptInput.addEventListener("change", async () => {
    const f = receiptInput.files?.[0];
    if (!f) return;
    try {
      receiptObject = JSON.parse(await f.text());
    } catch {
      receiptObject = null;
      setFileStatus("not_vault", "That proof slip is not readable JSON.");
      return;
    }
    if (receiptObject.program_id === COMPROMISED) {
      setFileStatus(
        "not_vault",
        "That proof slip points at the abandoned program — refused. It is not official.",
      );
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

if (demoBtn) {
  demoBtn.addEventListener("click", async () => {
    demoBtn.disabled = true;
    setFileStatus("official", "Fetching the live demo file…");
    try {
      const res = await fetch(DEMO_VAULT_URL, { cache: "no-store" });
      if (res.status === 404) {
        vaultObject = null;
        droppedKind = "demo_missing";
        verifyBtn.disabled = false;
        showClassification("demo_missing");
        return;
      }
      if (!res.ok) {
        vaultObject = null;
        droppedKind = "not_vault";
        verifyBtn.disabled = false;
        setFileStatus(
          "not_vault",
          "Could not load the demo vault (HTTP " + res.status + ").",
        );
        renderPlain("not_vault", {
          title: "Demo vault not available",
          html: "Could not load the demo vault (HTTP " + res.status + ").",
        });
        return;
      }
      const obj = await res.json();
      const issuerEl = document.getElementById("issuer");
      if (issuerEl && !issuerEl.value.trim()) issuerEl.value = DEMO_ISSUER;
      try {
        const slip = await fetch(DEMO_RECEIPT_URL, { cache: "no-store" });
        if (slip.ok) {
          const rec = await slip.json();
          if (
            rec &&
            rec.program_id === PROGRAM_ID &&
            rec.vault_digest &&
            rec.protocol === "QAL"
          ) {
            receiptObject = rec;
          }
        }
      } catch {
        /* demo check still runs from the vault + issuer field */
      }
      setLoadedJson(obj, "vault.json");
    } catch {
      vaultObject = null;
      droppedKind = "not_vault";
      verifyBtn.disabled = false;
      setFileStatus(
        "not_vault",
        "Could not reach the demo vault. Try again, or drop an official QEV file.",
      );
    } finally {
      demoBtn.disabled = false;
    }
  });
}

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

verifyBtn.addEventListener("click", () => {
  runCheck();
});

async function runCheck() {
  results.hidden = false;
  const raw = document.getElementById("raw");
  const summary = document.getElementById("summary");
  const pill = document.getElementById("outcomePill");
  if (checking) return;
  checking = true;
  verifyBtn.disabled = true;
  raw.textContent = "Checking…";
  summary.innerHTML = "";
  const resultMessage = document.getElementById("resultMessage");
  if (resultMessage) {
    resultMessage.hidden = true;
    resultMessage.textContent = "";
  }

  let digest = null;
  try {
    if (!vaultObject || droppedKind !== "official") {
      const kind =
        droppedKind && droppedKind !== "official" ? droppedKind : classifyDroppedJson(vaultObject);
      showClassification(kind === "official" ? "not_vault" : kind);
      return;
    }

    validateVaultShape(vaultObject);
    const canonical = canonicalJSON(vaultObject);
    digest = await sha256Hex(new TextEncoder().encode(canonical));
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
    // Same-origin /rpc first, then public Devnet. No paid keys.
    const rpcCandidates =
      network === "localnet"
        ? [rpcOverride || "http://127.0.0.1:8899"]
        : rpcOverride
          ? [rpcOverride]
          : ["/rpc", "https://api.devnet.solana.com"];

    let connection;
    let genesis;
    let lastRpcErr;
    for (const rpc of rpcCandidates) {
      try {
        connection = new web3.Connection(rpc, "confirmed");
        genesis = await connection.getGenesisHash();
        lastRpcErr = null;
        break;
      } catch (err) {
        lastRpcErr = err;
      }
    }
    if (!connection || lastRpcErr) {
      render(rpcFailureResult(digest, lastRpcErr || new Error("rpc")), pill, summary, raw);
      return;
    }
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

    let anchorInfo;
    try {
      anchorInfo = await connection.getAccountInfo(new web3.PublicKey(anchorAddress));
    } catch (err) {
      render(rpcFailureResult(digest, err), pill, summary, raw);
      return;
    }
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

    let statusInfo;
    try {
      statusInfo = await connection.getAccountInfo(new web3.PublicKey(statusAddress));
    } catch (err) {
      render(rpcFailureResult(digest, err), pill, summary, raw);
      return;
    }
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
        note: "A match is not the truth. A liar can lock a lie.",
      },
      pill,
      summary,
      raw,
    );
  } catch (err) {
    if (isRpcFailure(err)) {
      render(rpcFailureResult(digest, err), pill, summary, raw);
      return;
    }
    render(
      {
        outcome: err.code || "CHECK_FAILED",
        vault_valid: false,
        digest,
        cryptographic_match: false,
        error: err.message,
      },
      pill,
      summary,
      raw,
    );
  } finally {
    checking = false;
    verifyBtn.disabled = false;
  }
}

function resultEls() {
  return {
    pill: document.getElementById("outcomePill"),
    summary: document.getElementById("summary"),
    raw: document.getElementById("raw"),
    message: document.getElementById("resultMessage"),
  };
}

function renderPlain(kind, copy) {
  results.hidden = false;
  const els = resultEls();
  const title = copy.title || (COPY[kind] && COPY[kind].title) || "Not an official vault";
  const html = copy.html || (COPY[kind] && COPY[kind].html) || COPY.not_vault.html;
  els.pill.textContent = title;
  els.pill.className = "pill " + (kind === "demo_missing" ? "warn" : "bad");
  if (els.message) {
    els.message.hidden = false;
    els.message.innerHTML = html;
  }
  els.summary.innerHTML = "";
  els.raw.textContent = JSON.stringify(
    { kind, official_vault: false },
    null,
    2,
  );
}

function render(result, pill, summary, raw) {
  const ok = [
    "VALID_ACTIVE",
    "VALID_REVOKED",
    "VALID_SUPERSEDED",
    "VALID_DISPUTED",
  ].includes(result.outcome);
  const warn =
    result.outcome === "VALID_REVOKED" ||
    result.outcome === "VALID_SUPERSEDED" ||
    result.outcome === "CHAIN_LOOKUP_FAILED";
  pill.textContent = result.outcome;
  pill.className = "pill " + (ok ? (warn ? "warn" : "ok") : warn ? "warn" : "bad");

  const msg = document.getElementById("resultMessage");
  const human = result.message || result.note || "";
  if (msg) {
    if (human) {
      msg.hidden = false;
      msg.textContent = human;
    } else {
      msg.hidden = true;
      msg.textContent = "";
    }
  }

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
