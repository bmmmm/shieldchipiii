/* shieldchipiii — splash scene "wiper": rain-speckled glass hides the logo;
 * an ASCII wiper arm sweeps a real angular sector to reveal it, a fast
 * return pass glints across the finished ribbon, and a single droplet slides
 * off before the shared landing takes over. Registers with the engine in
 * js/anim.js. */
(function () {
  "use strict";

  // deterministic PRNG (mulberry32) — same rain pattern every playback
  function mulberry32(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var RAIN_CHARS = ["░", "·", "'", ","];

  function buildRain(H, W) {
    var rng = mulberry32(1337), points = [], r, c;
    for (r = 0; r < H; r++)
      for (c = 0; c < W; c++)
        if (rng() < 0.10) points.push({ row: r, col: c, ch: RAIN_CHARS[Math.floor(rng() * RAIN_CHARS.length)] });
    return points;
  }

  function build(ctx) {
    var W = ctx.W, H = ctx.H;
    var ribbon = ctx.ribbon, wordmark = ctx.wordmark;
    var logoCells = ribbon.concat(wordmark);
    var base = logoCells;

    // pivot below the stage: the arm rotates through the whole visible sector
    var PIVOT_ROW = H + 4, PIVOT_COL = Math.round(W / 2), ROW_SCALE = 2;
    function angleOf(row, col) {
      var dx = col - PIVOT_COL, dy = (PIVOT_ROW - row) * ROW_SCALE;
      return Math.atan2(dy, dx) * 180 / Math.PI;
    }
    function drawArm(g, thetaDeg, cls) {
      var rad = thetaDeg * Math.PI / 180, tanT = Math.tan(rad);
      if (Math.abs(tanT) < 0.005) return;
      var armCh = thetaDeg < 75 ? "/" : thetaDeg > 105 ? "\\" : "|";
      var r, dy, dx, c;
      for (r = 0; r < H; r++) {
        dy = (PIVOT_ROW - r) * ROW_SCALE;
        if (dy <= 0) continue;
        dx = dy / tanT;
        c = Math.round(PIVOT_COL + dx);
        if (c >= 0 && c < W) ctx.set(g, r, c, armCh, cls);
      }
    }

    // sweep bounds: the stage corners' angular extent, plus a small buffer
    var corners = [[0, 0], [0, W - 1], [H - 1, 0], [H - 1, W - 1]];
    var minA = 180, maxA = 0, i, a;
    for (i = 0; i < corners.length; i++) {
      a = angleOf(corners[i][0], corners[i][1]);
      if (a < minA) minA = a;
      if (a > maxA) maxA = a;
    }
    var thetaStart = Math.min(178, maxA + 8);
    var thetaEnd = Math.max(2, minA - 8);

    // rain: sparse dirt speckle. Full stage for the intro burst; the clean
    // subset (above the landing text rows) backs the sweep so the lower
    // stage reads clear once the wipe gets going.
    var rainFull = buildRain(H, W);
    // filtered against the +2 drizzle-drift offset applied below, so the
    // shifted backdrop still clears out before row 14
    var rainClean = rainFull.filter(function (p) { return p.row < 12; });
    var ghostCells = logoCells.filter(function (p, idx) { return idx % 19 === 0; });

    var frames = [], g, k, r, p;

    // 1: drizzle intro — rain drifts down, logo barely hinted
    var introMs = [140, 120, 110];
    for (i = 0; i < introMs.length; i++) {
      g = ctx.blankGrid();
      for (k = 0; k < rainFull.length; k++) {
        r = rainFull[k].row + i;
        if (r < H) ctx.set(g, r, rainFull[k].col, rainFull[k].ch, "dim");
      }
      for (k = 0; k < ghostCells.length; k++) ctx.set(g, ghostCells[k].row, ghostCells[k].col, ghostCells[k].ch, "dim");
      frames.push({ grid: g, ms: introMs[i] });
    }

    // 2: forward wipe — arm sweeps left→right, sector reveal follows the arc
    var framesFwd = 10, front;
    for (i = 0; i < framesFwd; i++) {
      front = thetaStart - i * (thetaStart - thetaEnd) / (framesFwd - 1);
      g = ctx.blankGrid();
      for (k = 0; k < rainClean.length; k++) {
        p = rainClean[k]; r = p.row + 2; // settled drizzle backdrop
        if (r < H && angleOf(r, p.col) < front) ctx.set(g, r, p.col, p.ch, "dim");
      }
      for (k = 0; k < ghostCells.length; k++)
        if (angleOf(ghostCells[k].row, ghostCells[k].col) < front) ctx.set(g, ghostCells[k].row, ghostCells[k].col, ghostCells[k].ch, "dim");
      for (k = 0; k < logoCells.length; k++)
        if (angleOf(logoCells[k].row, logoCells[k].col) >= front) ctx.set(g, logoCells[k].row, logoCells[k].col, logoCells[k].ch, logoCells[k].cls);
      drawArm(g, front, "glow");
      frames.push({ grid: g, ms: 110 });
    }

    // 3: fast return — logo already clean, glint sweeps back across the ribbon
    var framesRet = 5, glintA;
    for (i = 0; i < framesRet; i++) {
      glintA = thetaEnd + i * (thetaStart - thetaEnd) / (framesRet - 1);
      g = ctx.blankGrid();
      ctx.drawCells(g, base);
      for (k = 0; k < ribbon.length; k++)
        if (Math.abs(angleOf(ribbon[k].row, ribbon[k].col) - glintA) < 9) ctx.set(g, ribbon[k].row, ribbon[k].col, ribbon[k].ch, "glow");
      drawArm(g, glintA, "glow");
      frames.push({ grid: g, ms: 95 });
    }

    // 4: a single droplet slides off the wordmark and vanishes, one still beat
    var dropCol = wordmark[Math.floor(wordmark.length / 2)].col;
    var dropStartRow = ctx.WORD_TOP + 4, dropEndRow = H - 2, dropSteps = 4;
    for (i = 0; i < dropSteps; i++) {
      r = Math.round(dropStartRow + (dropEndRow - dropStartRow) * i / (dropSteps - 1));
      g = ctx.blankGrid();
      ctx.drawCells(g, base);
      ctx.set(g, r, dropCol, "·", "glow");
      frames.push({ grid: g, ms: 100 });
    }
    g = ctx.blankGrid();
    ctx.drawCells(g, base);
    frames.push({ grid: g, ms: 260 });

    // 5: the shared landing — slogan and note
    ctx.landing(frames, base);
    return frames;
  }

  window.SC.anim.registerScene({ id: "wiper", build: build });
})();
