/* shieldchipiii — brand animation engine: grid primitives, the shared logo
 * geometry, a scene registry and the overlay player. The splash scenes
 * themselves live in js/anim-*.js and register here; page loads rotate
 * through them. ASCII frames stepped like a terminal, not tweened.
 * Browser-only garnish the CLI never loads: skippable (any click or key),
 * aria-hidden, and gone entirely under reduced motion. */
(function () {
  "use strict";

  var W = 60, H = 19; // splash stage, in character cells — shared by every scene
  var ROTATE_KEY = "shieldchipiii.splash"; // per-load rotation counter

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // ---------- grid primitives ----------

  function blankGrid() {
    var g = [], r, c, row;
    for (r = 0; r < H; r++) {
      row = [];
      for (c = 0; c < W; c++) row.push({ ch: " ", cls: "" });
      g.push(row);
    }
    return g;
  }

  // The repair micro-effect runs on its own small stage.
  function smallGrid(w, h) {
    var g = [], r, c, row;
    for (r = 0; r < h; r++) {
      row = [];
      for (c = 0; c < w; c++) row.push({ ch: " ", cls: "" });
      g.push(row);
    }
    return g;
  }

  function set(g, r, c, ch, cls) {
    if (r < 0 || r >= g.length || c < 0 || c >= g[0].length) return;
    g[r][c] = { ch: ch, cls: cls || "" };
  }

  function drawCells(g, cells) {
    for (var i = 0; i < cells.length; i++) set(g, cells[i].row, cells[i].col, cells[i].ch, cells[i].cls);
  }

  function writeText(g, row, text, cls) {
    var left = Math.floor((W - text.length) / 2);
    for (var k = 0; k < text.length; k++) set(g, row, left + k, text[k], cls);
  }

  function escChar(ch) {
    if (ch === "&") return "&amp;";
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    return ch;
  }

  // Serialize a grid to HTML, run-length merging equal classes into one span.
  function render(g) {
    var html = "", r, c, rowHtml, curCls, buf, cell, cls;
    for (r = 0; r < g.length; r++) {
      rowHtml = ""; curCls = null; buf = "";
      for (c = 0; c < g[0].length; c++) {
        cell = g[r][c];
        cls = cell.cls || "";
        if (cls !== curCls) {
          if (buf) rowHtml += curCls ? '<span class="' + curCls + '">' + buf + "</span>" : buf;
          buf = "";
          curCls = cls;
        }
        buf += escChar(cell.ch);
      }
      if (buf) rowHtml += curCls ? '<span class="' + curCls + '">' + buf + "</span>" : buf;
      html += rowHtml + "\n";
    }
    return html;
  }

  // ---------- shared logo geometry ----------

  // The ribbon: 5 segments sheared like italic text — yellow taper, yellow and
  // red parallelograms, red tail running out to a point at the top right.
  function buildRibbon() {
    var ROWS = 5, SHEAR = 2, TOP = 2;
    var raw = [], r, c, w, start, i;
    function offset(row) { return (ROWS - 1 - row) * SHEAR; }

    // segment 1: yellow triangle, point at bottom-left
    var w1 = [6, 5, 4, 2, 1], E1 = 6;
    for (r = 0; r < ROWS; r++) {
      w = w1[r]; start = E1 - w + 1;
      for (c = start; c <= E1; c++) raw.push({ r: r, c: c + offset(r), cls: "y" });
    }

    // segments 2-4: sheared rectangles (yellow, red, red). Divider gaps are 2
    // cols wide: the shear steps 2 cols per row, so a 1-col gap decays into
    // disconnected dots — 2 cols keep the slits reading as one diagonal cut.
    var rects = [[9, 14, "y"], [17, 22, "r"], [25, 30, "r"]];
    for (i = 0; i < rects.length; i++)
      for (r = 0; r < ROWS; r++)
        for (c = rects[i][0]; c <= rects[i][1]; c++) raw.push({ r: r, c: c + offset(r), cls: rects[i][2] });

    // segment 5: red tail, point at top-right
    var S5 = 33, w5 = [1, 2, 3, 5, 7];
    for (r = 0; r < ROWS; r++)
      for (c = S5; c < S5 + w5[r]; c++) raw.push({ r: r, c: c + offset(r), cls: "r" });

    var minC = Infinity, maxC = -Infinity;
    raw.forEach(function (p) { if (p.c < minC) minC = p.c; if (p.c > maxC) maxC = p.c; });
    var left = Math.floor((W - (maxC - minC + 1)) / 2) - minC;
    return raw.map(function (p) { return { row: TOP + p.r, col: p.c + left, cls: p.cls, ch: "█" }; });
  }

  var FONT = {
    A: [".###.", "#...#", "#####", "#...#", "#...#"],
    C: [".####", "#....", "#....", "#....", ".####"],
    G: [".####", "#....", "#.###", "#...#", ".####"],
    L: ["#....", "#....", "#....", "#....", "#####"],
    R: ["####.", "#...#", "####.", "#.#..", "#..#."],
    S: [".####", "#....", ".###.", "....#", "####."],
  };
  var RIBBON_TOP = 2, WORD_TOP = 8;

  function buildWordmark() {
    var word = "CARGLASS", cells = [], colBase = 0, i, gr, gc, glyph;
    for (i = 0; i < word.length; i++) {
      glyph = FONT[word[i]];
      for (gr = 0; gr < 5; gr++)
        for (gc = 0; gc < 5; gc++)
          if (glyph[gr][gc] === "#") cells.push({ r: gr, c: colBase + gc });
      colBase += 6; // 5-wide glyph + 1 gap
    }
    var left = Math.floor((W - (colBase - 1)) / 2);
    var out = cells.map(function (p) { return { row: WORD_TOP + p.r, col: p.c + left, cls: "r", ch: "█" }; });
    // tiny ® riding the wordmark's top-right corner
    var rightEdge = -Infinity;
    out.forEach(function (p) { if (p.col > rightEdge) rightEdge = p.col; });
    out.push({ row: WORD_TOP, col: rightEdge + 2, ch: "®", cls: "dim" });
    return out;
  }

  // ---------- unified landing: slogan + unofficial note ----------

  var SLOGAN = "IHR AUTOGLAS EXPERTE NR.1";
  var NOTE = "DEMO · KEINE OFFIZIELLE CARGLASS-APP";
  var SLOGAN_ROW = 14, NOTE_ROW = 16;

  // Appends the shared ending to a scene's frames: the finished logo (base),
  // the yellow slogan typing in, then the dim unofficial note and a hold.
  // Every scene lands here, so every splash signs off identically.
  function landing(frames, base) {
    var i, k, g, n;
    for (i = 1; i <= 3; i++) {
      n = Math.ceil(SLOGAN.length * i / 3);
      g = blankGrid();
      drawCells(g, base);
      var left = Math.floor((W - SLOGAN.length) / 2);
      for (k = 0; k < n; k++) set(g, SLOGAN_ROW, left + k, SLOGAN[k], "y");
      frames.push({ grid: g, ms: i < 3 ? 80 : 140 });
    }
    g = blankGrid();
    drawCells(g, base);
    writeText(g, SLOGAN_ROW, SLOGAN, "y");
    writeText(g, NOTE_ROW, NOTE, "dim");
    frames.push({ grid: g, ms: 650 });
  }

  // ---------- scene registry ----------

  // What a scene's build() gets to work with. Geometry is built once, lazily —
  // scenes register at parse time, the context is only needed at play time.
  var ctx = null;
  function sceneCtx() {
    if (!ctx) {
      ctx = {
        W: W, H: H,
        RIBBON_TOP: RIBBON_TOP, WORD_TOP: WORD_TOP,
        blankGrid: blankGrid, set: set, drawCells: drawCells, writeText: writeText,
        ribbon: buildRibbon(), wordmark: buildWordmark(),
        landing: landing,
      };
    }
    return ctx;
  }

  var scenes = [], sceneById = {};
  function registerScene(scene) {
    scenes.push(scene);
    sceneById[scene.id] = scene;
  }

  // Rotation: every page load plays the next registered scene, in registration
  // (= script tag) order. ?splash=<id> pins one — handy for demos.
  function pickScene() {
    if (!scenes.length) return null;
    var m = location.search.match(/[?&]splash=([a-z]+)/);
    if (m && sceneById[m[1]]) return sceneById[m[1]];
    var i = parseInt(localStorage.getItem(ROTATE_KEY), 10);
    if (isNaN(i) || i < 0) i = 0;
    localStorage.setItem(ROTATE_KEY, String((i + 1) % scenes.length));
    return scenes[i % scenes.length];
  }

  // ---------- repair frames: micro effect handing off to the '@' marker ----------

  // Small 7×3 stage centered on the marker: crack collapses, a mini ribbon
  // flicks across with the same white glow as the splash sweeps, and the
  // sequence settles on '@' — the exact glyph the app draws for
  // "repair planned", so the animation dissolves into the marker itself.
  function buildRepairFrames() {
    var RW = 7, RH = 3, CX = 3, CY = 1;
    var frames = [], g, i;
    var crackPts = [
      { row: CY - 1, col: CX - 1, ch: "\\" }, { row: CY - 1, col: CX + 1, ch: "/" },
      { row: CY + 1, col: CX - 1, ch: "/" }, { row: CY + 1, col: CX + 1, ch: "\\" },
      { row: CY, col: CX - 2, ch: "-" }, { row: CY, col: CX + 2, ch: "-" },
    ];

    g = smallGrid(RW, RH);
    set(g, CY, CX, "*", "fg");
    crackPts.forEach(function (p) { set(g, p.row, p.col, p.ch, "dim"); });
    frames.push({ grid: g, ms: 140 });

    // collapse inward
    g = smallGrid(RW, RH);
    set(g, CY, CX, "*", "fg");
    crackPts.slice(0, 3).forEach(function (p) {
      var mr = p.row === CY ? CY : (p.row < CY ? p.row + 1 : p.row - 1);
      var mc = p.col === CX ? CX : (p.col < CX ? p.col + 1 : p.col - 1);
      set(g, mr, mc, ".", "dim");
    });
    frames.push({ grid: g, ms: 90 });
    g = smallGrid(RW, RH);
    set(g, CY, CX, "*", "rg");
    frames.push({ grid: g, ms: 90 });

    // mini ribbon flick across the point
    var flick = [{ ch: "◢", cls: "y" }, { ch: "█", cls: "glow" }, { ch: "◤", cls: "r" }];
    for (i = 0; i < flick.length; i++) {
      g = smallGrid(RW, RH);
      set(g, CY, CX + i - 1, flick[i].ch, flick[i].cls);
      frames.push({ grid: g, ms: 70 });
    }

    // hand off to the marker glyph: bright pulse settling to yellow
    g = smallGrid(RW, RH); set(g, CY, CX, "@", "glow"); frames.push({ grid: g, ms: 120 });
    g = smallGrid(RW, RH); set(g, CY, CX, "@", "yglow"); frames.push({ grid: g, ms: 130 });
    g = smallGrid(RW, RH); set(g, CY, CX, "@", "y"); frames.push({ grid: g, ms: 300 });

    return frames;
  }

  // ---------- playback ----------

  // Steps frames into `pre` until done or cancelled (isDead flips true).
  function playFrames(pre, frames, isDead, onDone) {
    var i = 0;
    function step() {
      if (isDead()) return;
      if (i >= frames.length) { if (onDone) onDone(); return; }
      pre.innerHTML = render(frames[i].grid);
      setTimeout(step, frames[i].ms);
      i++;
    }
    step();
  }

  // Fit the splash font to the viewport. Measured with a probe span, not the
  // live stage: some glyphs (✳ ●) aren't exactly one cell wide and would make
  // a content-based measurement jitter between frames.
  function fitSplash(pre) {
    var probe = document.createElement("span");
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.whiteSpace = "pre";
    probe.style.fontFamily = getComputedStyle(pre).fontFamily;
    probe.style.fontSize = "100px";
    probe.style.lineHeight = "1";
    probe.textContent = "MMMMMMMMMM";
    document.body.appendChild(probe);
    var charW = probe.getBoundingClientRect().width / 10;
    document.body.removeChild(probe);
    var fsForWidth = (window.innerWidth * 0.94) / (charW / 100 * W);
    var fsForHeight = (window.innerHeight * 0.65) / H; // line-height:1 → line box ≈ font-size
    // floored to whole pixels: a fractional size makes the block rows land on
    // fractional device pixels, which renders as hairline gaps inside the logo
    pre.style.fontSize = Math.floor(Math.max(6, Math.min(fsForWidth, fsForHeight, 30))) + "px";
  }

  // ---------- public: splash ----------

  function splash() {
    var scene = pickScene();
    if (!scene) return;

    var overlay = document.createElement("div");
    overlay.className = "splash-overlay anim-stage";
    overlay.setAttribute("aria-hidden", "true");
    var pre = document.createElement("pre");
    overlay.appendChild(pre);
    document.body.appendChild(overlay);
    fitSplash(pre);

    var dead = false;
    function close() {
      if (dead) return;
      dead = true;
      window.removeEventListener("keydown", close);
      window.removeEventListener("resize", refit);
      overlay.remove();
    }
    function refit() { fitSplash(pre); }
    overlay.addEventListener("pointerdown", close);
    overlay.addEventListener("click", close); // some input paths deliver click without pointerdown
    window.addEventListener("keydown", close);
    window.addEventListener("resize", refit);

    var frames = scene.build(sceneCtx());
    if (reducedMotion()) {
      // no motion: the settled logo with slogan and note, one quiet beat, gone
      pre.innerHTML = render(frames[frames.length - 1].grid);
      setTimeout(close, 1200);
      return;
    }
    playFrames(pre, frames, function () { return dead; }, close);
  }

  // ---------- public: repair micro-effect at a marker ----------

  // stage: the positioned ancestor (#glassStage), x/y: marker center in stage
  // pixels — the same coordinates the popup positions itself with.
  function repairFx(stage, x, y) {
    if (reducedMotion()) return;
    var pre = document.createElement("pre");
    pre.className = "repair-fx anim-stage";
    pre.setAttribute("aria-hidden", "true");
    pre.style.left = x + "px";
    pre.style.top = y + "px";
    stage.appendChild(pre);
    playFrames(pre, buildRepairFrames(), function () { return !pre.isConnected; }, function () { pre.remove(); });
  }

  window.SC = window.SC || {};
  window.SC.anim = {
    splash: splash, repairFx: repairFx, registerScene: registerScene,
    // internal, exposed for headless scene validation in Node
    _sceneCtx: sceneCtx, _scenes: scenes,
  };
})();
