/* QAL Studio — local-first commitments. Real protocol shapes. Chain gated. */
(function () {
  "use strict";

  var STORE_KEY = "qal-studio-v1";
  var SCHEMA = "QAL-STUDIO-ENVELOPE-V1";
  var PROTOCOL = "QAL";
  var PROTOCOL_VERSION = "0.1.2";
  var FREE_SOFT_CAP = 3;

  function nowIso() {
    return new Date().toISOString();
  }

  function uid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "s-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function b64(bytes) {
    var bin = "";
    var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (var i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
    return btoa(bin);
  }

  function unb64(str) {
    var bin = atob(str);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function canonicalJSON(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) {
      return "[" + value.map(canonicalJSON).join(",") + "]";
    }
    var keys = Object.keys(value).sort();
    var parts = [];
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (value[k] === undefined) continue;
      parts.push(JSON.stringify(k) + ":" + canonicalJSON(value[k]));
    }
    return "{" + parts.join(",") + "}";
  }

  async function sha256Hex(data) {
    var bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    var buf = await crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(buf))
      .map(function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function shortHex(hex) {
    if (!hex) return "—";
    return hex.slice(0, 8) + "…" + hex.slice(-6);
  }

  function loadStore() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (!raw) return { version: 1, items: [] };
      var parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items)) return { version: 1, items: [] };
      return parsed;
    } catch (e) {
      return { version: 1, items: [] };
    }
  }

  function saveStore(store) {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
  }

  function list() {
    var rank = { active: 0, disputed: 1, superseded: 2, revoked: 3 };
    return loadStore().items.slice().sort(function (a, b) {
      var ra = rank[a.status] != null ? rank[a.status] : 9;
      var rb = rank[b.status] != null ? rank[b.status] : 9;
      if (ra !== rb) return ra - rb;
      return (b.updated_at || "").localeCompare(a.updated_at || "");
    });
  }

  function get(id) {
    if (!id) return null;
    var items = loadStore().items;
    for (var i = 0; i < items.length; i++) {
      if (items[i].id === id) return items[i];
    }
    return null;
  }

  function put(item) {
    var store = loadStore();
    var found = false;
    for (var i = 0; i < store.items.length; i++) {
      if (store.items[i].id === item.id) {
        store.items[i] = item;
        found = true;
        break;
      }
    }
    if (!found) store.items.push(item);
    saveStore(store);
    return item;
  }

  function countCreated() {
    return loadStore().items.filter(function (x) {
      return x.kind !== "import";
    }).length;
  }

  async function deriveKey(phrase, salt) {
    var base = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(phrase),
      "PBKDF2",
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: 210000, hash: "SHA-256" },
      base,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt", "decrypt"]
    );
  }

  async function sealPack(pack, phrase) {
    var salt = crypto.getRandomValues(new Uint8Array(16));
    var iv = crypto.getRandomValues(new Uint8Array(12));
    var key = await deriveKey(phrase, salt);
    var plain = new TextEncoder().encode(canonicalJSON(pack));
    var cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv }, key, plain);
    return {
      schema: SCHEMA,
      protocol: PROTOCOL,
      protocol_version: PROTOCOL_VERSION,
      created_at: nowIso(),
      mode: "self",
      note: "Studio browser envelope. Not official BRY-NFET-SX-VAULT-V2. Re-seal with QEV CLI before production evidence.",
      kdf: {
        algorithm: "PBKDF2-SHA-256",
        iterations: 210000,
        salt: b64(salt),
      },
      content: {
        algorithm: "AES-256-GCM",
        iv: b64(iv),
        ciphertext: b64(cipher),
      },
    };
  }

  async function buildVault(pack, visibility, phrase) {
    if (visibility === "public") {
      return {
        schema: SCHEMA,
        protocol: PROTOCOL,
        protocol_version: PROTOCOL_VERSION,
        created_at: nowIso(),
        mode: "public",
        note: "Public studio pack. Digest commits to this exact object. Not official QEV.",
        pack: pack,
      };
    }
    if (!phrase || phrase.length < 8) {
      throw new Error("Encrypted commitments need a phrase of at least 8 characters.");
    }
    return sealPack(pack, phrase);
  }

  function event(kind, extra) {
    var e = { at: nowIso(), kind: kind };
    if (extra) {
      Object.keys(extra).forEach(function (k) {
        e[k] = extra[k];
      });
    }
    return e;
  }

  async function create(input) {
    var pack = {
      title: String(input.title || "").trim(),
      kind: "commitment-pack",
      created_at: nowIso(),
      text: input.text || "",
      json: input.json == null || input.json === "" ? null : input.json,
      urls: input.urls || [],
      wallets: input.wallets || [],
      files: input.files || [],
    };
    if (!pack.title) throw new Error("Give this commitment a title.");

    var visibility = input.visibility === "public" ? "public" : "encrypted";
    var vault = await buildVault(pack, visibility, input.phrase);
    var canonical = canonicalJSON(vault);
    var digest = await sha256Hex(canonical);
    var schemaHash = await sha256Hex(SCHEMA);
    var parent = input.parent_id ? get(input.parent_id) : null;

    var item = {
      id: uid(),
      title: pack.title,
      visibility: visibility,
      status: "active",
      created_at: pack.created_at,
      updated_at: pack.created_at,
      vault_digest: digest,
      schema: SCHEMA,
      schema_hash: schemaHash,
      parent_id: parent ? parent.id : null,
      parent_digest: parent ? parent.vault_digest : null,
      successor_id: null,
      successor_digest: null,
      issuer: "studio-local",
      network: "studio-local",
      anchor: "gated",
      vault: vault,
      events: [event("created", { visibility: visibility })],
    };

    if (parent) {
      if (parent.status === "revoked" || parent.status === "superseded") {
        throw new Error("That claim can no longer be replaced.");
      }
      parent.status = "superseded";
      parent.successor_id = item.id;
      parent.successor_digest = digest;
      parent.updated_at = item.created_at;
      parent.events = (parent.events || []).concat([
        event("superseded", { successor_id: item.id, successor_digest: digest }),
      ]);
      put(parent);
      item.events.push(event("supersedes", { parent_id: parent.id, parent_digest: parent.vault_digest }));
    }

    return put(item);
  }

  function assertMutable(item, action) {
    if (!item) throw new Error("Commitment not found.");
    if (item.status === "revoked") throw new Error("Taken back is final — you can’t " + action + " it.");
    if (item.status === "superseded") throw new Error("Replaced is final — you can’t " + action + " it.");
  }

  function revoke(id) {
    var item = get(id);
    assertMutable(item, "revoke");
    item.status = "revoked";
    item.updated_at = nowIso();
    item.events = (item.events || []).concat([event("revoked")]);
    return put(item);
  }

  function dispute(id) {
    var item = get(id);
    assertMutable(item, "dispute");
    if (item.status !== "active") throw new Error("Only an active commitment can be marked disputed.");
    item.status = "disputed";
    item.updated_at = nowIso();
    item.events = (item.events || []).concat([event("disputed")]);
    return put(item);
  }

  function reopen(id) {
    var item = get(id);
    if (!item) throw new Error("Commitment not found.");
    if (item.status !== "disputed") throw new Error("Only a disputed commitment can return to active.");
    item.status = "active";
    item.updated_at = nowIso();
    item.events = (item.events || []).concat([event("reopened")]);
    return put(item);
  }

  async function verifyLocal(item) {
    if (!item || !item.vault) {
      return { ok: false, outcome: "MALFORMED", message: "No vault on this record." };
    }
    var digest = await sha256Hex(canonicalJSON(item.vault));
    var match = digest === item.vault_digest;
    return {
      ok: match,
      outcome: match ? "LOCAL_DIGEST_MATCH" : "DIGEST_MISMATCH",
      digest: digest,
      recorded: item.vault_digest,
      status: item.status,
      message: match
        ? "This copy still matches the fingerprint you saved."
        : "This file no longer matches the saved fingerprint.",
    };
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 0);
  }

  function exportVault(item) {
    download(
      slug(item.title) + ".studio.qev.json",
      JSON.stringify(item.vault, null, 2) + "\n"
    );
  }

  function exportRecord(item) {
    var copy = JSON.parse(JSON.stringify(item));
    download(slug(item.title) + ".qal-studio.json", JSON.stringify(copy, null, 2) + "\n");
  }

  function slug(s) {
    return String(s || "commitment")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48);
  }

  async function importPack(obj) {
    if (!obj || typeof obj !== "object") throw new Error("Not a JSON object.");
    var item = obj;
    if (obj.vault && obj.vault_digest) {
      item = obj;
    } else if (obj.schema === SCHEMA) {
      var digest = await sha256Hex(canonicalJSON(obj));
      item = {
        id: uid(),
        title: (obj.pack && obj.pack.title) || "Imported vault",
        visibility: obj.mode === "public" ? "public" : "encrypted",
        status: "active",
        created_at: obj.created_at || nowIso(),
        updated_at: nowIso(),
        vault_digest: digest,
        schema: SCHEMA,
        schema_hash: await sha256Hex(SCHEMA),
        parent_id: null,
        parent_digest: null,
        successor_id: null,
        successor_digest: null,
        issuer: "imported",
        network: "studio-local",
        anchor: "gated",
        vault: obj,
        kind: "import",
        events: [event("imported")],
      };
    } else {
      throw new Error("This file is not a Studio envelope or record.");
    }
    if (!item.id) item.id = uid();
    if (get(item.id)) item.id = uid();
    return put(item);
  }

  window.QALStudio = {
    SCHEMA: SCHEMA,
    FREE_SOFT_CAP: FREE_SOFT_CAP,
    list: list,
    get: get,
    create: create,
    revoke: revoke,
    dispute: dispute,
    reopen: reopen,
    verifyLocal: verifyLocal,
    exportVault: exportVault,
    exportRecord: exportRecord,
    importPack: importPack,
    countCreated: countCreated,
    canonicalJSON: canonicalJSON,
    sha256Hex: sha256Hex,
    shortHex: shortHex,
    uid: uid,
  };

  /* ---------- page boots ---------- */

  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }

  function qsa(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function param(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function statusClass(st) {
    if (st === "active") return "st-active";
    if (st === "revoked") return "st-revoked";
    if (st === "superseded") return "st-superseded";
    if (st === "disputed") return "st-disputed";
    return "";
  }

  function statusLabel(st) {
    if (st === "active") return "Live";
    if (st === "revoked") return "Taken back";
    if (st === "superseded") return "Replaced";
    if (st === "disputed") return "Contested";
    return st || "—";
  }

  function fmtWhen(iso) {
    if (!iso) return "—";
    try {
      var d = new Date(iso);
      return d.toLocaleString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch (e) {
      return iso;
    }
  }

  function bootList() {
    var host = qs("[data-studio-list]");
    if (!host) return;
    var items = list();
    var n = qs("[data-studio-count]");
    if (n) n.textContent = String(items.length);

    if (!items.length) {
      host.innerHTML =
        '<div class="studio-empty">' +
        "<p>Nothing locked on this computer yet.</p>" +
        '<p class="short">Make one here. It stays in this browser until you download it.</p>' +
        '<a class="btn-primary" href="/studio/new/">Lock a claim</a>' +
        "</div>";
      return;
    }

    host.innerHTML = items
      .map(function (it) {
        return (
          '<a class="studio-row" href="/studio/c/?id=' +
          encodeURIComponent(it.id) +
          '">' +
          '<span class="studio-row-title">' +
          escapeHtml(it.title) +
          "</span>" +
          '<span class="status-pill ' +
          statusClass(it.status) +
          '">' +
          escapeHtml(statusLabel(it.status)) +
          "</span>" +
          '<span class="studio-row-meta">' +
          escapeHtml(shortHex(it.vault_digest)) +
          " · " +
          escapeHtml(fmtWhen(it.created_at)) +
          "</span></a>"
        );
      })
      .join("");

    var imp = qs("[data-import]");
    if (imp) {
      imp.addEventListener("change", function () {
        var file = imp.files && imp.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function () {
          try {
            var obj = JSON.parse(String(reader.result));
            importPack(obj).then(function (item) {
              location.href = "/studio/c/?id=" + encodeURIComponent(item.id);
            });
          } catch (err) {
            alert(err.message || "Could not import that file.");
          }
        };
        reader.readAsText(file);
      });
    }
  }

  function parseLines(text) {
    return String(text || "")
      .split(/\r?\n/)
      .map(function (s) {
        return s.trim();
      })
      .filter(Boolean);
  }

  function parseJsonField(text) {
    var t = String(text || "").trim();
    if (!t) return null;
    return JSON.parse(t);
  }

  async function readFiles(fileList) {
    var files = Array.prototype.slice.call(fileList || []);
    var out = [];
    for (var i = 0; i < files.length; i++) {
      var f = files[i];
      var buf = await f.arrayBuffer();
      var bytes = new Uint8Array(buf);
      var hash = await sha256Hex(bytes);
      var rec = {
        name: f.name,
        type: f.type || "application/octet-stream",
        size: f.size,
        sha256: hash,
      };
      if (f.size <= 200000 && /^text\/|^application\/(json|xml)/.test(f.type || "") || /\.(txt|md|json|csv)$/i.test(f.name)) {
        rec.text = new TextDecoder().decode(bytes);
      } else if (f.size <= 400000) {
        rec.bytes_b64 = b64(bytes);
      } else {
        rec.omitted = "file too large for in-browser pack — fingerprint only";
      }
      out.push(rec);
    }
    return out;
  }

  function setPipe(step) {
    qsa("[data-pipe-step]").forEach(function (el) {
      var n = Number(el.getAttribute("data-pipe-step"));
      el.classList.toggle("done", n < step);
      el.classList.toggle("now", n === step);
    });
  }

  function bootCreate() {
    var form = qs("[data-studio-create]");
    if (!form) return;
    var parentId = param("parent");
    var parent = parentId ? get(parentId) : null;
    if (parent) {
      var banner = qs("[data-parent-banner]");
      if (banner) {
        banner.hidden = false;
        banner.innerHTML =
          "New version of <strong>" +
          escapeHtml(parent.title) +
          "</strong> · parent " +
          escapeHtml(shortHex(parent.vault_digest));
      }
      var title = qs("[name=title]");
      if (title && !title.value) title.value = parent.title;
    }

    var vis = qsa("[name=visibility]");
    function syncVis() {
      var v = (form.querySelector("[name=visibility]:checked") || {}).value;
      var row = qs("[data-phrase-row]");
      if (row) row.hidden = v === "public";
    }
    vis.forEach(function (el) {
      el.addEventListener("change", syncVis);
    });
    syncVis();

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      runCreate(form, parent);
    });
  }

  function wait(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  async function runCreate(form, parent) {
    var errEl = qs("[data-create-error]");
    var runEl = qs("[data-create-run]");
    var submit = form.querySelector("[type=submit]");
    if (errEl) {
      errEl.hidden = true;
      errEl.textContent = "";
    }
    function fail(msg) {
      if (errEl) {
        errEl.hidden = false;
        errEl.textContent = msg;
      } else {
        alert(msg);
      }
      if (submit) submit.disabled = false;
    }

    try {
      if (submit) submit.disabled = true;
      if (runEl) runEl.hidden = false;
      setPipe(1);

      var visibility =
        (form.querySelector("[name=visibility]:checked") || {}).value || "encrypted";
      var jsonRaw = (form.querySelector("[name=json]") || {}).value || "";
      var json = null;
      if (jsonRaw.trim()) {
        try {
          json = parseJsonField(jsonRaw);
        } catch (e) {
          fail("JSON field is not valid JSON.");
          return;
        }
      }

      var filesInput = form.querySelector("[name=files]");
      var files = await readFiles(filesInput && filesInput.files);
      setPipe(2);

      var item = await create({
        title: (form.querySelector("[name=title]") || {}).value,
        text: (form.querySelector("[name=text]") || {}).value,
        json: json,
        urls: parseLines((form.querySelector("[name=urls]") || {}).value),
        wallets: parseLines((form.querySelector("[name=wallets]") || {}).value),
        files: files,
        visibility: visibility,
        phrase: (form.querySelector("[name=phrase]") || {}).value,
        parent_id: parent ? parent.id : null,
      });
      setPipe(3);
      await wait(280);
      setPipe(4);
      await wait(180);
      setPipe(5);
      await wait(180);
      setPipe(6);
      await wait(180);
      setPipe(7);
      await wait(160);
      location.href = "/studio/c/?id=" + encodeURIComponent(item.id);
    } catch (err) {
      fail(err.message || String(err));
    }
  }

  function lineage(item) {
    var chain = [];
    var cur = item;
    var guard = 0;
    while (cur && cur.parent_id && guard < 20) {
      var p = get(cur.parent_id);
      if (!p) break;
      chain.unshift(p);
      cur = p;
      guard++;
    }
    chain.push(item);
    cur = item;
    guard = 0;
    while (cur && cur.successor_id && guard < 20) {
      var n = get(cur.successor_id);
      if (!n) break;
      chain.push(n);
      cur = n;
      guard++;
    }
    return chain;
  }

  function bootDash() {
    var root = qs("[data-studio-dash]");
    if (!root) return;
    var item = get(param("id"));
    if (!item) {
      root.innerHTML =
        '<p class="warn">This claim is not on this computer. Open a saved file, or <a href="/studio/">go back</a>.</p>';
      return;
    }

    qs("[data-title]", root).textContent = item.title;
    var pill = qs("[data-status]", root);
    pill.textContent = statusLabel(item.status);
    pill.className = "status-pill " + statusClass(item.status);

    qs("[data-when]", root).textContent = fmtWhen(item.created_at);
    qs("[data-issuer]", root).textContent = item.issuer;
    qs("[data-digest]", root).textContent = item.vault_digest;
    qs("[data-network]", root).textContent =
      item.anchor === "gated" ? "On this computer · not posted publicly yet" : item.network;
    qs("[data-vis]", root).textContent =
      item.visibility === "public" ? "Words are readable" : "Words are locked";

    var hist = qs("[data-history]", root);
    var line = lineage(item);
    hist.innerHTML = line
      .map(function (it) {
        var you = it.id === item.id ? " current" : "";
        return (
          '<li class="hist-item' +
          you +
          '">' +
          '<span class="hist-when">' +
          escapeHtml(fmtWhen(it.created_at)) +
          "</span>" +
          '<span class="status-pill ' +
          statusClass(it.status) +
          '">' +
          escapeHtml(statusLabel(it.status)) +
          "</span>" +
          '<a href="/studio/c/?id=' +
          encodeURIComponent(it.id) +
          '">' +
          escapeHtml(it.title) +
          "</a>" +
          "<code>" +
          escapeHtml(shortHex(it.vault_digest)) +
          "</code></li>"
        );
      })
      .join("");

    var ev = qs("[data-events]", root);
    ev.innerHTML = (item.events || [])
      .slice()
      .reverse()
      .map(function (e) {
        return (
          "<li><strong>" +
          escapeHtml(e.kind) +
          "</strong> · " +
          escapeHtml(fmtWhen(e.at)) +
          "</li>"
        );
      })
      .join("");

    var mutable = item.status === "active" || item.status === "disputed";
    qs("[data-act-version]", root).hidden = !mutable;
    qs("[data-act-revoke]", root).hidden = !mutable;
    qs("[data-act-dispute]", root).hidden = item.status !== "active";
    qs("[data-act-reopen]", root).hidden = item.status !== "disputed";

    qs("[data-act-version]", root).href = "/studio/new/?parent=" + encodeURIComponent(item.id);

    qs("[data-act-revoke]", root).addEventListener("click", function () {
      if (!confirm("Take back is final. The old fingerprint stays; the status becomes “taken back.”")) return;
      revoke(item.id);
      location.reload();
    });
    qs("[data-act-dispute]", root).addEventListener("click", function () {
      dispute(item.id);
      location.reload();
    });
    qs("[data-act-reopen]", root).addEventListener("click", function () {
      reopen(item.id);
      location.reload();
    });
    qs("[data-dl-vault]", root).addEventListener("click", function () {
      exportVault(item);
    });
    qs("[data-dl-record]", root).addEventListener("click", function () {
      exportRecord(item);
    });
    qs("[data-copy-link]", root).addEventListener("click", function () {
      var url = location.origin + "/studio/c/?id=" + encodeURIComponent(item.id);
      if (navigator.clipboard) navigator.clipboard.writeText(url);
      this.textContent = "Copied (this browser only)";
    });

    qs("[data-act-verify]", root).addEventListener("click", function () {
      verifyLocal(item).then(function (r) {
        var box = qs("[data-verify-out]", root);
        box.hidden = false;
        box.className = "v-result " + (r.ok ? "yes" : "no");
        box.textContent = r.outcome + " · " + r.message;
      });
    });

    if (countCreated() >= FREE_SOFT_CAP) {
      var cap = qs("[data-cap-note]", root);
      if (cap) cap.hidden = false;
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  bootList();
  bootCreate();
  bootDash();
})();
