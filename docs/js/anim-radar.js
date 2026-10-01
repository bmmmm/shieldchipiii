/* shieldchipiii — splash scene "radar": a windshield scan sweeps the glass,
 * locks onto the stone chip it finds, resolves the ribbon out of the lock-on
 * brackets segment by segment, then prints the wordmark. Registers with the
 * engine in js/anim.js. */
(function () {
  "use strict";

  var CAPTION_ROW = 17;
  var BOX_TOP = 1, BOX_LEFT = 4, BOX_WIDTH = 52; // rows 1-7, nearly full width
  var BOX_BOTTOM = BOX_TOP + 6;
  var BOX_RIGHT = BOX_LEFT + BOX_WIDTH - 1;
  var BOX_INTERIOR_W = BOX_WIDTH - 2;

  var SCAN_CAPTION = "SCANNE WINDSCHUTZSCHEIBE…";
  var LOCK_CAPTION = "STEINSCHLAG ERKANNT";
  var ID_CAPTION = "IDENTIFIZIERE MARKE…";

  // Partition ctx.ribbon into its 5 built segments by un-shearing each cell's
  // column (the shear steps 2 cols per row, so subtracting it back out lines
  // every segment's cells up at their pre-shear column) and clustering the
  // sorted, unique un-sheared columns at gaps >= 2. Reads the ribbon's own
  // geometry instead of re-declaring segment boundaries here.
  function ribbonSegments(ctx) {
    var ribbon = ctx.ribbon, i, cell;
    var withU = [];
    for (i = 0; i < ribbon.length; i++) {
      cell = ribbon[i];
      withU.push({ cell: cell, u: cell.col - 2 * ((ctx.RIBBON_TOP + 4) - cell.row) });
    }
    var uniq = [];
    withU.forEach(function (x) { if (uniq.indexOf(x.u) === -1) uniq.push(x.u); });
    uniq.sort(function (a, b) { return a - b; });
    var clusters = [], cur = [uniq[0]];
    for (i = 1; i < uniq.length; i++) {
      if (uniq[i] - uniq[i - 1] >= 2) { clusters.push(cur); cur = []; }
      cur.push(uniq[i]);
    }
    clusters.push(cur);
    var clusterOf = {};
    clusters.forEach(function (cl, idx) { cl.forEach(function (u) { clusterOf[u] = idx; }); });
    var segments = clusters.map(function () { return []; });
    withU.forEach(function (x) { segments[clusterOf[x.u]].push(x.cell); });
    return segments;
  }

  // Partition ctx.wordmark into per-letter cell groups (plus the lone ®) by
  // clustering columns on the 6-wide stride buildWordmark() uses (5-wide
  // glyph + 1-col gap) — recovered from the built cells, not re-read off the
  // font table.
  function wordLetters(ctx) {
    var wordmark = ctx.wordmark, i, cell, marks = [], reg = null, minCol = Infinity;
    for (i = 0; i < wordmark.length; i++) {
      cell = wordmark[i];
      if (cell.ch === "®") { reg = cell; continue; }
      marks.push(cell);
      if (cell.col < minCol) minCol = cell.col;
    }
    var maxIdx = 0;
    var pairs = marks.map(function (c) {
      var idx = Math.floor((c.col - minCol) / 6);
      if (idx > maxIdx) maxIdx = idx;
      return { cell: c, idx: idx };
    });
    var letters = [];
    for (i = 0; i <= maxIdx; i++) letters.push([]);
    pairs.forEach(function (p) { letters[p.idx].push(p.cell); });
    return { letters: letters, reg: reg };
  }

  function drawBoxOutline(g, ctx) {
    var r, c;
    ctx.set(g, BOX_TOP, BOX_LEFT, "┌", "dim");
    ctx.set(g, BOX_TOP, BOX_RIGHT, "┐", "dim");
    ctx.set(g, BOX_BOTTOM, BOX_LEFT, "└", "dim");
    ctx.set(g, BOX_BOTTOM, BOX_RIGHT, "┘", "dim");
    for (c = BOX_LEFT + 1; c < BOX_RIGHT; c++) {
      ctx.set(g, BOX_TOP, c, "─", "dim");
      ctx.set(g, BOX_BOTTOM, c, "─", "dim");
    }
    for (r = BOX_TOP + 1; r < BOX_BOTTOM; r++) {
      ctx.set(g, r, BOX_LEFT, "│", "dim");
      ctx.set(g, r, BOX_RIGHT, "│", "dim");
    }
  }

  function drawDots(g, ctx) {
    var ir, c, ch;
    for (ir = 0; ir < 5; ir++) {
      for (c = 0; c < BOX_INTERIOR_W; c++) {
        ch = (c + ir * 3) % 5 === 0 ? "·" : null;
        if (ch) ctx.set(g, BOX_TOP + 1 + ir, BOX_LEFT + 1 + c, ch, "dim");
      }
    }
  }

  function build(ctx) {
    var frames = [], g, i, k;
    var ribbon = ctx.ribbon, wordmark = ctx.wordmark;
    var base = ribbon.concat(wordmark);

    var segments = ribbonSegments(ctx);
    var wm = wordLetters(ctx);

    var ribMinRow = Infinity, ribMaxRow = -Infinity, ribMinCol = Infinity, ribMaxCol = -Infinity;
    ribbon.forEach(function (c) {
      if (c.row < ribMinRow) ribMinRow = c.row;
      if (c.row > ribMaxRow) ribMaxRow = c.row;
      if (c.col < ribMinCol) ribMinCol = c.col;
      if (c.col > ribMaxCol) ribMaxCol = c.col;
    });
    var lockTop = ribMinRow - 1, lockBottom = ribMaxRow + 1;
    var lockLeft = ribMinCol - 2, lockRight = ribMaxCol + 2;

    var blipCol = Math.round((ribMinCol + ribMaxCol) / 2) - (BOX_LEFT + 1);
    if (blipCol < 0) blipCol = 0;
    if (blipCol > BOX_INTERIOR_W - 1) blipCol = BOX_INTERIOR_W - 1;
    var blipRowIr = 2;

    function drawBrackets(gr, top, bottom, left, right) {
      ctx.set(gr, top, left, "⌜", "fg");
      ctx.set(gr, top, right, "⌝", "fg");
      ctx.set(gr, bottom, left, "⌞", "fg");
      ctx.set(gr, bottom, right, "⌟", "fg");
    }

    // ---------------------------------------------------------------
    // 1: windshield scan — the establishing beat, deliberately unhurried
    // ---------------------------------------------------------------
    var SCAN_STEPS = 12;
    for (i = 0; i < SCAN_STEPS; i++) {
      var sweepCol = Math.round((i * (BOX_INTERIOR_W - 1)) / (SCAN_STEPS - 1));
      var blipOn = sweepCol >= blipCol;
      var r;
      g = ctx.blankGrid();
      drawBoxOutline(g, ctx);
      drawDots(g, ctx);
      for (r = BOX_TOP + 1; r < BOX_BOTTOM; r++) ctx.set(g, r, BOX_LEFT + 1 + sweepCol, "┃", "fg");
      if (blipOn) ctx.set(g, BOX_TOP + 1 + blipRowIr, BOX_LEFT + 1 + blipCol, "◉", "rg");
      ctx.writeText(g, CAPTION_ROW, SCAN_CAPTION, "dim");
      frames.push({ grid: g, ms: 130 });
    }

    // ---------------------------------------------------------------
    // 2: pause on the hit, call it, snap the lock-on brackets
    // ---------------------------------------------------------------
    g = ctx.blankGrid();
    drawBoxOutline(g, ctx);
    drawDots(g, ctx);
    ctx.set(g, BOX_TOP + 1 + blipRowIr, BOX_LEFT + 1 + blipCol, "◉", "rg");
    ctx.writeText(g, CAPTION_ROW, SCAN_CAPTION, "dim");
    frames.push({ grid: g, ms: 200 });

    g = ctx.blankGrid();
    drawBoxOutline(g, ctx);
    drawDots(g, ctx);
    ctx.set(g, BOX_TOP + 1 + blipRowIr, BOX_LEFT + 1 + blipCol, "◉", "rg");
    ctx.writeText(g, CAPTION_ROW, LOCK_CAPTION, "dim");
    frames.push({ grid: g, ms: 220 });

    g = ctx.blankGrid();
    ctx.set(g, BOX_TOP + 1 + blipRowIr, BOX_LEFT + 1 + blipCol, "◉", "rg");
    drawBrackets(g, lockTop - 1, lockBottom + 1, lockLeft - 6, lockRight + 6);
    ctx.writeText(g, CAPTION_ROW, LOCK_CAPTION, "dim");
    frames.push({ grid: g, ms: 90 });

    g = ctx.blankGrid();
    drawBrackets(g, lockTop, lockBottom, lockLeft, lockRight);
    ctx.writeText(g, CAPTION_ROW, LOCK_CAPTION, "dim");
    frames.push({ grid: g, ms: 110 });

    // ---------------------------------------------------------------
    // 3: identify — the ribbon resolves inside the brackets, segment by segment
    // ---------------------------------------------------------------
    for (i = 0; i < segments.length; i++) {
      g = ctx.blankGrid();
      drawBrackets(g, lockTop, lockBottom, lockLeft, lockRight);
      for (k = 0; k <= i; k++) {
        var flashCls = k === i ? "glow" : null;
        segments[k].forEach(function (c) { ctx.set(g, c.row, c.col, c.ch, flashCls || c.cls); });
      }
      ctx.writeText(g, CAPTION_ROW, ID_CAPTION, "dim");
      frames.push({ grid: g, ms: 70 });

      g = ctx.blankGrid();
      drawBrackets(g, lockTop, lockBottom, lockLeft, lockRight);
      for (k = 0; k <= i; k++) segments[k].forEach(function (c) { ctx.set(g, c.row, c.col, c.ch, c.cls); });
      ctx.writeText(g, CAPTION_ROW, ID_CAPTION, "dim");
      frames.push({ grid: g, ms: 55 });
    }

    // ---------------------------------------------------------------
    // 4: brackets vanish, the wordmark prints in two letters at a time
    // ---------------------------------------------------------------
    var letters = wm.letters, groups = Math.ceil(letters.length / 2);
    for (i = 0; i < groups; i++) {
      var startIdx = i * 2, endIdx = Math.min(startIdx + 2, letters.length);
      g = ctx.blankGrid();
      ctx.drawCells(g, ribbon);
      for (k = 0; k < endIdx; k++) {
        var flash = k >= startIdx;
        letters[k].forEach(function (c) { ctx.set(g, c.row, c.col, c.ch, flash ? "yglow" : c.cls); });
      }
      if (endIdx >= letters.length && wm.reg) ctx.set(g, wm.reg.row, wm.reg.col, wm.reg.ch, wm.reg.cls);
      ctx.writeText(g, CAPTION_ROW, ID_CAPTION, "dim");
      frames.push({ grid: g, ms: 90 });
    }

    // settle: full ribbon + full wordmark, real colors, one beat before landing
    g = ctx.blankGrid();
    ctx.drawCells(g, base);
    ctx.writeText(g, CAPTION_ROW, ID_CAPTION, "dim");
    frames.push({ grid: g, ms: 200 });

    // ---------------------------------------------------------------
    // 5: the shared landing — slogan and note
    // ---------------------------------------------------------------
    ctx.landing(frames, base);
    return frames;
  }

  window.SC.anim.registerScene({ id: "radar", build: build });
})();
