/* Live Devnet proof — public RPC only. Never embed paid API keys. */
(function () {
  "use strict";

  var RPCS = [
    "/rpc",
    "https://api.devnet.solana.com",
    "https://solana-devnet.publicnode.com",
  ];

  var NETWORK_FAIL =
    "Could not refresh Devnet status (network). Signatures below still open in Explorer.";

  /* Public Devnet facts. Used so hrefs are real before proof.json / RPC. */
  var FALLBACK = {
    program_id: "6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR",
    upgrade_authority: "3ZYTW6D7J5NRZTekzvb51GP2RfUawkviJgXuxy3rcWnz",
    deploy_tx:
      "2G4pDhJ8b1ZWFjNzUcorMGTbKpVTqhk6Yqa6R3srBwkT3K4qnYWUc5Sa32HzyL8DpTo6oPW4eG54pQz9opSHKrkt",
    anchor_tx:
      "59XbtbVffPcwvA4RbK8NppTrKGQJemY68xZQSBcGaMLMYuuGfWrgEk9FjrQELbA4qTMgvzFjurL5WFK5BhgTwzRY",
    revoke_tx:
      "4RPtdtFGczEqeaehsf98ZF51XNq7qNCv98qUjk2eTkALFDp4nYs3XY1nbCbAaxQ2qH15wdEhEUKPtaxiCxsn5Z81",
    supersede_tx:
      "NzVJ8A37EzprcLV7x2X4QyXPdFeUdqqJnhPUKwM5ogUMW8iqhG2kjksyH7Q75sN1YPACAJb7b4gvVaZLErLba3C",
    anchor: "5yhfcBtHWwtDt6P23rdgHXosC6p8kv2YSjWjpSp6Rqma",
    fingerprint:
      "2379d8e35bfd5fcba022eee231704e2b2e7383efe8260b191b82bcdc952928a0",
    final_status: "revoked",
    vault_bytes_persisted: false,
    check_from_proof: false,
    explorer: {
      program:
        "https://explorer.solana.com/address/6cN9gD8LBqkEUhvT4LibnbBgXdCHeC5AgqvcFQQTNvnR?cluster=devnet",
      deploy:
        "https://explorer.solana.com/tx/2G4pDhJ8b1ZWFjNzUcorMGTbKpVTqhk6Yqa6R3srBwkT3K4qnYWUc5Sa32HzyL8DpTo6oPW4eG54pQz9opSHKrkt?cluster=devnet",
      stamp:
        "https://explorer.solana.com/tx/59XbtbVffPcwvA4RbK8NppTrKGQJemY68xZQSBcGaMLMYuuGfWrgEk9FjrQELbA4qTMgvzFjurL5WFK5BhgTwzRY?cluster=devnet",
      revoke:
        "https://explorer.solana.com/tx/4RPtdtFGczEqeaehsf98ZF51XNq7qNCv98qUjk2eTkALFDp4nYs3XY1nbCbAaxQ2qH15wdEhEUKPtaxiCxsn5Z81?cluster=devnet",
      supersede:
        "https://explorer.solana.com/tx/NzVJ8A37EzprcLV7x2X4QyXPdFeUdqqJnhPUKwM5ogUMW8iqhG2kjksyH7Q75sN1YPACAJb7b4gvVaZLErLba3C?cluster=devnet",
      pda:
        "https://explorer.solana.com/address/5yhfcBtHWwtDt6P23rdgHXosC6p8kv2YSjWjpSp6Rqma?cluster=devnet",
      pda_b:
        "https://explorer.solana.com/address/qmusbkdkbVwNRsqtNzBE9xM2F48M6LRKe83hx1LtpWG?cluster=devnet",
    },
    files: [
      {
        id: "file-a",
        fingerprint:
          "2379d8e35bfd5fcba022eee231704e2b2e7383efe8260b191b82bcdc952928a0",
        final_status: "revoked",
        stamp_tx:
          "59XbtbVffPcwvA4RbK8NppTrKGQJemY68xZQSBcGaMLMYuuGfWrgEk9FjrQELbA4qTMgvzFjurL5WFK5BhgTwzRY",
        revoke_tx:
          "4RPtdtFGczEqeaehsf98ZF51XNq7qNCv98qUjk2eTkALFDp4nYs3XY1nbCbAaxQ2qH15wdEhEUKPtaxiCxsn5Z81",
        anchor: "5yhfcBtHWwtDt6P23rdgHXosC6p8kv2YSjWjpSp6Rqma",
      },
      {
        id: "file-b",
        fingerprint:
          "e0a65a2651275557350deac05165db56202e9dc706554877f69cceabecab1b32",
        parent_fingerprint:
          "33dd56ed1c31fa3f4500a064f61c6f8c184d620be3d7ac8b76338cc850f1afd5",
        final_status: "active",
        supersede_tx:
          "NzVJ8A37EzprcLV7x2X4QyXPdFeUdqqJnhPUKwM5ogUMW8iqhG2kjksyH7Q75sN1YPACAJb7b4gvVaZLErLba3C",
        anchor: "qmusbkdkbVwNRsqtNzBE9xM2F48M6LRKe83hx1LtpWG",
      },
    ],
  };

  function rpc(method, params) {
    var body = JSON.stringify({ jsonrpc: "2.0", id: 1, method: method, params: params });
    var i = 0;
    function next() {
      if (i >= RPCS.length) {
        var exhausted = new Error("rpc");
        exhausted.network = true;
        return Promise.reject(exhausted);
      }
      var url = RPCS[i++];
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: body,
      }).then(function (r) {
        /* 429 / 5xx are network — never MALFORMED, never “program dead”. */
        if (!r.ok) {
          var httpErr = new Error(r.status === 429 ? "429" : "http");
          httpErr.network = true;
          throw httpErr;
        }
        return r.json();
      }).then(function (j) {
        if (j.error) {
          var rpcErr = new Error(j.error.message || "rpc err");
          rpcErr.network = true;
          throw rpcErr;
        }
        return j.result;
      }).catch(function () {
        return next();
      });
    }
    return next();
  }

  function short(s) {
    if (!s) return "—";
    if (s.length < 20) return s;
    return s.slice(0, 8) + "…" + s.slice(-6);
  }

  function explorerTx(sig) {
    if (!sig) return "";
    return "https://explorer.solana.com/tx/" + sig + "?cluster=devnet";
  }
  function explorerAddr(addr) {
    if (!addr) return "";
    return "https://explorer.solana.com/address/" + addr + "?cluster=devnet";
  }

  function fileById(p, id) {
    var files = p && p.files;
    if (!files || !files.length) return null;
    for (var i = 0; i < files.length; i++) {
      if (files[i] && files[i].id === id) return files[i];
    }
    return null;
  }

  function baked(obj, key) {
    return obj && obj.explorer && obj.explorer[key] ? obj.explorer[key] : "";
  }

  function urlTx(p, file, key, sig) {
    return baked(file, key) || baked(p, key) || explorerTx(sig);
  }

  function urlAddr(p, file, key, addr) {
    return baked(file, key) || baked(p, key) || explorerAddr(addr);
  }

  function setText(sel, text) {
    if (text == null || text === "") return;
    document.querySelectorAll(sel).forEach(function (el) {
      el.textContent = text;
    });
  }

  function setHref(sel, url) {
    if (!url) return;
    document.querySelectorAll(sel).forEach(function (a) {
      a.href = url;
    });
  }

  function markLive(slot) {
    document.querySelectorAll("[data-proof-live]").forEach(function (el) {
      el.hidden = false;
    });
    document.querySelectorAll("[data-proof-down]").forEach(function (el) {
      el.hidden = true;
    });
    document.querySelectorAll("[data-proof-pill]").forEach(function (el) {
      el.textContent = "Live on Devnet";
      el.className = "status-pill st-active";
    });
    if (slot) setText("[data-proof-slot]", String(slot));
  }

  /* RPC 429/fail is not MALFORMED and not a dead program. Keep Explorer hrefs. */
  function markNetworkFail() {
    document.querySelectorAll("[data-proof-live]").forEach(function (el) {
      el.hidden = true;
    });
    document.querySelectorAll("[data-proof-down]").forEach(function (el) {
      el.hidden = false;
      el.textContent = NETWORK_FAIL;
    });
    document.querySelectorAll("[data-proof-pill]").forEach(function (el) {
      el.textContent = "Live status lookup failed";
      el.className = "status-pill";
    });
  }

  function markLookupEmpty() {
    document.querySelectorAll("[data-proof-live]").forEach(function (el) {
      el.hidden = true;
    });
    document.querySelectorAll("[data-proof-down]").forEach(function (el) {
      el.hidden = false;
      el.textContent =
        "This lookup did not return a program account. Signatures below still open in Explorer.";
    });
    document.querySelectorAll("[data-proof-pill]").forEach(function (el) {
      el.textContent = "Account not returned";
      el.className = "status-pill";
    });
  }

  function fillStatic(p) {
    if (!p) return;
    var a = fileById(p, "file-a") || {};
    var b = fileById(p, "file-b") || {};
    var fpA = a.fingerprint || p.fingerprint;
    var fpB = b.fingerprint;
    var stampTx = a.stamp_tx || p.anchor_tx;
    var revokeTx = a.revoke_tx || p.revoke_tx;
    var supersedeTx = b.supersede_tx || p.supersede_tx;
    var pdaA = a.anchor || p.anchor;
    var pdaB = b.anchor;

    var map = {
      "[data-proof-program]": p.program_id,
      "[data-proof-fp]": fpA,
      "[data-proof-fp-a]": fpA,
      "[data-proof-fp-b]": fpB,
      "[data-proof-parent-b]": b.parent_fingerprint || b.parent_digest_claim,
      "[data-proof-issuer]": p.upgrade_authority,
      "[data-proof-status-a]": a.final_status === "revoked" ? "Revoked" : a.final_status,
      "[data-proof-status-b]": b.final_status,
    };
    Object.keys(map).forEach(function (sel) {
      setText(sel, map[sel]);
    });
    document.querySelectorAll("[data-proof-program-short]").forEach(function (el) {
      el.textContent = short(p.program_id);
    });
    document.querySelectorAll("[data-proof-fp-short]").forEach(function (el) {
      el.textContent = short(fpA);
    });
    document.querySelectorAll("[data-proof-fp-b-short]").forEach(function (el) {
      el.textContent = short(fpB);
    });

    setHref("a[data-href-program]", urlAddr(p, null, "program", p.program_id));
    setHref("a[data-href-deploy]", urlTx(p, null, "deploy", p.deploy_tx));
    setHref("a[data-href-anchor]", urlTx(p, a, "stamp", stampTx));
    setHref("a[data-href-revoke]", urlTx(p, a, "revoke", revokeTx));
    setHref("a[data-href-supersede]", urlTx(p, b, "supersede", supersedeTx));
    setHref("a[data-href-pda]", urlAddr(p, a, "pda", pdaA));
    setHref("a[data-href-file-a-stamp]", urlTx(p, a, "stamp", stampTx));
    setHref("a[data-href-file-a-revoke]", urlTx(p, a, "revoke", revokeTx));
    setHref("a[data-href-file-a-pda]", urlAddr(p, a, "pda", pdaA));
    setHref("a[data-href-file-b-supersede]", urlTx(p, b, "supersede", supersedeTx));
    setHref("a[data-href-file-b-pda]", urlAddr(p, b, "pda_b", pdaB) || urlAddr(p, b, "pda", pdaB));

    if (p.copy && p.copy.check_cta) {
      setText("[data-proof-check-note]", p.copy.check_cta);
    }
    var demo = p.demo || {};
    if (demo.fingerprint) setText("[data-proof-fp-demo]", demo.fingerprint);
    if (demo.stamp_tx || (demo.explorer && demo.explorer.stamp)) {
      setHref(
        "a[data-href-demo-stamp]",
        (demo.explorer && demo.explorer.stamp) || explorerTx(demo.stamp_tx),
      );
    }
    if (demo.anchor || (demo.explorer && demo.explorer.pda)) {
      setHref(
        "a[data-href-demo-pda]",
        (demo.explorer && demo.explorer.pda) || explorerAddr(demo.anchor),
      );
    }
  }

  function refresh(p) {
    return rpc("getAccountInfo", [
      p.program_id,
      { encoding: "base64" },
    ]).then(function (res) {
      if (res && res.value) {
        markLive(res.context && res.context.slot);
      } else {
        markLookupEmpty();
      }
      return rpc("getTransaction", [
        p.anchor_tx,
        { encoding: "json", maxSupportedTransactionVersion: 0 },
      ]).then(function (tx) {
        if (tx && tx.slot) {
          setText("[data-proof-anchor-slot]", String(tx.slot));
        }
        if (tx && tx.meta && tx.meta.err == null) {
          setText("[data-proof-anchor-ok]", "confirmed");
        }
      }).catch(function () {
        /* Explorer links already set. Do not treat missing tx meta as dead. */
      });
    }).catch(function () {
      markNetworkFail();
    });
  }

  function boot() {
    var roots = document.querySelectorAll("[data-proof]");
    if (!roots.length) return;

    fillStatic(FALLBACK);

    fetch("/evidence/devnet/proof.json")
      .then(function (r) {
        if (!r.ok) throw new Error("proof.json");
        return r.json();
      })
      .then(function (p) {
        fillStatic(p);
        return refresh(p);
      })
      .catch(function () {
        markNetworkFail();
      });
  }

  boot();
})();
