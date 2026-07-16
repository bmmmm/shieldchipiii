/* shieldchipiii — splash scene "impact": a stone chip flies in, the crack
 * spiders out, and a glowing squeegee sweeps it away, leaving the brand.
 * The repair promise as a story. Registers with the engine in js/anim.js. */
(function () {
  "use strict";

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

  function build(ctx) {
    var ribbon = ctx.ribbon, wordmark = ctx.wordmark;
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
      g = ctx.blankGrid();
      ctx.set(g, path[i].row, path[i].col, path[i].ch, path[i].cls);
      frames.push({ grid: g, ms: pathHold[i] });
    }

    // B: impact flash
    g = ctx.blankGrid();
    ctx.set(g, IMPACT.row, IMPACT.col, "✳", "glow");
    ctx.set(g, IMPACT.row - 1, IMPACT.col, ".", "glow");
    ctx.set(g, IMPACT.row + 1, IMPACT.col, ".", "glow");
    ctx.set(g, IMPACT.row, IMPACT.col - 1, ".", "glow");
    ctx.set(g, IMPACT.row, IMPACT.col + 1, ".", "glow");
    frames.push({ grid: g, ms: 70 });
    g = ctx.blankGrid();
    ctx.set(g, IMPACT.row, IMPACT.col, "*", "rg");
    frames.push({ grid: g, ms: 90 });

    // C: crack growth, accelerating along the interleaved branches
    var crackSchedule = [2, 4, 7, 10, 13, 16, 19, 22];
    var crackHold = [110, 100, 90, 82, 75, 70, 66, 63];
    var lastCrackGrid = null;
    for (i = 0; i < crackSchedule.length; i++) {
      g = ctx.blankGrid();
      ctx.set(g, IMPACT.row, IMPACT.col, "*", "rg");
      for (k = 0; k < crackSchedule[i]; k++) ctx.set(g, crackOrder[k].row, crackOrder[k].col, crackOrder[k].ch, crackOrder[k].cls);
      frames.push({ grid: g, ms: crackHold[i] });
      lastCrackGrid = g;
    }

    // D: stillness beat ("oh no")
    frames.push({ grid: lastCrackGrid, ms: 320 });

    // E: squeegee sweep — a single bright column rides the sweep front; crack
    // characters die exactly as the edge reaches their column, the finished
    // logo is what the edge leaves behind.
    var sweepWeights = [1, 2, 3, 4, 5, 5, 4, 3, 2, 1]; // ease in, plateau, ease out
    var minCol = -8, maxCol = ctx.W + 8;
    var totalWeight = 0;
    sweepWeights.forEach(function (w) { totalWeight += w; });
    var scale = (maxCol - minCol) / totalWeight;
    var runningCol = minCol;
    var sweepCols = sweepWeights.map(function (w) { runningCol += w * scale; return Math.round(runningCol); });
    sweepCols[sweepCols.length - 1] = maxCol;
    var leadWordmark = 5;
    for (i = 0; i < sweepCols.length; i++) {
      var edgeCol = sweepCols[i];
      g = ctx.blankGrid();
      crackOrder.forEach(function (p) { if (p.col > edgeCol) ctx.set(g, p.row, p.col, p.ch, p.cls); });
      if (IMPACT.col > edgeCol) ctx.set(g, IMPACT.row, IMPACT.col, "*", "rg");
      ribbon.forEach(function (c) { if (c.col <= edgeCol) ctx.set(g, c.row, c.col, c.ch, c.cls); });
      wordmark.forEach(function (c) { if (c.col <= edgeCol - leadWordmark) ctx.set(g, c.row, c.col, c.ch, c.cls); });
      for (r = 2; r <= 12; r++) ctx.set(g, r, edgeCol, "┃", "glow");
      frames.push({ grid: g, ms: 60 });
    }

    // F: settle — finished logo, no damage, no bar
    var base = ribbon.concat(wordmark);
    g = ctx.blankGrid();
    ctx.drawCells(g, base);
    frames.push({ grid: g, ms: 240 });

    // G: one-pass glint across the ribbon
    var glintSteps = 9;
    var ribbonMinC = Infinity, ribbonMaxC = -Infinity;
    ribbon.forEach(function (c) { if (c.col < ribbonMinC) ribbonMinC = c.col; if (c.col > ribbonMaxC) ribbonMaxC = c.col; });
    var span = ribbonMaxC - ribbonMinC + 4;
    for (i = 0; i < glintSteps; i++) {
      g = ctx.blankGrid();
      ctx.drawCells(g, base);
      var glintCol = Math.round(ribbonMinC - 2 + span * (i / (glintSteps - 1)));
      ribbon.forEach(function (c) { if (c.col >= glintCol - 1 && c.col <= glintCol + 1) ctx.set(g, c.row, c.col, c.ch, "glow"); });
      frames.push({ grid: g, ms: 55 });
    }

    // H: the shared landing — slogan and note
    ctx.landing(frames, base);
    return frames;
  }

  window.SC.anim.registerScene({ id: "impact", build: build });
})();
