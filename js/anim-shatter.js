/* shieldchipiii — splash scene "shatter": a windshield's shard burst runs in
 * reverse. Loose glass glyphs scattered across the stage fly inward along
 * straight paths and snap into the wordmark in three waves, the ribbon slams
 * in behind them segment by segment, then one glint sweeps the finished
 * brand. Registers with the engine in js/anim.js. */
(function () {
  "use strict";

  // Deterministic PRNG for the shard scatter — fixed seed, computed once at
  // build time. No Math.random anywhere below: frames replay identically.
  function mulberry32(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var SHARD_CHARS = ["/", "\\", "<", ">", "^", "v", "'", ".", ",", "`"];

  // Splits the ribbon's 5 sheared segments back into upright groups: undo the
  // per-row shear (see buildRibbon in anim.js), then cut the sorted unsheared
  // columns at the same >=2 gaps the segments were built with.
  function partitionRibbon(ribbon, ribbonTop) {
    var withU = ribbon.map(function (cell) {
      return { cell: cell, u: cell.col - 2 * ((ribbonTop + 4) - cell.row) };
    });
    var us = [];
    withU.forEach(function (p) { if (us.indexOf(p.u) === -1) us.push(p.u); });
    us.sort(function (a, b) { return a - b; });
    var groups = [[us[0]]];
    for (var i = 1; i < us.length; i++) {
      if (us[i] - us[i - 1] >= 2) groups.push([]);
      groups[groups.length - 1].push(us[i]);
    }
    return groups.map(function (groupUs) {
      return withU.filter(function (p) { return groupUs.indexOf(p.u) !== -1; }).map(function (p) { return p.cell; });
    });
  }

  function build(ctx) {
    var rng = mulberry32(1337);
    var frames = [], g, i;

    // ---------- shard scatter: one fly-in shard per wordmark block cell ----------
    var wordCells = ctx.wordmark.filter(function (c) { return c.ch === "█"; });
    var regCell = ctx.wordmark.filter(function (c) { return c.ch !== "█"; })[0]; // the ® mark

    var minCol = Infinity, maxCol = -Infinity;
    wordCells.forEach(function (c) { if (c.col < minCol) minCol = c.col; if (c.col > maxCol) maxCol = c.col; });
    var third = (maxCol - minCol + 1) / 3;
    var cut1 = minCol + third, cut2 = minCol + third * 2;

    var shards = wordCells.map(function (c) {
      return {
        toRow: c.row, toCol: c.col,
        fromRow: Math.floor(rng() * ctx.H),
        fromCol: Math.floor(rng() * ctx.W),
        ch: SHARD_CHARS[Math.floor(rng() * SHARD_CHARS.length)],
        wave: c.col < cut1 ? 0 : (c.col < cut2 ? 1 : 2), // left / middle / right third
      };
    });

    // ---------- A+B: burst, then 3 staggered waves fly the shards home ----------
    // Frame 0 is the burst itself: every wave still reads its "from" spot
    // there, so no separate static frame is needed before flight starts.
    var WAVE_START = [0, 2, 4], WAVE_END = [4, 6, 8], WAVE_OVER = [5, 7, 9];
    var lastG = WAVE_OVER[2] + 1; // final frame: everything settled, ® pops in
    var flightMs = [480, 100, 90, 80, 70, 60, 70, 60, 70, 60, 220];

    for (g = 0; g <= lastG; g++) {
      var grid = ctx.blankGrid();
      for (i = 0; i < shards.length; i++) {
        var s = shards[i];
        var st = WAVE_START[s.wave], en = WAVE_END[s.wave], ov = WAVE_OVER[s.wave];
        if (g < st) {
          ctx.set(grid, s.fromRow, s.fromCol, s.ch, "dim");
        } else if (g <= en) {
          var t = (g - st) / (en - st);
          var r = Math.round(s.fromRow + (s.toRow - s.fromRow) * t);
          var c = Math.round(s.fromCol + (s.toCol - s.fromCol) * t);
          ctx.set(grid, r, c, s.ch, "dim");
        } else if (g === ov) {
          ctx.set(grid, s.toRow, s.toCol + 1, "█", "rg"); // 1-col overshoot, bright
        } else {
          ctx.set(grid, s.toRow, s.toCol, "█", "r");
        }
      }
      if (g === lastG) ctx.set(grid, regCell.row, regCell.col, regCell.ch, regCell.cls);
      frames.push({ grid: grid, ms: flightMs[g] });
    }

    // ---------- C: ribbon slam, 5 segments in 5 quick beats ----------
    var segs = partitionRibbon(ctx.ribbon, ctx.RIBBON_TOP);
    var SHAKE = [{ dr: 1, dc: 0 }, { dr: 0, dc: 1 }, { dr: 1, dc: 0 }, { dr: 0, dc: -1 }, { dr: -1, dc: 0 }];
    var beatShakeMs = [55, 52, 50, 48, 62], beatBackMs = [85, 80, 75, 70, 130];
    var landed = [], base, off, shakeGrid, backGrid;

    for (i = 0; i < segs.length; i++) {
      landed = landed.concat(segs[i]);
      base = ctx.wordmark.concat(landed);

      off = SHAKE[i];
      shakeGrid = ctx.blankGrid();
      base.forEach(function (cell) { ctx.set(shakeGrid, cell.row + off.dr, cell.col + off.dc, cell.ch, cell.cls); });
      frames.push({ grid: shakeGrid, ms: beatShakeMs[i] });

      backGrid = ctx.blankGrid();
      ctx.drawCells(backGrid, base);
      frames.push({ grid: backGrid, ms: beatBackMs[i] });
    }

    // ---------- D: one-pass glint across the ribbon (mirrors anim-impact.js part G) ----------
    base = ctx.ribbon.concat(ctx.wordmark);
    var glintSteps = 9;
    var ribbonMinC = Infinity, ribbonMaxC = -Infinity;
    ctx.ribbon.forEach(function (cell) { if (cell.col < ribbonMinC) ribbonMinC = cell.col; if (cell.col > ribbonMaxC) ribbonMaxC = cell.col; });
    var span = ribbonMaxC - ribbonMinC + 4;
    for (i = 0; i < glintSteps; i++) {
      var glintGrid = ctx.blankGrid();
      ctx.drawCells(glintGrid, base);
      var glintCol = Math.round(ribbonMinC - 2 + span * (i / (glintSteps - 1)));
      ctx.ribbon.forEach(function (cell) { if (cell.col >= glintCol - 1 && cell.col <= glintCol + 1) ctx.set(glintGrid, cell.row, cell.col, cell.ch, "glow"); });
      frames.push({ grid: glintGrid, ms: 60 });
    }

    // ---------- E: the shared landing — slogan and note ----------
    ctx.landing(frames, base);
    return frames;
  }

  window.SC.anim.registerScene({ id: "shatter", build: build });
})();
