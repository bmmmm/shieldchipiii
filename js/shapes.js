/* shieldchipiii — windshield shape presets + geometry.
 * UMD-ish: attaches to window.SC in the browser, exports via module.exports in Node (CLI). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.shapes = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // All values are ratios relative to the bottom edge width (bow: to glass height):
  //   top    = top edge width / bottom edge width  (< 1: view from inside, top is shorter)
  //   aspect = glass height / bottom edge width
  //   round  = corner radius / glass height
  //   bow    = vertical arch of top/bottom edges / glass height (0 = straight;
  //            glass is tallest at the centreline, like a real windshield)
  var PRESETS = {
    compact: { top: 0.68, aspect: 0.40, round: 0.10, bow: 0.06 },
    sedan:   { top: 0.62, aspect: 0.36, round: 0.12, bow: 0.07 },
    suv:     { top: 0.74, aspect: 0.44, round: 0.10, bow: 0.05 },
    van:     { top: 0.85, aspect: 0.55, round: 0.06, bow: 0.03 },
    sport:   { top: 0.55, aspect: 0.28, round: 0.16, bow: 0.09 },
  };
  var PRESET_ORDER = ["compact", "sedan", "suv", "van", "sport"];

  var LIMITS = {
    top:    { min: 0.35, max: 0.98 },
    aspect: { min: 0.20, max: 0.65 },
    round:  { min: 0.00, max: 0.25 },
    bow:    { min: 0.00, max: 0.15 },
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
      bow:    clamp(adj.bow    != null ? adj.bow    : (base.bow || 0), LIMITS.bow.min, LIMITS.bow.max),
    };
  }

  // Corner points for a given bottom width, origin at top-left of the glass
  // bounding box. With bow > 0 the corners sit inside the box: the top edge
  // arches up to y = 0 at the centre, the bottom edge down to y = h.
  // Returns { h, bow (absolute), tl, tr, br, bl } (each [x, y]).
  function corners(params, bottomW) {
    var h = bottomW * params.aspect;
    var topW = bottomW * params.top;
    var inset = (bottomW - topW) / 2;
    var b = h * (params.bow || 0);
    return {
      h: h, bow: b,
      tl: [inset, b], tr: [bottomW - inset, b],
      br: [bottomW, h - b], bl: [0, h - b],
    };
  }

  // Horizontal glass extent at a given y fraction (0 = top, 1 = bottom), as
  // fractions of the bottom width. Above/below the corner line the boundary
  // is the edge arch (a parabola — exactly what a quadratic Bezier traces).
  function edgesAt(params, yFrac) {
    var bow = params.bow || 0;
    if (bow > 0.001 && yFrac < bow) {
      var half = (params.top / 2) * Math.sqrt(Math.max(0, yFrac) / bow);
      return { left: 0.5 - half, right: 0.5 + half };
    }
    if (bow > 0.001 && yFrac > 1 - bow) {
      var halfB = 0.5 * Math.sqrt(Math.max(0, 1 - yFrac) / bow);
      return { left: 0.5 - halfB, right: 0.5 + halfB };
    }
    var inset = (1 - params.top) / 2;
    var t = bow > 0.001 ? (yFrac - bow) / (1 - 2 * bow) : yFrac;
    var left = inset * (1 - t);
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

  // SVG path for the bowed, rounded trapezoid: top/bottom edges are quadratic
  // arches, sides are lines. Arched edges are trimmed by the corner radius via
  // de Casteljau, and each corner curve takes the intersection of the two edge
  // tangents as its control point — tangent-continuous, no kink where the
  // rounding meets the arch. With bow = 0 this degenerates to the plain
  // rounded trapezoid (arch control collinear, tangent intersection = corner).
  function outlinePath(params, bottomW) {
    var c = corners(params, bottomW);
    // Rounding must not eat the sides, which bow shortens by 2*bow.
    var r = Math.min(params.round * c.h, bottomW * params.top * 0.4, (c.h - 2 * c.bow) * 0.45);
    function sub(p, q) { return [p[0] - q[0], p[1] - q[1]]; }
    function add(p, q) { return [p[0] + q[0], p[1] + q[1]]; }
    function mul(p, s) { return [p[0] * s, p[1] * s]; }
    function vlen(p) { return Math.sqrt(p[0] * p[0] + p[1] * p[1]) || 1; }
    function fmt(p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }
    function isect(p, u, q, v) { // line p+s*u with line q+t*v; parallel -> q
      var det = u[0] * v[1] - u[1] * v[0];
      if (Math.abs(det) < 1e-9) return q;
      var s = ((q[0] - p[0]) * v[1] - (q[1] - p[1]) * v[0]) / det;
      return add(p, mul(u, s));
    }
    function bez(P0, P1, P2, t) {
      var m = 1 - t;
      return [m * m * P0[0] + 2 * m * t * P1[0] + t * t * P2[0],
              m * m * P0[1] + 2 * m * t * P1[1] + t * t * P2[1]];
    }
    function bezTan(P0, P1, P2, t) {
      return [(1 - t) * (P1[0] - P0[0]) + t * (P2[0] - P1[0]),
              (1 - t) * (P1[1] - P0[1]) + t * (P2[1] - P1[1])];
    }
    function blossom(P0, P1, P2, s, t) { // control point of the [s,t] sub-curve
      var w = (1 - s) * t + s * (1 - t);
      return [(1 - s) * (1 - t) * P0[0] + w * P1[0] + s * t * P2[0],
              (1 - s) * (1 - t) * P0[1] + w * P1[1] + s * t * P2[1]];
    }

    var pts = [c.tl, c.tr, c.br, c.bl];
    // Full-edge control point per edge (edge i: corner i -> corner i+1).
    var ctrls = [
      [bottomW / 2, -c.bow],       // top: arches up to y = 0 at the centre
      null,
      [bottomW / 2, c.h + c.bow],  // bottom: arches down to y = h
      null,
    ];
    // Per edge: trimmed start a / end b, tangents there, inner control point.
    var edges = ctrls.map(function (P1, i) {
      var P0 = pts[i], P2 = pts[(i + 1) % 4];
      if (!P1) {
        var dir = sub(P2, P0), L = vlen(dir), u = mul(dir, 1 / L), tr = Math.min(r, L * 0.4);
        return { a: add(P0, mul(u, tr)), b: sub(P2, mul(u, tr)), ta: u, tb: u, ctrl: null };
      }
      var t0 = Math.min(0.4, r / vlen(sub(P2, P0)));
      return {
        a: bez(P0, P1, P2, t0), b: bez(P0, P1, P2, 1 - t0),
        ta: bezTan(P0, P1, P2, t0), tb: bezTan(P0, P1, P2, 1 - t0),
        ctrl: blossom(P0, P1, P2, t0, 1 - t0),
      };
    });
    var d = "M" + fmt(edges[0].a);
    for (var i = 0; i < 4; i++) {
      var e = edges[i], n = edges[(i + 1) % 4];
      d += e.ctrl ? "Q" + fmt(e.ctrl) + " " + fmt(e.b) : "L" + fmt(e.b);
      d += "Q" + fmt(isect(e.b, e.tb, n.a, n.ta)) + " " + fmt(n.a);
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
