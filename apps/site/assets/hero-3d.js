/* QAL theater — play-driven Three.js scene (lock → hash → stamp → catch a fake) */
import * as THREE from "/assets/vendor/three.module.min.js";

(function () {
  "use strict";

  var canvas = document.getElementById("hero-canvas");
  if (!canvas) return;

  var reduced =
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  var api = {
    ready: false,
    phase: "idle",
    setPhase: function () {},
    selectDoc: function () {},
    seal: function () {},
    stamp: function () {},
    attack: function () {},
    verify: function () {},
    celebrate: function () {},
    replay: function () {},
    reset: function () {},
    onPick: function () {},
    setHot: function () {},
    setCaption: function () {},
  };
  window.QALScene = api;

  if (reduced) {
    api.ready = true;
    window.dispatchEvent(new CustomEvent("qal-scene-ready"));
    return;
  }

  var w = 0;
  var h = 0;
  var mouse = { x: 0, y: 0 };
  var pointer = new THREE.Vector2();
  var pickCb = null;
  var hoverName = "";

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: true,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch (err) {
    api.ready = true;
    window.dispatchEvent(new CustomEvent("qal-scene-ready"));
    return;
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);
  if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) {
    renderer.outputColorSpace = THREE.SRGBColorSpace;
  }

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80);
  camera.position.set(0, 0.55, 7.4);

  var camGoal = new THREE.Vector3(0, 0.55, 7.4);
  var lookGoal = new THREE.Vector3(0, 0.05, 0);
  var lookNow = new THREE.Vector3(0, 0.05, 0);

  scene.add(new THREE.AmbientLight(0xf4efe6, 0.62));
  var key = new THREE.DirectionalLight(0xfff6ea, 1.45);
  key.position.set(3.2, 5.2, 4.4);
  scene.add(key);
  var rim = new THREE.DirectionalLight(0x4aa3c7, 0.7);
  rim.position.set(-5, 1.4, -2.2);
  scene.add(rim);
  var warm = new THREE.PointLight(0xc45c26, 1.15, 16);
  warm.position.set(2.2, -0.4, 3.2);
  scene.add(warm);
  var fill = new THREE.PointLight(0x2d6a4f, 0.55, 12);
  fill.position.set(-2.6, 1.4, 2);
  scene.add(fill);

  var root = new THREE.Group();
  scene.add(root);

  function track(obj) {
    obj.userData.targetPos = obj.position.clone();
    obj.userData.targetRot = new THREE.Euler().copy(obj.rotation);
    obj.userData.targetScale = obj.scale.x;
    obj.userData.baseEmissive = 0;
    return obj;
  }

  function go(obj, x, y, z) {
    if (!obj.userData.targetPos) track(obj);
    obj.userData.targetPos.set(x, y, z);
  }

  function rot(obj, x, y, z) {
    if (!obj.userData.targetRot) track(obj);
    obj.userData.targetRot.set(x, y, z);
  }

  function scl(obj, s) {
    obj.userData.targetScale = s;
  }

  function labelTex(lines, opts) {
    opts = opts || {};
    var cw = opts.w || 512;
    var ch = opts.h || 320;
    var c = document.createElement("canvas");
    c.width = cw;
    c.height = ch;
    var ctx = c.getContext("2d");
    ctx.fillStyle = opts.bg || "#efece4";
    ctx.fillRect(0, 0, cw, ch);
    if (opts.bar) {
      ctx.fillStyle = opts.bar;
      ctx.fillRect(0, 0, cw, 36);
    }
    ctx.fillStyle = opts.fg || "#1a1a1a";
    ctx.font = "600 36px 'IBM Plex Sans', system-ui, sans-serif";
    var y = opts.bar ? 92 : 70;
    lines.forEach(function (line, i) {
      ctx.font =
        i === 0
          ? "700 42px 'IBM Plex Sans', system-ui, sans-serif"
          : "500 28px 'IBM Plex Sans', system-ui, sans-serif";
      ctx.fillStyle = i === 0 ? opts.fg || "#1a1a1a" : "#5c5a54";
      ctx.fillText(line, 28, y);
      y += i === 0 ? 52 : 40;
    });
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /* ---------- floor / well ---------- */
  var floor = new THREE.Mesh(
    new THREE.CircleGeometry(6.4, 48),
    new THREE.MeshStandardMaterial({
      color: 0x1b1916,
      metalness: 0.15,
      roughness: 0.85,
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.05;
  root.add(floor);

  var ringFloor = new THREE.Mesh(
    new THREE.RingGeometry(2.1, 2.18, 64),
    new THREE.MeshBasicMaterial({
      color: 0xc45c26,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
    })
  );
  ringFloor.rotation.x = -Math.PI / 2;
  ringFloor.position.y = -1.03;
  root.add(ringFloor);

  /* ---------- LOCK / VAULT ---------- */
  var lockGroup = new THREE.Group();
  lockGroup.position.set(-2.35, 0.05, 0);
  root.add(lockGroup);
  track(lockGroup);

  var lockMat = new THREE.MeshStandardMaterial({
    color: 0x242220,
    metalness: 0.55,
    roughness: 0.32,
    emissive: 0x0b4f6c,
    emissiveIntensity: 0.08,
  });
  var lockBody = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.88, 0.58), lockMat);
  lockGroup.add(lockBody);

  var shackle = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.075, 12, 28, Math.PI),
    lockMat
  );
  shackle.rotation.z = Math.PI;
  shackle.position.set(0, 0.58, 0);
  lockGroup.add(shackle);
  track(shackle);

  var lockFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.92, 0.62),
    new THREE.MeshBasicMaterial({
      map: labelTex(["VAULT", "offline lock", "phrase stays here"], {
        bg: "#1a1a1a",
        fg: "#f7f5f0",
        bar: "#2d6a4f",
        w: 512,
        h: 320,
      }),
    })
  );
  lockFace.position.set(0, 0, 0.3);
  lockGroup.add(lockFace);

  var lockGlow = new THREE.Mesh(
    new THREE.RingGeometry(0.62, 0.82, 40),
    new THREE.MeshBasicMaterial({
      color: 0x2d6a4f,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
    })
  );
  lockGlow.position.set(0, 0, 0.34);
  lockGroup.add(lockGlow);

  lockGroup.userData.pick = "lock";

  /* ---------- DOCUMENTS ---------- */
  var docs = {};
  var docSpecs = [
    { id: "promise", title: "90-day letter", sub: "we won’t dump", x: -1.15 },
    { id: "vest", title: "Vesting note", sub: "team unlocks", x: 0.15 },
    { id: "build", title: "Build hashes", sub: "release proof", x: 1.45 },
  ];

  docSpecs.forEach(function (spec) {
    var g = new THREE.Group();
    var paper = new THREE.Mesh(
      new THREE.BoxGeometry(1.05, 1.32, 0.04),
      new THREE.MeshStandardMaterial({
        color: 0xf4efe6,
        roughness: 0.7,
        metalness: 0.02,
      })
    );
    g.add(paper);
    var face = new THREE.Mesh(
      new THREE.PlaneGeometry(0.98, 1.24),
      new THREE.MeshBasicMaterial({
        map: labelTex([spec.title, spec.sub, "click to seal"], {
          bg: "#f7f5f0",
          fg: "#1a1a1a",
          bar: "#0b4f6c",
        }),
      })
    );
    face.position.z = 0.025;
    g.add(face);
    g.position.set(spec.x, -2.4, 0.4);
    g.visible = false;
    g.userData.pick = "doc:" + spec.id;
    g.userData.docId = spec.id;
    root.add(g);
    track(g);
    docs[spec.id] = g;
  });

  /* ---------- CHAIN + FINGERPRINT ---------- */
  var chainGroup = new THREE.Group();
  chainGroup.position.set(0.05, 0.08, 0);
  root.add(chainGroup);
  track(chainGroup);

  var linkMat = new THREE.MeshStandardMaterial({
    color: 0x0b4f6c,
    metalness: 0.62,
    roughness: 0.28,
    emissive: 0x083d54,
    emissiveIntensity: 0.22,
  });
  var links = [];
  for (var i = 0; i < 6; i++) {
    var link = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.055, 10, 22), linkMat);
    link.rotation.y = Math.PI / 2;
    link.rotation.x = i % 2 ? 0.58 : -0.58;
    link.position.set((i - 2.5) * 0.34, Math.sin(i * 0.9) * 0.08, 0);
    chainGroup.add(link);
    links.push(link);
  }

  var fpRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.045, 14, 56),
    new THREE.MeshStandardMaterial({
      color: 0xc45c26,
      emissive: 0xc45c26,
      emissiveIntensity: 0.4,
      metalness: 0.45,
      roughness: 0.28,
    })
  );
  fpRing.rotation.x = Math.PI / 2;
  chainGroup.add(fpRing);
  track(fpRing);

  var fpCore = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.16, 0),
    new THREE.MeshStandardMaterial({
      color: 0xe8a838,
      emissive: 0xc45c26,
      emissiveIntensity: 0.35,
      metalness: 0.3,
      roughness: 0.4,
    })
  );
  chainGroup.add(fpCore);

  /* ---------- LEDGER (solana stamp) ---------- */
  var ledger = new THREE.Group();
  ledger.position.set(2.15, -0.15, 0);
  root.add(ledger);
  track(ledger);

  var slab = new THREE.Mesh(
    new THREE.BoxGeometry(1.35, 0.72, 0.18),
    new THREE.MeshStandardMaterial({
      color: 0x14181c,
      metalness: 0.5,
      roughness: 0.35,
      emissive: 0x0b4f6c,
      emissiveIntensity: 0.18,
    })
  );
  ledger.add(slab);
  var ledgerFace = new THREE.Mesh(
    new THREE.PlaneGeometry(1.22, 0.58),
    new THREE.MeshBasicMaterial({
      map: labelTex(["SOLANA", "empty slot", "fingerprint only"], {
        bg: "#12161a",
        fg: "#d7eef6",
        bar: "#0b4f6c",
      }),
    })
  );
  ledgerFace.position.set(0, 0, 0.1);
  ledger.add(ledgerFace);
  ledger.userData.pick = "ledger";

  var ledgerTexIdle = ledgerFace.material.map;
  var ledgerTexLive = labelTex(["SOLANA", "status: active", "fp stamped"], {
    bg: "#102018",
    fg: "#d8e8df",
    bar: "#2d6a4f",
  });

  /* ---------- STAMP TOKENS (what goes on chain) ---------- */
  var tokens = {};
  var tokenSpecs = [
    { id: "phrase", title: "Secret phrase", bad: true, x: -1.15 },
    { id: "note", title: "Full readable note", bad: true, x: 0.15 },
    { id: "fp", title: "Just the fingerprint", bad: false, x: 1.45 },
  ];
  tokenSpecs.forEach(function (spec) {
    var g = new THREE.Group();
    var mesh = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.32, 0),
      new THREE.MeshStandardMaterial({
        color: spec.bad ? 0x6b2a2a : 0x2d6a4f,
        emissive: spec.bad ? 0x4a1515 : 0x1b4332,
        emissiveIntensity: 0.3,
        metalness: 0.4,
        roughness: 0.35,
      })
    );
    g.add(mesh);
    var t = new THREE.Mesh(
      new THREE.PlaneGeometry(1.15, 0.32),
      new THREE.MeshBasicMaterial({
        map: labelTex([spec.title], {
          bg: spec.bad ? "#3a1818" : "#163026",
          fg: "#f7f5f0",
          w: 512,
          h: 160,
        }),
        transparent: true,
      })
    );
    t.position.y = -0.55;
    g.add(t);
    g.position.set(spec.x, -2.6, 0.6);
    g.visible = false;
    g.userData.pick = "stamp:" + spec.id;
    g.userData.good = !spec.bad;
    root.add(g);
    track(g);
    tokens[spec.id] = g;
  });

  /* ---------- WEBSITE (the liar) ---------- */
  var site = new THREE.Group();
  site.position.set(2.45, 0.55, -0.2);
  site.visible = false;
  root.add(site);
  track(site);

  var chrome = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 1.25, 0.08),
    new THREE.MeshStandardMaterial({
      color: 0xe8e4dc,
      roughness: 0.55,
      metalness: 0.08,
    })
  );
  site.add(chrome);
  var siteClean = labelTex(["team.site", "roadmap.pdf", "same as launch…"], {
    bg: "#ffffff",
    fg: "#1a1a1a",
    bar: "#0b4f6c",
  });
  var siteFake = labelTex(["team.site", "roadmap.pdf", "EDITED overnight"], {
    bg: "#fde8e8",
    fg: "#9b2226",
    bar: "#9b2226",
  });
  var siteFace = new THREE.Mesh(
    new THREE.PlaneGeometry(1.55, 1.05),
    new THREE.MeshBasicMaterial({ map: siteClean })
  );
  siteFace.position.set(0, 0, 0.05);
  site.add(siteFace);
  site.userData.pick = "attack:rewrite";

  /* ---------- SHIELD ---------- */
  var checkGroup = new THREE.Group();
  checkGroup.position.set(2.45, 0.15, 0);
  root.add(checkGroup);
  track(checkGroup);

  var shield = new THREE.Mesh(
    new THREE.CircleGeometry(0.7, 6),
    new THREE.MeshStandardMaterial({
      color: 0x2d6a4f,
      metalness: 0.22,
      roughness: 0.46,
      emissive: 0x1b4332,
      emissiveIntensity: 0.28,
    })
  );
  checkGroup.add(shield);

  var checkShape = new THREE.Shape();
  checkShape.moveTo(-0.26, 0.02);
  checkShape.lineTo(-0.05, -0.2);
  checkShape.lineTo(0.3, 0.26);
  var checkMesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(checkShape, { depth: 0.1, bevelEnabled: false }),
    new THREE.MeshStandardMaterial({ color: 0xf7f5f0, roughness: 0.4 })
  );
  checkMesh.position.z = 0.06;
  checkGroup.add(checkMesh);
  checkGroup.userData.pick = "verify:real";

  /* ---------- FAKE VAULT (tamper) ---------- */
  var fakeVault = new THREE.Group();
  var fakeBody = new THREE.Mesh(
    new THREE.BoxGeometry(0.95, 0.75, 0.48),
    new THREE.MeshStandardMaterial({
      color: 0x4a1c1c,
      metalness: 0.4,
      roughness: 0.4,
      emissive: 0x9b2226,
      emissiveIntensity: 0.25,
    })
  );
  fakeVault.add(fakeBody);
  var fakeFace = new THREE.Mesh(
    new THREE.PlaneGeometry(0.82, 0.52),
    new THREE.MeshBasicMaterial({
      map: labelTex(["TAMPERED", "one bit flipped", "hash breaks"], {
        bg: "#2a1010",
        fg: "#fde8e8",
        bar: "#9b2226",
      }),
    })
  );
  fakeFace.position.z = 0.26;
  fakeVault.add(fakeFace);
  fakeVault.position.set(1.15, -2.4, 0.4);
  fakeVault.visible = false;
  fakeVault.userData.pick = "verify:fake";
  root.add(fakeVault);
  track(fakeVault);

  /* ---------- TRUST ORB (wrong answer) ---------- */
  var trust = new THREE.Mesh(
    new THREE.SphereGeometry(0.28, 20, 16),
    new THREE.MeshStandardMaterial({
      color: 0x8a4b08,
      emissive: 0x8a4b08,
      emissiveIntensity: 0.2,
    })
  );
  trust.position.set(0.15, -2.4, 0.5);
  trust.visible = false;
  trust.userData.pick = "attack:trust";
  root.add(trust);
  track(trust);

  /* ---------- particles ---------- */
  var particleCount = 90;
  var positions = new Float32Array(particleCount * 3);
  var speeds = [];
  for (var p = 0; p < particleCount; p++) {
    positions[p * 3] = -3.6 + Math.random() * 7.2;
    positions[p * 3 + 1] = (Math.random() - 0.5) * 1.1;
    positions[p * 3 + 2] = (Math.random() - 0.5) * 0.7;
    speeds.push(0.006 + Math.random() * 0.014);
  }
  var particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  var particles = new THREE.Points(
    particleGeo,
    new THREE.PointsMaterial({
      color: 0xc45c26,
      size: 0.055,
      transparent: true,
      opacity: 0.7,
      sizeAttenuation: true,
    })
  );
  root.add(particles);

  /* burst particles for hash / verify */
  var burstCount = 36;
  var burstPos = new Float32Array(burstCount * 3);
  var burstVel = [];
  var bursting = 0;
  for (var b = 0; b < burstCount; b++) {
    burstPos[b * 3] = 0;
    burstPos[b * 3 + 1] = 0;
    burstPos[b * 3 + 2] = 0;
    burstVel.push(new THREE.Vector3());
  }
  var burstGeo = new THREE.BufferGeometry();
  burstGeo.setAttribute("position", new THREE.BufferAttribute(burstPos, 3));
  var burstPts = new THREE.Points(
    burstGeo,
    new THREE.PointsMaterial({
      color: 0xe8a838,
      size: 0.07,
      transparent: true,
      opacity: 0,
      sizeAttenuation: true,
    })
  );
  root.add(burstPts);

  function burstAt(x, y, z, color, power) {
    bursting = 1;
    burstPts.material.color.set(color || 0xe8a838);
    burstPts.material.opacity = 0.95;
    for (var i = 0; i < burstCount; i++) {
      burstPos[i * 3] = x;
      burstPos[i * 3 + 1] = y;
      burstPos[i * 3 + 2] = z;
      var v = burstVel[i];
      v.set(Math.random() - 0.5, Math.random() - 0.2, Math.random() - 0.5);
      v.multiplyScalar(power || 0.08);
    }
    burstGeo.attributes.position.needsUpdate = true;
  }

  /* ---------- camera presets ---------- */
  var CAMS = {
    idle: { pos: [0, 0.72, 6.6], look: [0, 0.12, 0] },
    pick: { pos: [0.1, 0.85, 5.6], look: [0.1, 0.25, 0] },
    lock: { pos: [-1.55, 0.72, 4.6], look: [-2.15, 0.1, 0] },
    hash: { pos: [-0.35, 0.95, 5.0], look: [-0.9, 0.15, 0] },
    stamp: { pos: [0.55, 0.7, 5.2], look: [0.7, 0.05, 0] },
    attack: { pos: [0.85, 0.85, 5.4], look: [0.55, 0.2, 0] },
    verify: { pos: [-0.15, 0.8, 5.5], look: [-0.2, 0.1, 0] },
    celebrate: { pos: [0, 1.35, 8.4], look: [0, 0.1, 0] },
  };

  function setCam(name) {
    var c = CAMS[name] || CAMS.idle;
    camGoal.set(c.pos[0], c.pos[1], c.pos[2]);
    lookGoal.set(c.look[0], c.look[1], c.look[2]);
  }

  function hideAllInteractives() {
    Object.keys(docs).forEach(function (k) {
      docs[k].visible = false;
      go(docs[k], docs[k].position.x, -2.4, 0.4);
    });
    Object.keys(tokens).forEach(function (k) {
      tokens[k].visible = false;
      go(tokens[k], tokens[k].position.x, -2.6, 0.6);
    });
    fakeVault.visible = false;
    go(fakeVault, 1.15, -2.4, 0.4);
    trust.visible = false;
    go(trust, 0.15, -2.4, 0.5);
    site.visible = false;
  }

  var selectedDoc = null;
  var sealed = false;
  var stamped = false;
  var attacked = false;
  var lastGood = null;

  function layoutIdle() {
    hideAllInteractives();
    go(lockGroup, -2.45, 0.12, 0);
    scl(lockGroup, 1.12);
    go(chainGroup, 0.05, 0.18, 0);
    ledger.visible = false;
    go(ledger, 2.4, -1.6, -0.4);
    scl(ledger, 0.8);
    go(checkGroup, 2.5, 0.18, 0);
    checkGroup.visible = true;
    scl(checkGroup, 1.12);
    go(shackle, 0, 0.58, 0);
    lockGroup.userData.pick = "start";
    setCam("idle");
    setHot(["start"]);
  }

  function layoutPick() {
    hideAllInteractives();
    go(lockGroup, -2.55, -0.35, -0.4);
    scl(lockGroup, 0.72);
    go(chainGroup, 0.2, -0.45, -0.6);
    ledger.visible = false;
    go(ledger, 2.4, -0.55, -0.5);
    checkGroup.visible = false;
    docSpecs.forEach(function (spec, idx) {
      var g = docs[spec.id];
      g.visible = true;
      go(g, spec.x - 0.15, 0.35, 0.35);
      rot(g, -0.12, 0.18 - idx * 0.12, 0.04);
      scl(g, 1);
    });
    setCam("pick");
    setHot(["doc:promise", "doc:vest", "doc:build"]);
  }

  function layoutLock() {
    Object.keys(docs).forEach(function (k) {
      if (selectedDoc && k === selectedDoc) {
        docs[k].visible = true;
        go(docs[k], -2.35, 0.95, 0.35);
        rot(docs[k], -0.2, 0.05, 0);
        scl(docs[k], 0.85);
      } else {
        docs[k].visible = false;
      }
    });
    Object.keys(tokens).forEach(function (k) {
      tokens[k].visible = false;
    });
    go(lockGroup, -2.25, 0.0, 0.15);
    scl(lockGroup, 1.12);
    go(chainGroup, 0.45, -0.35, -0.5);
    ledger.visible = false;
    go(ledger, 2.35, -0.45, -0.4);
    checkGroup.visible = false;
    site.visible = false;
    setCam("lock");
    setHot(["lock"]);
  }

  function layoutHash() {
    if (selectedDoc && docs[selectedDoc]) {
      docs[selectedDoc].visible = true;
      go(docs[selectedDoc], -2.35, 0.12, 0.02);
      scl(docs[selectedDoc], 0.15);
    }
    go(lockGroup, -1.55, 0.05, 0);
    scl(lockGroup, 1.05);
    go(chainGroup, 0.35, 0.12, 0.1);
    go(fpRing, 0, 0, 0);
    ledger.visible = true;
    go(ledger, 2.2, -0.35, -0.25);
    checkGroup.visible = false;
    setCam("hash");
    setHot(["lock"]);
  }

  function layoutStamp() {
    go(lockGroup, -2.5, -0.25, -0.35);
    scl(lockGroup, 0.75);
    go(chainGroup, -0.15, 0.2, 0);
    ledger.visible = true;
    go(ledger, 1.85, 0.05, 0.15);
    scl(ledger, 1.15);
    checkGroup.visible = false;
    tokenSpecs.forEach(function (spec) {
      var g = tokens[spec.id];
      g.visible = true;
      go(g, spec.x - 0.2, 1.15, 0.45);
      scl(g, 1);
    });
    setCam("stamp");
    setHot(["stamp:phrase", "stamp:note", "stamp:fp"]);
  }

  function layoutAttack() {
    Object.keys(tokens).forEach(function (k) {
      tokens[k].visible = false;
    });
    go(lockGroup, -2.05, 0.05, 0.1);
    scl(lockGroup, 1);
    go(chainGroup, -0.15, 0.05, -0.15);
    ledger.visible = true;
    go(ledger, 0.55, -0.55, -0.1);
    site.visible = true;
    go(site, 2.15, 0.45, 0.15);
    rot(site, -0.08, -0.25, 0.04);
    checkGroup.visible = false;
    trust.visible = true;
    go(trust, 0.15, -0.75, 0.4);
    lockGroup.userData.pick = "attack:match";
    setCam("attack");
    setHot(["attack:match", "attack:rewrite", "attack:trust"]);
  }

  function layoutVerify() {
    site.visible = true;
    go(site, 2.35, 0.85, -0.35);
    scl(site, 0.72);
    go(lockGroup, -1.45, 0.05, 0.2);
    scl(lockGroup, 1.08);
    lockGroup.userData.pick = "verify:real";
    fakeVault.visible = true;
    go(fakeVault, 0.85, 0.05, 0.25);
    go(chainGroup, -0.15, -0.55, -0.2);
    ledger.visible = true;
    go(ledger, 2.05, -0.7, -0.15);
    checkGroup.visible = false;
    trust.visible = false;
    setCam("verify");
    setHot(["verify:real", "verify:fake"]);
  }

  function layoutCelebrate() {
    hideAllInteractives();
    go(lockGroup, -2.35, 0.1, 0);
    scl(lockGroup, 1);
    go(chainGroup, 0.05, 0.12, 0);
    ledger.visible = true;
    go(ledger, 1.85, -0.05, 0);
    checkGroup.visible = true;
    go(checkGroup, 2.55, 0.2, 0);
    site.visible = false;
    setCam("celebrate");
    setHot([]);
    burstAt(0, 0.4, 0.2, 0x2d6a4f, 0.11);
  }

  var hotSet = {};
  function setHot(names) {
    hotSet = {};
    (names || []).forEach(function (n) {
      hotSet[n] = true;
    });
    canvas.classList.toggle("is-hot", names && names.length > 0);
  }

  function applyPhase(name) {
    api.phase = name;
    lockGroup.userData.pick = "lock";
    if (name === "pick") layoutPick();
    else if (name === "lock") layoutLock();
    else if (name === "hash") layoutHash();
    else if (name === "stamp") layoutStamp();
    else if (name === "attack") layoutAttack();
    else if (name === "verify") layoutVerify();
    else if (name === "celebrate") layoutCelebrate();
    else layoutIdle();
  }

  /* ---------- picking ---------- */
  var raycaster = new THREE.Raycaster();
  var pickables = [];

  function collectPickables() {
    pickables = [];
    root.traverse(function (o) {
      if (o.userData && o.userData.pick && o.visible) pickables.push(o);
    });
  }

  function objectPickName(obj) {
    var o = obj;
    while (o) {
      if (o.userData && o.userData.pick) return o.userData.pick;
      o = o.parent;
    }
    return "";
  }

  function hitAt(clientX, clientY) {
    var rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    collectPickables();
    var hits = raycaster.intersectObjects(pickables, true);
    if (!hits.length) return "";
    return objectPickName(hits[0].object);
  }

  function emitPick(name) {
    if (!name) return;
    window.dispatchEvent(new CustomEvent("qal-pick", { detail: name }));
  }

  canvas.addEventListener("pointermove", function (e) {
    var rect = canvas.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    hoverName = hitAt(e.clientX, e.clientY);
    if (hoverName && hotSet[hoverName]) canvas.classList.add("is-hot");
    else if (!Object.keys(hotSet).length) canvas.classList.remove("is-hot");
  });

  canvas.addEventListener("pointerleave", function () {
    mouse.x = 0;
    mouse.y = 0;
    hoverName = "";
  });

  canvas.addEventListener("pointerdown", function (e) {
    var name = hitAt(e.clientX, e.clientY);
    if (name && (hotSet[name] || api.phase === "idle")) {
      if (api.phase === "idle" && name) {
        emitPick("start");
        return;
      }
      emitPick(name);
    }
  });

  /* ---------- public API ---------- */
  api.setPhase = function (name) {
    applyPhase(name);
  };

  api.selectDoc = function (id) {
    selectedDoc = id;
    if (docs[id]) {
      burstAt(docs[id].position.x, docs[id].position.y, docs[id].position.z, 0x0b4f6c, 0.06);
    }
    layoutLock();
  };

  api.seal = function () {
    sealed = true;
    go(shackle, 0, 0.42, 0);
    if (selectedDoc && docs[selectedDoc]) {
      go(docs[selectedDoc], lockGroup.position.x, lockGroup.position.y + 0.05, 0.02);
      scl(docs[selectedDoc], 0.12);
    }
    burstAt(lockGroup.position.x, lockGroup.position.y + 0.2, 0.3, 0x2d6a4f, 0.07);
    lockMat.emissiveIntensity = 0.35;
  };

  api.stamp = function () {
    stamped = true;
    lastGood = true;
    Object.keys(tokens).forEach(function (k) {
      if (k === "fp") {
        go(tokens[k], ledger.position.x, ledger.position.y + 0.55, 0.4);
        scl(tokens[k], 0.55);
      } else {
        scl(tokens[k], 0.01);
      }
    });
    ledgerFace.material.map = ledgerTexLive;
    ledgerFace.material.needsUpdate = true;
    burstAt(ledger.position.x, ledger.position.y + 0.2, 0.2, 0xc45c26, 0.08);
  };

  api.attack = function () {
    attacked = true;
    siteFace.material.map = siteFake;
    siteFace.material.needsUpdate = true;
    burstAt(site.position.x, site.position.y, 0.3, 0x9b2226, 0.07);
  };

  api.verify = function (kind) {
    if (kind === "fake") {
      lastGood = false;
      burstAt(fakeVault.position.x, fakeVault.position.y, 0.3, 0x9b2226, 0.09);
      scl(fakeVault, 1.12);
    } else {
      lastGood = true;
      burstAt(lockGroup.position.x, lockGroup.position.y + 0.2, 0.3, 0x2d6a4f, 0.1);
      checkGroup.visible = true;
      go(checkGroup, 2.35, 0.15, 0.2);
    }
  };

  api.celebrate = function () {
    applyPhase("celebrate");
  };

  api.reset = function () {
    selectedDoc = null;
    sealed = false;
    stamped = false;
    attacked = false;
    lastGood = null;
    lockGroup.userData.pick = "lock";
    go(shackle, 0, 0.58, 0);
    lockMat.emissiveIntensity = 0.08;
    ledgerFace.material.map = ledgerTexIdle;
    ledgerFace.material.needsUpdate = true;
    siteFace.material.map = siteClean;
    siteFace.material.needsUpdate = true;
    scl(fakeVault, 1);
    Object.keys(tokens).forEach(function (k) {
      scl(tokens[k], 1);
    });
    applyPhase("idle");
  };

  api.replay = function (beat) {
    if (beat === 0) {
      applyPhase("lock");
      setTimeout(function () {
        api.seal();
      }, 400);
    } else if (beat === 1) {
      applyPhase("hash");
      setTimeout(function () {
        applyPhase("stamp");
        setTimeout(function () {
          api.stamp();
        }, 500);
      }, 700);
    } else {
      applyPhase("attack");
      setTimeout(function () {
        api.attack();
        setTimeout(function () {
          applyPhase("verify");
          setTimeout(function () {
            api.verify("real");
          }, 600);
        }, 700);
      }, 500);
    }
  };

  api.onPick = function (cb) {
    pickCb = cb;
  };

  api.setHot = setHot;

  api.setCaption = function (text) {
    var el = document.querySelector("[data-caption]");
    if (el && text != null) el.textContent = text;
  };

  /* ---------- resize / loop ---------- */
  function resize() {
    var host = canvas.parentElement;
    var rect = host.getBoundingClientRect();
    w = Math.max(1, rect.width);
    h = Math.max(1, rect.height);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    var narrow = w / h < 0.9;
    CAMS.idle = narrow
      ? { pos: [0, 1.05, 9.4], look: [0, 0.2, 0] }
      : { pos: [0, 0.72, 6.6], look: [0, 0.12, 0] };
    CAMS.pick = narrow
      ? { pos: [0.05, 1.15, 7.8], look: [0.05, 0.3, 0] }
      : { pos: [0.1, 0.85, 5.6], look: [0.1, 0.25, 0] };
    if (api.phase) setCam(api.phase);
  }

  window.addEventListener("resize", resize);
  resize();

  var t0 = performance.now();

  function tick(now) {
    requestAnimationFrame(tick);
    var t = (now - t0) * 0.001;

    camera.position.lerp(camGoal, 0.045);
    lookNow.lerp(lookGoal, 0.055);
    camera.lookAt(lookNow);

    root.rotation.y = mouse.x * 0.16 + Math.sin(t * 0.28) * 0.05;
    root.rotation.x = -mouse.y * 0.08 + Math.sin(t * 0.22) * 0.025;

    lockGroup.position.y +=
      (lockGroup.userData.targetPos.y + Math.sin(t * 1.25) * 0.045 - lockGroup.position.y) *
      0.08;
    lockGlow.rotation.z = t * 0.55;
    lockGlow.material.opacity = 0.18 + Math.sin(t * 2.1) * 0.1;

    chainGroup.rotation.y = Math.sin(t * 0.8) * 0.12;
    fpRing.rotation.z = t * 0.9;
    fpCore.rotation.y = t * 1.4;
    fpCore.rotation.x = t * 0.7;
    var pulse = 1 + Math.sin(t * 2.3) * 0.045;
    fpRing.scale.setScalar(pulse);

    checkGroup.position.y +=
      (checkGroup.userData.targetPos.y + Math.sin(t * 1.05 + 1) * 0.04 - checkGroup.position.y) *
      0.08;
    shield.material.emissiveIntensity = 0.22 + Math.sin(t * 2.4) * 0.14;

    if (site.visible && attacked) {
      site.position.x += Math.sin(t * 28) * 0.004;
      site.rotation.z = Math.sin(t * 22) * 0.02;
    }

    root.traverse(function (o) {
      if (!o.userData.targetPos || o === lockGroup || o === checkGroup) return;
      o.position.lerp(o.userData.targetPos, 0.08);
      if (o.userData.targetRot) {
        o.rotation.x += (o.userData.targetRot.x - o.rotation.x) * 0.08;
        o.rotation.y += (o.userData.targetRot.y - o.rotation.y) * 0.08;
        o.rotation.z += (o.userData.targetRot.z - o.rotation.z) * 0.08;
      }
      if (typeof o.userData.targetScale === "number") {
        var s = o.scale.x + (o.userData.targetScale - o.scale.x) * 0.1;
        o.scale.setScalar(s);
      }
    });
    lockGroup.position.x += (lockGroup.userData.targetPos.x - lockGroup.position.x) * 0.08;
    lockGroup.position.z += (lockGroup.userData.targetPos.z - lockGroup.position.z) * 0.08;
    checkGroup.position.x += (checkGroup.userData.targetPos.x - checkGroup.position.x) * 0.08;
    checkGroup.position.z += (checkGroup.userData.targetPos.z - checkGroup.position.z) * 0.08;

    Object.keys(docs).forEach(function (k, idx) {
      var g = docs[k];
      if (!g.visible) return;
      var hot = hotSet[g.userData.pick];
      if (hot) {
        g.position.y += Math.sin(t * 1.6 + idx) * 0.002;
        g.rotation.y += Math.sin(t * 1.1 + idx) * 0.002;
      }
    });

    var arr = particleGeo.attributes.position.array;
    for (var i = 0; i < particleCount; i++) {
      arr[i * 3] += speeds[i];
      if (arr[i * 3] > 3.8) arr[i * 3] = -3.8;
      arr[i * 3 + 1] = Math.sin(t * 1.8 + i * 0.4) * 0.28;
    }
    particleGeo.attributes.position.needsUpdate = true;

    if (bursting > 0) {
      bursting -= 0.012;
      burstPts.material.opacity = Math.max(0, bursting);
      var ba = burstGeo.attributes.position.array;
      for (var j = 0; j < burstCount; j++) {
        ba[j * 3] += burstVel[j].x;
        ba[j * 3 + 1] += burstVel[j].y;
        ba[j * 3 + 2] += burstVel[j].z;
        burstVel[j].y -= 0.0015;
      }
      burstGeo.attributes.position.needsUpdate = true;
    }

    if (hoverName && hotSet[hoverName]) {
      root.traverse(function (o) {
        if (o.userData.pick === hoverName) {
          o.scale.setScalar((o.userData.targetScale || 1) * 1.06);
        }
      });
    }

    renderer.render(scene, camera);
  }

  layoutIdle();
  api.ready = true;
  window.dispatchEvent(new CustomEvent("qal-scene-ready"));
  requestAnimationFrame(tick);
})();
