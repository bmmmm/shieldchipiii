/* shieldchipiii — windshield shape presets + geometry.
 * UMD-ish: attaches to window.SC in the browser, exports via module.exports in Node (CLI). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.shapes = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // All values are ratios relative to the bottom edge width:
  //   top    = top edge width / bottom edge width  (< 1: view from inside, top is shorter)
  //   aspect = glass height / bottom edge width
  //   round  = corner radius / glass height
  var PRESETS = {
    compact: { top: 0.68, aspect: 0.40, round: 0.10 },
    sedan:   { top: 0.62, aspect: 0.36, round: 0.12 },
    suv:     { top: 0.74, aspect: 0.44, round: 0.10 },
    van:     { top: 0.85, aspect: 0.55, round: 0.06 },
    sport:   { top: 0.55, aspect: 0.28, round: 0.16 },
  };
  var PRESET_ORDER = ["compact", "sedan", "suv", "van", "sport"];

  var LIMITS = {
    top:    { min: 0.35, max: 0.98 },
    aspect: { min: 0.20, max: 0.65 },
    round:  { min: 0.00, max: 0.25 },
  };

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // Effective shape params for a car: preset overridden by per-car adjustments.
  function paramsFor(car) {
    var base = PRESETS[car && car.shape] || PRESETS.sedan;
    var adj = (car && car.adjust) || {};
    return {
      top:    clamp(adj.top    != null ? adj.top    : base.top,    LIMITS.top.min,    LIMITS.top.max),
      aspect: clamp(adj.aspect != null ? adj.aspect : base.aspect, LIMITS.aspect.min, LIMITS.aspect.max),
      round:  clamp(adj.round  != null ? adj.round  : base.round,  LIMITS.round.min,  LIMITS.round.max),
    };
  }

  // Trapezoid corner points for a given bottom width, origin at top-left of the
  // glass bounding box. Returns { h, tl, tr, br, bl } (each [x, y]).
  function corners(params, bottomW) {
    var h = bottomW * params.aspect;
    var topW = bottomW * params.top;
    var inset = (bottomW - topW) / 2;
    return {
      h: h,
      tl: [inset, 0], tr: [bottomW - inset, 0],
      br: [bottomW, h], bl: [0, h],
    };
  }

  // Horizontal glass extent at a given y fraction (0 = top, 1 = bottom),
  // as fractions of the bottom width.
  function edgesAt(params, yFrac) {
    var inset = (1 - params.top) / 2;
    var left = inset * (1 - yFrac);
    return { left: left, right: 1 - left };
  }

  // Chip coords are stored row-relative: x = fraction of the glass width at the
  // chip's own y, y = fraction of the glass height. This keeps markers inside
  // the glass when the shape preset or trapezoid tweaks change.
  function chipToBox(params, chip) {
    var e = edgesAt(params, chip.y);
    return { x: e.left + chip.x * (e.right - e.left), y: chip.y };
  }
  function boxToChip(params, bx, by) {
    var y = clamp(by, 0.03, 0.97);
    var e = edgesAt(params, y);
    var x = (bx - e.left) / (e.right - e.left);
    return { x: clamp(x, 0.02, 0.98), y: y };
  }

  // SVG path for the rounded trapezoid, corners as quadratic curves.
  function outlinePath(params, bottomW) {
    var c = corners(params, bottomW);
    var r = Math.min(params.round * c.h, bottomW * params.top * 0.4);
    function along(from, to, dist) {
      var dx = to[0] - from[0], dy = to[1] - from[1];
      var len = Math.sqrt(dx * dx + dy * dy) || 1;
      return [from[0] + (dx / len) * dist, from[1] + (dy / len) * dist];
    }
    var pts = [c.tl, c.tr, c.br, c.bl];
    var d = "";
    for (var i = 0; i < 4; i++) {
      var prev = pts[(i + 3) % 4], cur = pts[i], next = pts[(i + 1) % 4];
      var a = along(cur, prev, r), b = along(cur, next, r);
      d += (i === 0 ? "M" : "L") + a[0].toFixed(1) + "," + a[1].toFixed(1);
      d += "Q" + cur[0].toFixed(1) + "," + cur[1].toFixed(1) + " " + b[0].toFixed(1) + "," + b[1].toFixed(1);
    }
    return d + "Z";
  }

  // Driver field-of-view band (fraction of bottom width), around the wheel.
  function fovBand(wheel) {
    return wheel === "right" ? { from: 0.58, to: 0.92 } : { from: 0.08, to: 0.42 };
  }
  function wheelX(wheel) { return wheel === "right" ? 0.75 : 0.25; }

  // Suggest the FOV flag from a chip position (band check on the box x).
  function suggestFov(params, chip, wheel) {
    var b = fovBand(wheel);
    var bx = chipToBox(params, chip).x;
    return bx >= b.from && bx <= b.to;
  }

  return {
    PRESETS: PRESETS, PRESET_ORDER: PRESET_ORDER, LIMITS: LIMITS,
    paramsFor: paramsFor, corners: corners, edgesAt: edgesAt,
    chipToBox: chipToBox, boxToChip: boxToChip, outlinePath: outlinePath,
    fovBand: fovBand, wheelX: wheelX, suggestFov: suggestFov, clamp: clamp,
  };
});
