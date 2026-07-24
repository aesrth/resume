/*
 * Interactive antibody–antigen toy for the hero.
 * Vanilla canvas + Verlet soft-body physics. Prod it, grab and fling it;
 * the antigen drifts in and binds to the paratope tips. Assembles from
 * scattered particles ("diffusion") on load and on the regenerate control.
 * Unified Pointer Events (desktop + touch). No dependencies.
 */
(function () {
  "use strict";

  var canvas = document.getElementById("hero-canvas");
  if (!canvas || !canvas.getContext) return;
  var hero = canvas.parentElement;
  var ctx = canvas.getContext("2d");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---- tunables ----
  var FRICTION = 0.9;       // verlet velocity retention
  var REST_K = 0.022;       // antibody nodes ease back to Y shape
  var ANTIGEN_K = 0.006;    // antigen eases toward its home
  var ITER = 4;             // constraint solve iterations
  var POINTER_R = 92;       // prod radius
  var POINTER_F = 2.4;      // prod strength
  var TAP_F = 6.5;          // extra impulse on press
  var GRAB_R = 34;          // how close a press must be to grab a node
  var INTRO_MS = 1300;      // diffusion assemble duration

  var DPR = 1, W = 0, H = 0, L = 60;
  var colors = {};
  var nodes = [], sticks = [], antigen = null, tips = [];
  var bond = null;          // {tip, broken} active antibody–antigen bond
  var pointer = { x: 0, y: 0, lx: 0, ly: 0, active: false, inside: false };
  var grabbed = null;
  var intro = { on: true, t0: 0 };
  var running = false, visible = true;

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    colors.accent = (cs.getPropertyValue("--accent") || "#b5482f").trim();
    colors.muted = (cs.getPropertyValue("--text-muted") || "#5c5c5c").trim();
    colors.faint = (cs.getPropertyValue("--text-faint") || "#8a8a8a").trim();
  }

  // ---- build the antibody as nodes + distance constraints ----
  function node(x, y) { return { x: x, y: y, ox: x, oy: y, rx: x, ry: y, pin: false }; }
  function link(a, b, k) {
    sticks.push({ a: a, b: b, len: Math.hypot(a.x - b.x, a.y - b.y), k: k || 1 });
  }

  function layout() {
    var narrow = W < 620;
    L = Math.max(34, Math.min(narrow ? 56 : 84, Math.min(W, H) * (narrow ? 0.15 : 0.19)));
    var hx = narrow ? W * 0.5 : W * 0.7;
    var hy = narrow ? H * 0.72 : H * 0.44;

    // rest offsets (Y points up: two Fab arms up, Fc stem down)
    var def = [
      [0, 0],            // 0 hinge
      [-0.62, -0.52],    // 1 left arm mid
      [-1.02, -1.12],    // 2 left paratope tip
      [0.62, -0.52],     // 3 right arm mid
      [1.02, -1.12],     // 4 right paratope tip
      [0, 0.72],         // 5 Fc upper
      [0, 1.52]          // 6 Fc lower
    ];
    nodes = def.map(function (d) { return node(hx + d[0] * L, hy + d[1] * L); });
    // remember rest (home) positions
    nodes.forEach(function (n) { n.rx = n.x; n.ry = n.y; });

    sticks = [];
    var H0 = nodes[0], LA = nodes[1], LT = nodes[2], RA = nodes[3],
        RT = nodes[4], F1 = nodes[5], F2 = nodes[6];
    link(H0, LA); link(LA, LT); link(H0, RA); link(RA, RT);
    link(H0, F1); link(F1, F2);
    link(LA, RA, 0.8); link(LA, F1, 0.6); link(RA, F1, 0.6); // braces hold the Y
    tips = [LT, RT];

    var ar = L * 0.52;
    antigen = { x: hx, y: hy - 1.5 * L, ox: hx, oy: hy - 1.5 * L,
                hx: hx, hy: hy - 1.5 * L, r: ar, pin: false };
    bond = null;
  }

  function scatter() {
    var cx = antigen ? (nodes[0].rx) : W / 2, cy = nodes[0] ? nodes[0].ry : H / 2;
    nodes.forEach(function (n) {
      n.x = cx + (Math.random() - 0.5) * W * 0.5;
      n.y = cy + (Math.random() - 0.5) * H * 0.7;
      n.ox = n.x; n.oy = n.y;
    });
    antigen.x = cx + (Math.random() - 0.5) * W * 0.5;
    antigen.y = cy + (Math.random() - 0.5) * H * 0.6;
    antigen.ox = antigen.x; antigen.oy = antigen.y;
    bond = null;
    intro.on = true; intro.t0 = performance.now();
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  // ---- physics ----
  function integrate(n) {
    if (n.pin) return;
    var vx = (n.x - n.ox) * FRICTION, vy = (n.y - n.oy) * FRICTION;
    n.ox = n.x; n.oy = n.y;
    n.x += vx; n.y += vy;
  }

  function pointerForce(n) {
    if (!pointer.inside || n === grabbed) return;
    var dx = n.x - pointer.x, dy = n.y - pointer.y;
    var d = Math.hypot(dx, dy) || 0.001;
    if (d < POINTER_R) {
      var f = (1 - d / POINTER_R) * POINTER_F;
      n.x += (dx / d) * f; n.y += (dy / d) * f;
    }
  }

  function solve(s) {
    var dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
    var d = Math.hypot(dx, dy) || 0.001;
    var diff = ((s.len - d) / d) * 0.5 * s.k;
    var ox = dx * diff, oy = dy * diff;
    var am = s.a.pin ? 0 : 1, bm = s.b.pin ? 0 : 1, tm = am + bm || 1;
    if (!s.a.pin) { s.a.x -= ox * (am / tm) * 2; s.a.y -= oy * (am / tm) * 2; }
    if (!s.b.pin) { s.b.x += ox * (bm / tm) * 2; s.b.y += oy * (bm / tm) * 2; }
  }

  function clamp(n, r) {
    r = r || 6;
    if (n.x < r) { n.x = r; } if (n.x > W - r) { n.x = W - r; }
    if (n.y < r) { n.y = r; } if (n.y > H - r) { n.y = H - r; }
  }

  function step() {
    // ease antibody back toward the Y shape (self-healing)
    nodes.forEach(function (n) {
      if (n.pin) return;
      n.x += (n.rx - n.x) * REST_K;
      n.y += (n.ry - n.y) * REST_K;
      // gentle liveliness
      n.x += (Math.random() - 0.5) * 0.25;
      n.y += (Math.random() - 0.5) * 0.25;
      pointerForce(n);
      integrate(n);
    });

    // antigen drifts home + reacts to pointer
    if (!antigen.pin) {
      antigen.x += (antigen.hx - antigen.x) * ANTIGEN_K;
      antigen.y += (antigen.hy - antigen.y) * ANTIGEN_K;
      pointerForce(antigen);
      integrate(antigen);
    }

    // binding: nearest tip grabs the antigen when close, releases if yanked
    if (!bond) {
      for (var i = 0; i < tips.length; i++) {
        var d = Math.hypot(tips[i].x - antigen.x, tips[i].y - antigen.y);
        if (d < antigen.r + 12) { bond = { tip: tips[i] }; break; }
      }
    }
    for (var k = 0; k < ITER; k++) {
      sticks.forEach(solve);
      if (bond) {
        var s = { a: bond.tip, b: antigen, len: antigen.r * 0.7, k: 0.9 };
        solve(s);
      }
    }
    if (bond) {
      var bd = Math.hypot(bond.tip.x - antigen.x, bond.tip.y - antigen.y);
      if (bd > antigen.r + 64) bond = null; // broke the bond
    }
    nodes.forEach(function (n) { clamp(n); });
    clamp(antigen, antigen.r);
  }

  // ---- render ----
  function withAlpha(a, fn) { ctx.save(); ctx.globalAlpha = a; fn(); ctx.restore(); }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // antigen
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = colors.muted;
    ctx.beginPath(); ctx.arc(antigen.x, antigen.y, antigen.r, 0, 7); ctx.fill();
    ctx.restore();
    withAlpha(0.55, function () {
      ctx.strokeStyle = colors.muted; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(antigen.x, antigen.y, antigen.r, 0, 7); ctx.stroke();
    });

    // bond glow
    if (bond) {
      withAlpha(0.5, function () {
        var g = ctx.createRadialGradient(antigen.x, antigen.y, 0, antigen.x, antigen.y, antigen.r * 1.4);
        g.addColorStop(0, colors.accent); g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(antigen.x, antigen.y, antigen.r * 1.4, 0, 7); ctx.fill();
      });
    }

    // antibody bonds/sticks
    withAlpha(0.85, function () {
      ctx.strokeStyle = colors.accent;
      ctx.lineWidth = Math.max(2, L * 0.05);
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.beginPath();
      sticks.forEach(function (s) {
        if (s.k < 0.85) return; // skip internal braces for a cleaner look
        ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y);
      });
      ctx.stroke();
    });

    // nodes + paratope tips
    ctx.fillStyle = colors.accent;
    nodes.forEach(function (n) {
      var big = tips.indexOf(n) !== -1;
      ctx.beginPath(); ctx.arc(n.x, n.y, big ? L * 0.12 : L * 0.07, 0, 7); ctx.fill();
    });
  }

  // ---- main loop ----
  function frame(now) {
    if (!running) return;
    if (intro.on) {
      var t = Math.min(1, (now - intro.t0) / INTRO_MS), e = easeOut(t);
      nodes.forEach(function (n) {
        n.x = n.sx0 + (n.rx - n.sx0) * e; n.y = n.sy0 + (n.ry - n.sy0) * e;
        n.ox = n.x; n.oy = n.y;
      });
      antigen.x = antigen.sx0 + (antigen.hx - antigen.sx0) * e;
      antigen.y = antigen.sy0 + (antigen.hy - antigen.sy0) * e;
      antigen.ox = antigen.x; antigen.oy = antigen.y;
      ctx.save(); ctx.globalAlpha = e; draw(); ctx.restore();
      if (t >= 1) intro.on = false;
    } else {
      step(); draw();
    }
    requestAnimationFrame(frame);
  }

  function start() { if (!running && visible && !document.hidden) { running = true; requestAnimationFrame(frame); } }
  function stop() { running = false; }

  // capture scatter start positions for the intro
  function seedIntro() {
    nodes.forEach(function (n) { n.sx0 = n.x; n.sy0 = n.y; });
    antigen.sx0 = antigen.x; antigen.sy0 = antigen.y;
  }

  function regenerate() {
    if (reduce) { layout(); staticDraw(); return; }
    scatter(); seedIntro(); start();
  }

  function staticDraw() { readColors(); resize(true); draw(); }

  // ---- sizing ----
  function resize(skipLayout) {
    var rect = hero.getBoundingClientRect();
    W = rect.width; H = rect.height;
    DPR = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + "px"; canvas.style.height = H + "px";
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (!skipLayout) layout();
  }

  // ---- pointer ----
  function pos(e) {
    var r = canvas.getBoundingClientRect();
    pointer.lx = pointer.x; pointer.ly = pointer.y;
    pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
    pointer.inside = pointer.x >= 0 && pointer.y >= 0 && pointer.x <= W && pointer.y <= H;
  }
  function down(e) {
    pos(e); pointer.active = true; pointer.inside = true;
    canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
    // grab nearest node/antigen
    var best = null, bd = GRAB_R;
    nodes.forEach(function (n) {
      var d = Math.hypot(n.x - pointer.x, n.y - pointer.y);
      if (d < bd) { bd = d; best = n; }
    });
    var da = Math.hypot(antigen.x - pointer.x, antigen.y - pointer.y);
    if (da < antigen.r + 6 && da < bd) best = antigen;
    if (best) { grabbed = best; best.pin = true; }
    else {
      // tap = prod impulse
      var all = nodes.concat([antigen]);
      all.forEach(function (n) {
        var dx = n.x - pointer.x, dy = n.y - pointer.y, d = Math.hypot(dx, dy) || 1;
        if (d < POINTER_R) { var f = (1 - d / POINTER_R) * TAP_F; n.x += dx / d * f; n.y += dy / d * f; }
      });
    }
    hideHint();
  }
  function move(e) {
    pos(e);
    if (grabbed) { grabbed.x = pointer.x; grabbed.y = pointer.y; }
  }
  function up() {
    if (grabbed) {
      grabbed.pin = false;
      grabbed.ox = pointer.lx; grabbed.oy = pointer.ly; // fling velocity
      grabbed = null;
    }
    pointer.active = false;
  }
  function leave() { if (!pointer.active) pointer.inside = false; }

  // ---- hint ----
  var hint = document.getElementById("hero-hint"), hintTimer;
  function hideHint() { if (hint) { hint.classList.add("is-hidden"); clearTimeout(hintTimer); } }

  // ---- init ----
  function init() {
    readColors();
    resize();
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    canvas.addEventListener("pointerleave", leave);

    var regen = document.getElementById("hero-regen");
    if (regen) regen.addEventListener("click", regenerate);

    var rsz;
    window.addEventListener("resize", function () {
      clearTimeout(rsz);
      rsz = setTimeout(function () { var wasIntro = intro.on; resize(); if (reduce) { draw(); } else if (!wasIntro) { start(); } }, 150);
    });

    // theme changes → refresh colors
    new MutationObserver(readColors).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", readColors);

    if (reduce) { staticDraw(); return; }

    // pause when off-screen or tab hidden
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (en) {
        visible = en[0].isIntersecting;
        if (visible) start(); else stop();
      }, { threshold: 0.01 }).observe(hero);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop(); else start();
    });

    if (hint) hintTimer = setTimeout(hideHint, 7000);

    scatter(); seedIntro(); start();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
