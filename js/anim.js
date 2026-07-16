/* shieldchipiii — CARGLASS-style brand animations: the page-load splash and
 * the "repair planned" marker micro-effect. ASCII frames stepped like a
 * terminal, not tweened. Browser-only garnish the CLI never loads: skippable
 * (any click or key), aria-hidden, and gone entirely under reduced motion. */
(function () {
  "use strict";

  var W = 60, H = 17; // splash stage, in character cells

  function reducedMotion() {
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  // ---------- grid primitives ----------

  function blankGrid(w, h) {
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

  // ---------- logo geometry ----------

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
  var WORD_TOP = 8;

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

  var IMPACT = { row: 7, col: 30 };

  // Five hand-authored jagged branches, interleaved so they grow together.
  function buildCrackOrder() {
    var branches = [
      [{ row: 6, col: 31, ch: "/" }, { row: 5, col: 32, ch: "'" }, { row: 4, col: 33, ch: "/" }, { row: 3, col: 34, ch: "`" }, { row: 2, col: 35, ch: "/" }],
      [{ row: 6, col: 29, ch: "\\" }, { row: 5, col: 28, ch: "`" }, { row: 4, col: 26, ch: "\\" }, { row: 3, col: 25, ch: "," }, { row: 2, col: 23, ch: "\\" }],
      [{ row: 7, col: 32, ch: "-" }, { row: 7, col: 34, ch: "." }, { row: 8, col: 36, ch: "-" }, { row: 8, col: 38, ch: "'" }],
      [{ row: 7, col: 28, ch: "-" }, { row: 7, col: 26, ch: "." }, { row: 8, col: 24, ch: "-" }, { row: 8, col: 22, ch: "'" }],
      [{ row: 8, col: 30, ch: "|" }, { row: 9, col: 30, ch: "." }, { row: 10, col: 31, ch: "`" }, { row: 11, col: 30, ch: "|" }],
    ];
    var out = [], i, b;
    var maxLen = 0;
    branches.forEach(function (br) { if (br.length > maxLen) maxLen = br.length; });
    for (i = 0; i < maxLen; i++)
      for (b = 0; b < branches.length; b++)
        if (branches[b][i]) out.push({ row: branches[b][i].row, col: branches[b][i].col, ch: branches[b][i].ch, cls: "dim" });
    return out;
  }

  // ---------- splash frames: impact → crack → glowing-edge sweep → glint → tagline ----------

  function buildSplashFrames() {
    var ribbon = buildRibbon();
    var wordmark = buildWordmark();
    var crackOrder = buildCrackOrder();
    var frames = [], g, i, k, r;

    // A: projectile approach (accelerating inward)
    var path = [
      { row: 1, col: 52, ch: "·", cls: "dim" },
      { row: 2, col: 45, ch: "∙", cls: "fg" },
      { row: 4, col: 38, ch: "∙", cls: "fg" },
      { row: 6, col: 32, ch: "●", cls: "rg" },
    ];
    var pathHold = [130, 105, 85, 65];
    for (i = 0; i < path.length; i++) {
      g = blankGrid(W, H);
      set(g, path[i].row, path[i].col, path[i].ch, path[i].cls);
      frames.push({ grid: g, ms: pathHold[i] });
    }

    // B: impact flash
    g = blankGrid(W, H);
    set(g, IMPACT.row, IMPACT.col, "✳", "glow");
    set(g, IMPACT.row - 1, IMPACT.col, ".", "glow");
    set(g, IMPACT.row + 1, IMPACT.col, ".", "glow");
    set(g, IMPACT.row, IMPACT.col - 1, ".", "glow");
    set(g, IMPACT.row, IMPACT.col + 1, ".", "glow");
    frames.push({ grid: g, ms: 70 });
    g = blankGrid(W, H);
    set(g, IMPACT.row, IMPACT.col, "*", "rg");
    frames.push({ grid: g, ms: 90 });

    // C: crack growth, accelerating along the interleaved branches
    var crackSchedule = [2, 4, 7, 10, 13, 16, 19, 22];
    var crackHold = [110, 100, 90, 82, 75, 70, 66, 63];
    var lastCrackGrid = null;
    for (i = 0; i < crackSchedule.length; i++) {
      g = blankGrid(W, H);
      set(g, IMPACT.row, IMPACT.col, "*", "rg");
      for (k = 0; k < crackSchedule[i]; k++) set(g, crackOrder[k].row, crackOrder[k].col, crackOrder[k].ch, crackOrder[k].cls);
      frames.push({ grid: g, ms: crackHold[i] });
      lastCrackGrid = g;
    }

    // D: stillness beat ("oh no")
    frames.push({ grid: lastCrackGrid, ms: 320 });

    // E: squeegee sweep — a single bright column rides the sweep front; crack
    // characters die exactly as the edge reaches their column, the finished
    // logo is what the edge leaves behind.
    var sweepWeights = [1, 2, 3, 4, 5, 5, 4, 3, 2, 1]; // ease in, plateau, ease out
    var minCol = -8, maxCol = W + 8;
    var totalWeight = 0;
    sweepWeights.forEach(function (w) { totalWeight += w; });
    var scale = (maxCol - minCol) / totalWeight;
    var runningCol = minCol;
    var sweepCols = sweepWeights.map(function (w) { runningCol += w * scale; return Math.round(runningCol); });
    sweepCols[sweepCols.length - 1] = maxCol;
    var leadWordmark = 5;
    for (i = 0; i < sweepCols.length; i++) {
      var edgeCol = sweepCols[i];
      g = blankGrid(W, H);
      crackOrder.forEach(function (p) { if (p.col > edgeCol) set(g, p.row, p.col, p.ch, p.cls); });
      if (IMPACT.col > edgeCol) set(g, IMPACT.row, IMPACT.col, "*", "rg");
      ribbon.forEach(function (c) { if (c.col <= edgeCol) set(g, c.row, c.col, c.ch, c.cls); });
      wordmark.forEach(function (c) { if (c.col <= edgeCol - leadWordmark) set(g, c.row, c.col, c.ch, c.cls); });
      for (r = 2; r <= 12; r++) set(g, r, edgeCol, "┃", "glow");
      frames.push({ grid: g, ms: 60 });
    }

    // F: settle — finished logo, no damage, no bar
    g = blankGrid(W, H);
    drawCells(g, ribbon);
    drawCells(g, wordmark);
    frames.push({ grid: g, ms: 240 });

    // G: one-pass glint across the ribbon
    var glintSteps = 9;
    var ribbonMinC = Infinity, ribbonMaxC = -Infinity;
    ribbon.forEach(function (c) { if (c.col < ribbonMinC) ribbonMinC = c.col; if (c.col > ribbonMaxC) ribbonMaxC = c.col; });
    var span = ribbonMaxC - ribbonMinC + 4;
    for (i = 0; i < glintSteps; i++) {
      g = blankGrid(W, H);
      drawCells(g, ribbon);
      drawCells(g, wordmark);
      var glintCol = Math.round(ribbonMinC - 2 + span * (i / (glintSteps - 1)));
      ribbon.forEach(function (c) { if (c.col >= glintCol - 1 && c.col <= glintCol + 1) set(g, c.row, c.col, c.ch, "glow"); });
      frames.push({ grid: g, ms: 55 });
    }

    // H: landing — typed tagline under the wordmark, then the final hold
    var tagline = "· STONE-CHIP LOGBOOK ·";
    var tagRow = WORD_TOP + 6;
    var tagLeft = Math.floor((W - tagline.length) / 2);
    for (i = 1; i <= 4; i++) {
      var n = Math.ceil(tagline.length * i / 4);
      g = blankGrid(W, H);
      drawCells(g, ribbon);
      drawCells(g, wordmark);
      for (k = 0; k < n; k++) set(g, tagRow, tagLeft + k, tagline[k], "dim");
      frames.push({ grid: g, ms: i < 4 ? 70 : 90 });
    }
    frames.push({ grid: frames[frames.length - 1].grid, ms: 400 });

    return frames;
  }

  // ---------- repair frames: micro effect handing off to the '@' marker ----------

  // Small 7×3 stage centered on the marker: crack collapses, a mini ribbon
  // flicks across with the same white glow as the splash sweep's edge, and the
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

    g = blankGrid(RW, RH);
    set(g, CY, CX, "*", "fg");
    crackPts.forEach(function (p) { set(g, p.row, p.col, p.ch, "dim"); });
    frames.push({ grid: g, ms: 140 });

    // collapse inward
    g = blankGrid(RW, RH);
    set(g, CY, CX, "*", "fg");
    crackPts.slice(0, 3).forEach(function (p) {
      var mr = p.row === CY ? CY : (p.row < CY ? p.row + 1 : p.row - 1);
      var mc = p.col === CX ? CX : (p.col < CX ? p.col + 1 : p.col - 1);
      set(g, mr, mc, ".", "dim");
    });
    frames.push({ grid: g, ms: 90 });
    g = blankGrid(RW, RH);
    set(g, CY, CX, "*", "rg");
    frames.push({ grid: g, ms: 90 });

    // mini ribbon flick across the point
    var flick = [{ ch: "◢", cls: "y" }, { ch: "█", cls: "glow" }, { ch: "◤", cls: "r" }];
    for (i = 0; i < flick.length; i++) {
      g = blankGrid(RW, RH);
      set(g, CY, CX + i - 1, flick[i].ch, flick[i].cls);
      frames.push({ grid: g, ms: 70 });
    }

    // hand off to the marker glyph: bright pulse settling to yellow
    g = blankGrid(RW, RH); set(g, CY, CX, "@", "glow"); frames.push({ grid: g, ms: 120 });
    g = blankGrid(RW, RH); set(g, CY, CX, "@", "yglow"); frames.push({ grid: g, ms: 130 });
    g = blankGrid(RW, RH); set(g, CY, CX, "@", "y"); frames.push({ grid: g, ms: 300 });

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
    var fsForHeight = (window.innerHeight * 0.6) / H; // line-height:1 → line box ≈ font-size
    // floored to whole pixels: a fractional size makes the block rows land on
    // fractional device pixels, which renders as hairline gaps inside the logo
    pre.style.fontSize = Math.floor(Math.max(6, Math.min(fsForWidth, fsForHeight, 30))) + "px";
  }

  // ---------- public: splash ----------

  function splash() {
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

    if (reducedMotion()) {
      // no motion: the settled logo, one quiet beat, gone
      var frames = buildSplashFrames();
      pre.innerHTML = render(frames[frames.length - 1].grid);
      setTimeout(close, 900);
      return;
    }
    playFrames(pre, buildSplashFrames(), function () { return dead; }, close);
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
  window.SC.anim = { splash: splash, repairFx: repairFx };
})();
