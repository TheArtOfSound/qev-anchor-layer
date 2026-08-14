/* QAL site — funding bar, copy, light motion */
(function () {
  "use strict";

  var FUND_WALLET = "8976JDnWQqq7uFfwJza82gZSkGj4PMGMY4JLh8b7TDGe";
  var GOAL_SOL = 25; // next public milestone fund
  var RPCS = [
    "https://api.mainnet-beta.solana.com",
    "https://solana-rpc.publicnode.com",
  ];

  /* ---------- copy buttons ---------- */
  function wireCopy(btn, getText) {
    if (!btn) return;
    btn.addEventListener("click", function () {
      var text = getText();
      function done() {
        var old = btn.getAttribute("data-label") || btn.textContent;
        btn.setAttribute("data-label", old);
        btn.textContent = "Copied";
        btn.classList.add("done");
        setTimeout(function () {
          btn.textContent = btn.getAttribute("data-label") || "Copy";
          btn.classList.remove("done");
        }, 1600);
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(function () {
          window.prompt("Copy:", text);
        });
      } else {
        window.prompt("Copy:", text);
      }
    });
  }

  /* data-copy-value carries the full string when the page shows a
     shortened one (program ids, digests). data-copy points at an element
     and copies its text. */
  document
    .querySelectorAll("[data-copy], [data-copy-value]")
    .forEach(function (btn) {
      var full = btn.getAttribute("data-copy-value");
      var sel = btn.getAttribute("data-copy");
      var el = sel ? document.querySelector(sel) : null;
      wireCopy(btn, function () {
        if (full) return full;
        return el ? el.textContent.trim() : FUND_WALLET;
      });
    });

  /* legacy ids */
  wireCopy(document.getElementById("copy-wallet"), function () {
    var a = document.getElementById("wallet-addr");
    return a ? a.textContent.trim() : FUND_WALLET;
  });

  /* ---------- funding bar ---------- */
  function setBar(sol, animated) {
    var fill = document.querySelectorAll("[data-fund-fill]");
    var amountEls = document.querySelectorAll("[data-fund-amount]");
    var pctEls = document.querySelectorAll("[data-fund-pct]");
    var statusEls = document.querySelectorAll("[data-fund-status]");
    var pct = Math.min(100, Math.max(0, (sol / GOAL_SOL) * 100));
    var rounded = Math.round(pct);

    amountEls.forEach(function (el) {
      el.textContent = formatSol(sol);
    });
    pctEls.forEach(function (el) {
      el.textContent = String(rounded);
    });
    statusEls.forEach(function (el) {
      if (sol <= 0.001) {
        el.textContent = "Waiting on first support";
      } else if (pct >= 100) {
        el.textContent = "Goal met — thank you";
      } else {
        el.textContent = formatSol(sol) + " of " + GOAL_SOL + " SOL";
      }
    });

    fill.forEach(function (el) {
      if (animated) {
        // restart animation cleanly
        el.style.width = "0%";
        // force reflow
        void el.offsetWidth;
        requestAnimationFrame(function () {
          el.style.width = pct + "%";
        });
      } else {
        el.style.width = pct + "%";
      }
      el.setAttribute("aria-valuenow", String(rounded));
    });
  }

  function formatSol(n) {
    if (n >= 100) return n.toFixed(1);
    if (n >= 10) return n.toFixed(2);
    if (n >= 1) return n.toFixed(2);
    if (n >= 0.01) return n.toFixed(3);
    return n.toFixed(4);
  }

  function rpcBalance(rpcUrl) {
    return fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "getBalance",
        params: [FUND_WALLET],
      }),
    })
      .then(function (r) {
        if (!r.ok) throw new Error("rpc http");
        return r.json();
      })
      .then(function (j) {
        if (!j.result || typeof j.result.value !== "number") {
          throw new Error("rpc shape");
        }
        return j.result.value / 1e9;
      });
  }

  function loadBalance(i) {
    i = i || 0;
    if (i >= RPCS.length) {
      setBar(0, true);
      document.querySelectorAll("[data-fund-status]").forEach(function (el) {
        el.textContent = "Balance unavailable — try again later";
      });
      return;
    }
    rpcBalance(RPCS[i])
      .then(function (sol) {
        setBar(sol, true);
      })
      .catch(function () {
        loadBalance(i + 1);
      });
  }

  // paint goal labels + empty bar immediately
  document.querySelectorAll("[data-fund-goal]").forEach(function (el) {
    el.textContent = String(GOAL_SOL);
  });
  setBar(0, false);
  loadBalance(0);

  /* ---------- walkthrough motion ---------- */
  var steps = document.querySelectorAll(".steps > li, .flow-step");
  if (steps.length && "IntersectionObserver" in window) {
    steps.forEach(function (li) {
      li.classList.add("will-show");
    });
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("is-shown");
            io.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.15 }
    );
    steps.forEach(function (li) {
      io.observe(li);
    });
  } else {
    steps.forEach(function (li) {
      li.classList.add("is-shown");
    });
  }

  /* ---------- soft pulse on fund CTA once in view ---------- */
  var fundCtas = document.querySelectorAll(".fund-card, .fund-strip");
  if (fundCtas.length && "IntersectionObserver" in window) {
    var fo = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("fund-in");
            fo.unobserve(e.target);
          }
        });
      },
      { threshold: 0.25 }
    );
    fundCtas.forEach(function (el) {
      fo.observe(el);
    });
  }

  /* ---------- nav: tap to open Product / Learn ---------- */
  document.querySelectorAll(".nav-group").forEach(function (g) {
    var parent = g.querySelector(".nav-parent");
    if (!parent) return;
    parent.addEventListener("click", function (e) {
      if (window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
        return;
      }
      if (!g.classList.contains("open")) {
        e.preventDefault();
        document.querySelectorAll(".nav-group.open").forEach(function (o) {
          if (o !== g) o.classList.remove("open");
        });
        g.classList.add("open");
      }
    });
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest || !e.target.closest(".nav-group")) {
      document.querySelectorAll(".nav-group.open").forEach(function (g) {
        g.classList.remove("open");
      });
    }
  });

  /* ---------- hero + section reveal ---------- */
  var reducedMotion =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (!reducedMotion) {
    document.body.classList.add("motion-on");

    var heroWords = document.querySelectorAll(".hero-word");
    heroWords.forEach(function (w, i) {
      w.style.animationDelay = i * 0.07 + "s";
    });

    var pipeline = document.querySelector(".hero-pipeline");
    if (pipeline) {
      var nodes = pipeline.querySelectorAll(".pipe-node");
      var beams = pipeline.querySelectorAll(".pipe-beam i");
      var step = 0;

      function pulsePipeline() {
        if (document.getElementById("play") && document.getElementById("play").classList.contains("playing")) {
          return;
        }
        nodes.forEach(function (n, i) {
          n.classList.toggle("active", i === step);
        });
        beams.forEach(function (b, i) {
          b.classList.toggle("flow", i < step);
        });
        step = (step + 1) % 3;
      }

      pulsePipeline();
      setInterval(pulsePipeline, 2200);
    }
  }

  /* breath cards replay a 3D beat — never steal the theater mid-play */
  document.querySelectorAll("[data-breath]").forEach(function (card) {
    card.addEventListener("click", function () {
      var play = document.getElementById("play");
      if (play && play.classList.contains("playing")) return;
      var beat = Number(card.getAttribute("data-breath") || 0);
      if (play) play.scrollIntoView({ behavior: "smooth", block: "start" });
      var s = window.QALScene;
      if (s && s.replay) s.replay(beat);
      var captions = [
        "Lock the file on your computer.",
        "Post only a fingerprint — not the words.",
        "Anyone can check later. A website can lie. The match cannot.",
      ];
      var cap = document.querySelector("[data-caption]");
      if (cap && captions[beat]) cap.textContent = captions[beat];
    });
  });

  var reveals = document.querySelectorAll(".reveal, .breath-card");
  if (reveals.length && "IntersectionObserver" in window) {
    reveals.forEach(function (el) {
      el.classList.add("will-show");
    });
    var ro = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            e.target.classList.add("is-shown");
            ro.unobserve(e.target);
          }
        });
      },
      { rootMargin: "0px 0px -6% 0px", threshold: 0.12 }
    );
    reveals.forEach(function (el) {
      ro.observe(el);
    });
  } else {
    reveals.forEach(function (el) {
      el.classList.add("is-shown");
    });
  }

  /* breath cards — tilt on hover */
  document.querySelectorAll(".breath-card").forEach(function (card) {
    card.addEventListener("pointermove", function (e) {
      if (reducedMotion) return;
      var r = card.getBoundingClientRect();
      var x = (e.clientX - r.left) / r.width - 0.5;
      var y = (e.clientY - r.top) / r.height - 0.5;
      card.style.transform =
        "perspective(600px) rotateY(" +
        x * 10 +
        "deg) rotateX(" +
        -y * 10 +
        "deg) translateY(-2px)";
    });
    card.addEventListener("pointerleave", function () {
      card.style.transform = "";
    });
  });
})();
