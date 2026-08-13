/* QAL — learn by playing (browser-only demo, no real chain) */
(function () {
  "use strict";

  var root = document.getElementById("play");
  if (!root) return;

  var state = {
    step: 0,
    score: 0,
    content: null,
    phrase: "",
    vault: null,
    fingerprint: null,
    chain: null, // { fp, status }
    finished: false,
  };

  var STEPS = 6;
  var pickHandler = null;

  function scene() {
    return window.QALScene || null;
  }

  function phaseForStep(n) {
    if (n === 0) return "idle";
    if (n === 1) return "pick";
    if (n === 2) return "lock";
    if (n === 3) return "hash";
    if (n === 4) return "stamp";
    if (n === 5) return "attack";
    if (n === 6) return "verify";
    return "celebrate";
  }

  function caption(text) {
    var el = root.querySelector("[data-caption]");
    if (el) el.textContent = text;
    var s = scene();
    if (s && s.setCaption) s.setCaption(text);
  }

  function syncScene() {
    var s = scene();
    if (!s || !s.ready) return;
    s.setPhase(phaseForStep(state.step));
    if (state.content && state.step >= 2 && s.selectDoc) {
      /* selectDoc also jumps to lock — only when entering lock */
    }
  }

  function onScenePick(name) {
    if (pickHandler) pickHandler(name);
  }

  function setPick(fn) {
    pickHandler = fn;
    var s = scene();
    if (s && s.onPick) s.onPick(fn);
  }

  function hideStartOverlay() {
    var ov = root.querySelector("[data-start-overlay]");
    if (ov) ov.hidden = true;
    root.classList.add("playing");
  }

  function showStartOverlay() {
    var ov = root.querySelector("[data-start-overlay]");
    if (ov) ov.hidden = false;
    root.classList.remove("playing");
  }

  window.addEventListener("qal-scene-ready", function () {
    var s = scene();
    if (s && s.onPick) s.onPick(onScenePick);
    syncScene();
  });
  window.addEventListener("qal-pick", function (e) {
    onScenePick(e.detail);
  });

  var startOv = root.querySelector("[data-start-overlay]");
  if (startOv) {
    startOv.addEventListener("click", function () {
      hideStartOverlay();
      state.step = 1;
      render();
    });
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  async function sha256Hex(str) {
    var data = new TextEncoder().encode(str);
    var buf = await crypto.subtle.digest("SHA-256", data);
    var arr = Array.from(new Uint8Array(buf));
    return arr
      .map(function (b) {
        return b.toString(16).padStart(2, "0");
      })
      .join("");
  }

  function shortFp(fp) {
    if (!fp) return "—";
    return fp.slice(0, 8) + "…" + fp.slice(-6);
  }

  function scoreAdd(n, why) {
    state.score += n;
    var s = root.querySelector("[data-score]");
    if (s) {
      s.textContent = String(state.score);
      s.classList.remove("pop");
      void s.offsetWidth;
      s.classList.add("pop");
    }
    if (why) toast("+" + n + " · " + why, "ok");
  }

  function toast(msg, kind) {
    var t = root.querySelector("[data-toast]");
    if (!t) return;
    t.textContent = msg;
    t.className = "play-toast show" + (kind ? " " + kind : "");
    clearTimeout(toast._timer);
    toast._timer = setTimeout(function () {
      t.classList.remove("show");
    }, 2200);
  }

  function setProgress() {
    var fill = root.querySelector("[data-play-fill]");
    var label = root.querySelector("[data-play-level]");
    var pct = Math.round((state.step / STEPS) * 100);
    if (fill) fill.style.width = pct + "%";
    if (label) {
      label.textContent =
        state.step >= STEPS ? "Done" : "Level " + (state.step + 1) + " / " + STEPS;
    }
  }

  function stageShell(title, blurb) {
    var stage = root.querySelector("[data-stage]");
    clear(stage);
    stage.className = "play-stage in";
    var h = el("h3", "play-title", title);
    var p = el("p", "play-blurb", blurb);
    stage.appendChild(h);
    stage.appendChild(p);
    var body = el("div", "play-body");
    stage.appendChild(body);
    var actions = el("div", "play-actions");
    stage.appendChild(actions);
    return { body: body, actions: actions, stage: stage };
  }

  function btn(label, cls, onClick) {
    var b = el("button", "play-btn" + (cls ? " " + cls : ""), label);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  function choice(label, good, onPick) {
    var b = btn(label, "choice", function () {
      if (b.disabled) return;
      var siblings = b.parentNode.querySelectorAll(".play-btn");
      siblings.forEach(function (x) {
        x.disabled = true;
      });
      if (good) {
        b.classList.add("good");
        scoreAdd(10, "nice");
        setTimeout(onPick, 450);
      } else {
        b.classList.add("bad");
        toast("Not quite — try the other path", "warn");
        setTimeout(function () {
          siblings.forEach(function (x) {
            x.disabled = false;
            x.classList.remove("bad");
          });
        }, 700);
      }
    });
    return b;
  }

  /* ---------- LEVELS ---------- */

  function level0() {
    showStartOverlay();
    caption("Lock a promise. Catch a fake website.");
    setPick(function (name) {
      if (name === "start" || name === "lock") {
        hideStartOverlay();
        state.step = 1;
        render();
      }
    });
    var ui = stageShell(
      "Try it yourself",
      "Lock a promise. Post only a fingerprint. Catch a site that swapped the file."
    );
    ui.actions.appendChild(
      btn("Start", "primary", function () {
        hideStartOverlay();
        state.step = 1;
        render();
      })
    );
  }

  function pickContent(p) {
    state.content = {
      id: p.id,
      label: p.label,
      body:
        p.id === "promise"
          ? "We commit not to sell team tokens for 90 days from launch."
          : p.id === "vest"
            ? "Team unlock: 0% day 0, linear over 12 months after 3-month cliff."
            : "Release v0.3.1 sha256: demo-build-abc123 (example).",
    };
    var s = scene();
    if (s && s.selectDoc) s.selectDoc(p.id);
    scoreAdd(10, "sealed choice");
    state.step = 2;
    render();
  }

  function level1() {
    hideStartOverlay();
    caption("Pick what to lock — a page on the left, or a card here.");
    var picks = [
      { id: "promise", label: "“We won’t dump for 90 days” letter", icon: "📜" },
      { id: "vest", label: "Team vesting schedule", icon: "📅" },
      { id: "build", label: "Build hashes / release note", icon: "🧩" },
    ];
    var byId = {};
    picks.forEach(function (p) {
      byId[p.id] = p;
    });
    setPick(function (name) {
      if (name && name.indexOf("doc:") === 0) {
        var id = name.slice(4);
        if (byId[id]) pickContent(byId[id]);
      }
    });
    var ui = stageShell(
      "What should people be able to check later?",
      "Pick a promise. You will lock it here — not post the words."
    );
    var grid = el("div", "play-grid");
    picks.forEach(function (p) {
      var card = el("button", "play-card", "");
      card.type = "button";
      card.innerHTML =
        '<span class="ico">' +
        p.icon +
        "</span><span class=\"lab\">" +
        p.label +
        "</span>";
      card.addEventListener("click", function () {
        pickContent(p);
      });
      grid.appendChild(card);
    });
    ui.body.appendChild(grid);
  }

  function level2() {
    caption("Tap a phrase below to lock the file.");
    var advanced = false;
    function goHash() {
      if (advanced) return;
      if (!state.vault) {
        toast("Pick a phrase first", "warn");
        return;
      }
      advanced = true;
      state.step = 3;
      render();
    }
    setPick(function (name) {
      if (name === "lock") {
        if (state.vault) goHash();
        else toast("Pick a phrase first", "warn");
      }
    });
    var ui = stageShell(
      "Pick a phrase to lock it",
      "Tap one of the three. That’s the next step — nothing is posted yet."
    );

    var row = el("div", "play-phrase-row");
    var nextBtn = btn("Continue →", "primary", goHash);
    nextBtn.disabled = true;

    var preview = el("div", "play-vault locked");
    preview.innerHTML =
      '<div class="v-label">Locked vault</div><div class="v-cipher" data-cipher>waiting…</div>';

    function lockWith(ph) {
      if (advanced) return;
      state.phrase = ph;
      row.querySelectorAll(".play-btn").forEach(function (b) {
        b.classList.toggle("picked", b.textContent === ph);
      });
      var raw =
        "QEV|" +
        state.phrase +
        "|" +
        state.content.body +
        "|" +
        state.content.id;
      state.vault = btoa(unescape(encodeURIComponent(raw)))
        .replace(/=+$/, "")
        .slice(0, 48);
      var c = preview.querySelector("[data-cipher]");
      preview.classList.add("scrambling");
      var s = scene();
      if (s && s.seal) s.seal();
      caption("Locked. Press Continue.");
      nextBtn.disabled = false;
      nextBtn.classList.add("ready");
      animateCipher(c, state.vault, function () {
        preview.classList.remove("scrambling");
        preview.classList.add("sealed");
        scoreAdd(15, "locked offline");
      });
    }

    ["aurora-kite-7", "moon-river-42", "quiet-oak-19"].forEach(function (ph) {
      row.appendChild(
        btn(ph, "phrase", function () {
          lockWith(ph);
        })
      );
    });
    ui.body.appendChild(row);
    ui.actions.appendChild(nextBtn);
    ui.body.appendChild(preview);
    ui.body.appendChild(
      el("p", "play-hint", "Practice lock. The real app uses a stronger one.")
    );
  }

  function animateCipher(node, final, done) {
    if (!node) {
      if (done) done();
      return;
    }
    var chars = "abcdef0123456789XYZqev";
    var i = 0;
    var ticks = 14;
    var t = setInterval(function () {
      i++;
      var s = "";
      for (var k = 0; k < final.length; k++) {
        s +=
          i > ticks - 3
            ? final[k]
            : chars[(Math.random() * chars.length) | 0];
      }
      node.textContent = s;
      if (i >= ticks) {
        clearInterval(t);
        node.textContent = final;
        if (done) done();
      }
    }, 45);
  }

  async function level3() {
    caption("Click the lock, or press the button — make the fingerprint.");
    var ui = stageShell(
      "Make the fingerprint",
      "One short code for this exact locked file. Change one letter, the code changes."
    );
    var board = el("div", "play-fp-board");
    board.innerHTML =
      '<div class="fp-box"><span class="lbl">Vault</span><code data-v></code></div>' +
      '<div class="fp-arrow">↓ hash</div>' +
      '<div class="fp-box big"><span class="lbl">Fingerprint</span><code data-f class="fp">—</code></div>';
    board.querySelector("[data-v]").textContent = state.vault;
    ui.body.appendChild(board);

    var hashing = false;
    async function doHash() {
      if (hashing) return;
      hashing = true;
      go.disabled = true;
      var fp = await sha256Hex(state.vault);
      state.fingerprint = fp;
      var node = board.querySelector("[data-f]");
      await typeOut(node, fp);
      caption("Fingerprint ready. Only this tiny code is meant to be public.");
      scoreAdd(15, "fingerprint ready");
      setTimeout(function () {
        state.step = 4;
        render();
      }, 600);
    }
    setPick(function (name) {
      if (name === "lock") doHash();
    });
    var go = btn("Make the fingerprint", "primary", doHash);
    ui.actions.appendChild(go);
  }

  function typeOut(node, text) {
    return new Promise(function (resolve) {
      node.textContent = "";
      node.classList.add("typing");
      var i = 0;
      var t = setInterval(function () {
        i += 4;
        node.textContent = text.slice(0, i);
        if (i >= text.length) {
          clearInterval(t);
          node.textContent = text;
          node.classList.remove("typing");
          resolve();
        }
      }, 20);
    });
  }

  function level4() {
    caption("What gets posted? Only the fingerprint — tap that option.");
    var ui = stageShell(
      "What gets posted in public?",
      "Pick the safe one. The words and the phrase stay on your computer."
    );

    var slots = el("div", "play-slots");
    var opts = [
      {
        label: "The secret phrase",
        good: false,
        why: "Never. The phrase stays on your computer.",
      },
      {
        label: "The full note, readable by anyone",
        good: false,
        why: "No — the words stay private.",
      },
      {
        label: "Only the fingerprint",
        good: true,
        why: "Yes — a tiny public proof. Not the file.",
      },
    ];
    var stampedOnce = false;
    function pickStamp(opt) {
      if (stampedOnce) return;
      stampedOnce = true;
      state.chain = { fp: state.fingerprint, status: "active" };
      var s = scene();
      if (s && s.stamp) s.stamp();
      toast(opt.why, "ok");
      scoreAdd(20, "posted");
      caption("Posted. The public record holds a fingerprint — not the file.");
      setTimeout(function () {
        state.step = 5;
        render();
      }, 700);
    }
    opts.forEach(function (opt) {
      slots.appendChild(
        choice(opt.label, opt.good, function () {
          pickStamp(opt);
        })
      );
    });
    setPick(function (name) {
      if (name === "stamp:fp") pickStamp(opts[2]);
      else if (name === "stamp:phrase") toast("Never. The phrase stays on your computer.", "warn");
      else if (name === "stamp:note") toast("No — the words stay private.", "warn");
    });
    ui.body.appendChild(slots);

    var chain = el("div", "play-chain idle");
    chain.innerHTML =
      '<div class="chain-title">Public record (demo)</div>' +
      '<div class="chain-row">status: <em>empty</em></div>' +
      '<div class="chain-row">fp: <code>—</code></div>';
    ui.body.appendChild(chain);

    // when they pick right, we re-render soon; also pulse chain on success via next level
  }

  function level5() {
    caption("They swapped the PDF. Click the lock — not the fake website.");
    var s3 = scene();
    if (s3 && s3.attack) {
      setTimeout(function () {
        if (s3.attack) s3.attack();
      }, 400);
    }
    var ui = stageShell(
      "They changed the website",
      "The site flickers. The locked file does not. What is still true?"
    );

    var chain = el("div", "play-chain live");
    chain.innerHTML =
      '<div class="chain-title">Public record (demo)</div>' +
      '<div class="chain-row">status: <strong class="ok-t">active</strong></div>' +
      '<div class="chain-row">fp: <code>' +
      shortFp(state.chain.fp) +
      "</code></div>";
    ui.body.appendChild(chain);

    var duel = el("div", "play-scene");
    duel.innerHTML =
      '<div class="site-fake">team.site / roadmap.pdf <span class="tag">EDITED</span></div>' +
      '<div class="vs">vs</div>' +
      '<div class="vault-old">locked file <span class="tag ok">UNCHANGED</span></div>';
    ui.body.appendChild(duel);

    var answered = false;
    function caught() {
      if (answered) return;
      answered = true;
      scoreAdd(20, "you caught the trick");
      caption("The website lied. The fingerprint did not.");
      state.step = 6;
      render();
    }
    setPick(function (name) {
      if (name === "attack:match" || name === "lock") caught();
      else if (name === "attack:rewrite") toast("The public record does not rewrite the old fingerprint", "warn");
      else if (name === "attack:trust") toast("That’s the trap — don’t trust the website alone", "warn");
    });

    var slots = el("div", "play-slots");
    [
      {
        label: "The fingerprint still matches the locked file",
        good: true,
      },
      {
        label: "The public record rewrites itself to match the new PDF",
        good: false,
      },
      {
        label: "Everyone has to trust the website forever",
        good: false,
      },
    ].forEach(function (opt) {
      slots.appendChild(
        choice(opt.label, opt.good, function () {
          caught();
        })
      );
    });
    ui.body.appendChild(slots);
  }

  async function level6() {
    caption("Check the fake file first, then the real one.");
    var ui = stageShell(
      "Now you check",
      "Compare this file to the public fingerprint. Try the fake first."
    );

    var panel = el("div", "play-verify");
    panel.innerHTML =
      '<div class="v-row"><span>Public record</span><code data-c></code></div>' +
      '<div class="v-row"><span>This file</span><code data-f>—</code></div>' +
      '<div class="v-result" data-r>Pick a file to check</div>';
    panel.querySelector("[data-c]").textContent = shortFp(state.chain.fp);
    ui.body.appendChild(panel);

    var actions = el("div", "play-slots");
    var realBtn = btn("Check the real file", "primary", async function () {
      realBtn.disabled = true;
      fakeBtn.disabled = true;
      var s = scene();
      if (s && s.verify) s.verify("real");
      var fp = await sha256Hex(state.vault);
      panel.querySelector("[data-f]").textContent = shortFp(fp);
      var r = panel.querySelector("[data-r]");
      if (fp === state.chain.fp && state.chain.status === "active") {
        r.textContent = "MATCH · still live";
        r.className = "v-result yes";
        caption("Match. Anyone can check this — no website required.");
        scoreAdd(25, "checked");
        setTimeout(finish, 700);
      }
    });
    var fakeBtn = btn("Check the fake file", "ghost", async function () {
      var s = scene();
      if (s && s.verify) s.verify("fake");
      var bad = state.vault.slice(0, -1) + "X";
      var fp = await sha256Hex(bad);
      panel.querySelector("[data-f]").textContent = shortFp(fp);
      var r = panel.querySelector("[data-r]");
      r.textContent = "NO MATCH · file was changed";
      r.className = "v-result no";
      toast("Changed file — that’s the whole point", "warn");
      scoreAdd(10, "caught a fake");
      // allow real check after
      realBtn.disabled = false;
    });
    setPick(function (name) {
      if (name === "verify:fake") fakeBtn.click();
      else if (name === "verify:real" || name === "lock") realBtn.click();
    });
    actions.appendChild(realBtn);
    actions.appendChild(fakeBtn);
    ui.body.appendChild(actions);
    ui.body.appendChild(
      el(
        "p",
        "play-hint",
        "Tip: try the fake first, then the real one."
      )
    );
  }

  function finish() {
    state.step = STEPS;
    state.finished = true;
    setProgress();
    caption("You got it. Lock here. Post a fingerprint. Anyone can check.");
    var s = scene();
    if (s && s.celebrate) s.celebrate();
    setPick(null);
    var ui = stageShell(
      "You got it",
      "Lock the file on your computer. Post only a fingerprint. Anyone can check later. The words never leave this machine."
    );
    var recap = el("div", "play-recap");
    recap.innerHTML =
      "<ul>" +
      "<li><strong>Locked:</strong> " +
      escapeHtml(state.content.label) +
      "</li>" +
      "<li><strong>Fingerprint:</strong> <code>" +
      shortFp(state.fingerprint) +
      "</code></li>" +
      "<li><strong>Score:</strong> " +
      state.score +
      "</li>" +
      "</ul>";
    ui.body.appendChild(recap);

    var next = el("div", "play-slots");
    next.appendChild(
      el("a", "play-btn primary", "Lock a real claim")
    );
    next.lastChild.href = "/studio/new/";
    next.appendChild(el("a", "play-btn", "For builders"));
    next.lastChild.href = "/devs/";
    next.appendChild(
      btn("Play again", "ghost", function () {
        reset();
      })
    );
    next.appendChild(el("a", "play-btn ghost", "Verify a vault"));
    next.lastChild.href = "/verify/";
    ui.actions.appendChild(next);
    ui.body.appendChild(
      el(
        "p",
        "play-hint",
        "You just caught a swapped file. Next: lock a real claim the same way."
      )
    );
    confettiLite(root);
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function confettiLite(host) {
    var layer = el("div", "play-confetti");
    host.appendChild(layer);
    for (var i = 0; i < 18; i++) {
      var d = el("i", "");
      d.style.left = Math.random() * 100 + "%";
      d.style.animationDelay = Math.random() * 0.4 + "s";
      d.style.background =
        ["#c45c26", "#0b4f6c", "#2d6a4f", "#e8a838"][(Math.random() * 4) | 0];
      layer.appendChild(d);
    }
    setTimeout(function () {
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    }, 1600);
  }

  function reset() {
    state = {
      step: 0,
      score: 0,
      content: null,
      phrase: "",
      vault: null,
      fingerprint: null,
      chain: null,
      finished: false,
    };
    var s = root.querySelector("[data-score]");
    if (s) s.textContent = "0";
    render();
  }

  function render() {
    setProgress();
    var s = scene();
    if (s && s.setPhase) s.setPhase(phaseForStep(state.step));
    var pipe = (function () {
      if (state.step <= 2) return 0;
      if (state.step <= 4) return 1;
      return 2;
    })();
    document.querySelectorAll(".pipe-node").forEach(function (n, i) {
      n.classList.toggle("active", i === pipe);
    });
    document.querySelectorAll(".pipe-beam i").forEach(function (b, i) {
      b.classList.toggle("flow", i < pipe);
    });
    var n = state.step;
    if (n === 0) level0();
    else if (n === 1) level1();
    else if (n === 2) level2();
    else if (n === 3) level3();
    else if (n === 4) level4();
    else if (n === 5) level5();
    else if (n === 6) level6();
    else finish();
  }

  // boot shell is already in HTML
  render();
})();
