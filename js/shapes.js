/* shieldchipiii — windshield shape presets + geometry.
 * UMD-ish: attaches to window.SC in the browser, exports via module.exports in Node (CLI). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.shapes = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Shape ratios are of the bounding box; the drawing is the (foreshortened)
  // view from inside, so it is NOT to scale — real sizes come from widthCm.
  //
  // Why the bottom edge is the narrow one: seen from the driver's seat the
  // glass leans away, so its BOTTOM edge (at the end of the bonnet) is the far
  // one (~80 cm) and its TOP edge (at the roof line, nearly overhead) is the
  // near one (~55 cm). Perspective therefore widens the top by roughly 1.4,
  // while the body only tapers it by ~0.9 — net, the top reads slightly wider.
  // The flatter the screen, the stronger this is (sport > van). In practice a
  // windshield looks close to rectangular from inside, not strongly trapezoid.
  //   top    = top edge width / bounding-box width
  //   bottom = bottom edge width / bounding-box width (the narrow one here)
  //   aspect = glass height / bounding-box width      (drawn, foreshortened)
  //   round  = corner radius / glass height
  //   bow    = vertical arch of top/bottom edges / glass height (0 = straight;
  //            glass is tallest at the centreline, like a real windshield)
  //   widthCm/heightCm = real pane size, measured along the glass. These give
  //            the drawing a scale so the 10 cm edge margin and the 29 cm field
  //            of view are real distances, not fractions of the picture.
  //            Vertical cm differ from horizontal cm because of the foreshortening.
  //   wheelCm = steering wheel diameter. Typical: 38-40 comfort (saloon/estate/
  //            SUV), 36-37 compact/sporty, 32-35 aftermarket sports wheels.
  var PRESETS = {
    compact: { top: 1.00, bottom: 0.90, aspect: 0.40, round: 0.10, bow: 0.06, widthCm: 130, heightCm: 76,  wheelCm: 37 },
    sedan:   { top: 1.00, bottom: 0.88, aspect: 0.36, round: 0.12, bow: 0.07, widthCm: 142, heightCm: 85,  wheelCm: 38 },
    suv:     { top: 1.00, bottom: 0.92, aspect: 0.44, round: 0.10, bow: 0.05, widthCm: 150, heightCm: 92,  wheelCm: 39 },
    // Van: screen is steep, so perspective barely widens the top and the body
    // taper wins — the only preset that stays (just) wider at the bottom.
    van:     { top: 0.98, bottom: 1.00, aspect: 0.55, round: 0.06, bow: 0.03, widthCm: 158, heightCm: 104, wheelCm: 40 },
    // Sport: flattest screen -> the top edge is nearest -> widest at the top.
    sport:   { top: 1.00, bottom: 0.82, aspect: 0.28, round: 0.16, bow: 0.09, widthCm: 138, heightCm: 72,  wheelCm: 34 },
  };
  var PRESET_ORDER = ["compact", "sedan", "suv", "van", "sport"];

  // Glass-shop criteria (Carglass): a chip is only repairable when it sits
  // clear of the edge and outside the FOV_CM wide band over the wheel. Both are
  // real centimetres — hence widthCm/heightCm above. The edge margin is not a
  // constant here: it differs per country (sources.js) and is passed in.
  var FOV_CM = 29; // DIN A4 long edge

  var LIMITS = {
    top:    { min: 0.35, max: 1.00 },
    bottom: { min: 0.50, max: 1.00 },
    aspect: { min: 0.20, max: 0.65 },
    round:  { min: 0.00, max: 0.25 },
    bow:    { min: 0.00, max: 0.15 },
    widthCm: { min: 100, max: 200 },
    wheelCm: { min: 32, max: 42 },
  };

  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  // Effective shape params for a car: preset overridden by per-car adjustments.
  // `adjust` can arrive from a share link, so a value that isn't a real number
  // falls back to the preset instead of turning the whole pane into NaN — which
  // renders as an empty SVG with nothing to say why.
  function paramsFor(car) {
    var base = PRESETS[car && car.shape] || PRESETS.sedan;
    var adj = (car && car.adjust) || {};
    function num(v, fallback) { return typeof v === "number" && isFinite(v) ? v : fallback; }
    function pick(key, dflt) {
      return clamp(num(adj[key], num(base[key], dflt)), LIMITS[key].min, LIMITS[key].max);
    }
    var widthCm = pick("widthCm", 142);
    return {
      top: pick("top", 1),
      bottom: pick("bottom", 1),
      aspect: pick("aspect", 0.36),
      round: pick("round", 0.12),
      bow: pick("bow", 0),
      widthCm: widthCm,
      // Real height keeps the preset's real proportions when width is adjusted.
      heightCm: num(base.heightCm, 85) * (widthCm / num(base.widthCm, 142)),
      // Wheel diameter is absolute — it does not scale with the pane.
      wheelCm: pick("wheelCm", 38),
    };
  }

  // Corner points for a given bottom width, origin at top-left of the glass
  // bounding box. With bow > 0 the corners sit inside the box: the top edge
  // arches up to y = 0 at the centre, the bottom edge down to y = h.
  // Returns { h, bow (absolute), tl, tr, br, bl } (each [x, y]).
  function corners(params, boxW) {
    var h = boxW * params.aspect;
    var topInset = boxW * (1 - params.top) / 2;
    var botInset = boxW * (1 - (params.bottom != null ? params.bottom : 1)) / 2;
    var b = h * (params.bow || 0);
    return {
      h: h, bow: b,
      tl: [topInset, b], tr: [boxW - topInset, b],
      br: [boxW - botInset, h - b], bl: [botInset, h - b],
    };
  }

  // Horizontal glass extent at a given y fraction (0 = top, 1 = bottom), as
  // fractions of the bottom width. Above/below the corner line the boundary
  // is the edge arch (a parabola — exactly what a quadratic Bezier traces).
  function edgesAt(params, yFrac) {
    var bow = params.bow || 0;
    var bottom = params.bottom != null ? params.bottom : 1;
    if (bow > 0.001 && yFrac < bow) {
      var half = (params.top / 2) * Math.sqrt(Math.max(0, yFrac) / bow);
      return { left: 0.5 - half, right: 0.5 + half };
    }
    if (bow > 0.001 && yFrac > 1 - bow) {
      var halfB = (bottom / 2) * Math.sqrt(Math.max(0, 1 - yFrac) / bow);
      return { left: 0.5 - halfB, right: 0.5 + halfB };
    }
    var topInset = (1 - params.top) / 2;
    var botInset = (1 - bottom) / 2;
    var t = bow > 0.001 ? (yFrac - bow) / (1 - 2 * bow) : yFrac;
    var left = topInset * (1 - t) + botInset * t;
    return { left: left, right: 1 - left };
  }

  // The glass outline sampled as [x, y] pairs in bounding-box fractions
  // (x of width, y of height), walking clockwise tl -> tr -> br -> bl.
  // Corner rounding is ignored: it only pulls the outline further inward, and
  // anything that close to a corner is deep inside the edge margin anyway.
  function outlineSamples(params, perEdge) {
    var n = perEdge || 24;
    var bow = params.bow || 0;
    var topInset = (1 - params.top) / 2;
    var botInset = (1 - (params.bottom != null ? params.bottom : 1)) / 2;
    var tl = [topInset, bow], tr = [1 - topInset, bow];
    var br = [1 - botInset, 1 - bow], bl = [botInset, 1 - bow];
    var pts = [];
    function quad(P0, P1, P2) {
      for (var i = 0; i < n; i++) {
        var t = i / n, m = 1 - t;
        pts.push([m * m * P0[0] + 2 * m * t * P1[0] + t * t * P2[0],
                  m * m * P0[1] + 2 * m * t * P1[1] + t * t * P2[1]]);
      }
    }
    function line(P0, P2) {
      for (var i = 0; i < n; i++) {
        var t = i / n;
        pts.push([P0[0] + (P2[0] - P0[0]) * t, P0[1] + (P2[1] - P0[1]) * t]);
      }
    }
    quad(tl, [0.5, -bow], tr);      // top edge arches up to y = 0
    line(tr, br);
    quad(br, [0.5, 1 + bow], bl);   // bottom edge dips down to y = 1
    line(bl, tl);
    return pts;
  }

  // Shortest distance from a chip to the glass edge, in real centimetres.
  // Distances are measured in cm space (x * widthCm, y * heightCm) so the
  // drawing's foreshortening doesn't distort them.
  function edgeDistanceCm(params, chip) {
    var box = chipToBox(params, chip);
    var W = params.widthCm, H = params.heightCm;
    var pts = outlineSamples(params, 24);
    var min = Infinity;
    for (var i = 0; i < pts.length; i++) {
      var dx = (box.x - pts[i][0]) * W;
      var dy = (box.y - pts[i][1]) * H;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < min) min = d;
    }
    return min;
  }

  // Chips closer than marginCm to the edge can't be repaired — the glass has
  // to be replaced (stress concentrates at the rim). marginCm comes from the
  // car's country, so it is required: defaulting it here would silently judge
  // a Spanish chip (2.5 cm) by the German rule (10 cm).
  function inMargin(params, chip, marginCm) { return edgeDistanceCm(params, chip) < marginCm; }

  // The margin band as an inward offset of the outline, in bounding-box
  // fractions: each sample steps marginCm along its inward normal, computed in
  // cm space so the band is that many cm everywhere on the real pane (which
  // means it looks thinner top/bottom in the foreshortened drawing — correct).
  function marginInset(params, marginCm) {
    var pts = outlineSamples(params, 24);
    var W = params.widthCm, H = params.heightCm;
    var n = pts.length;
    return pts.map(function (p, i) {
      var prev = pts[(i - 1 + n) % n], next = pts[(i + 1) % n];
      var tx = (next[0] - prev[0]) * W, ty = (next[1] - prev[1]) * H;
      var len = Math.sqrt(tx * tx + ty * ty) || 1;
      // clockwise outline -> inward normal is the tangent rotated (x,y)->(-y,x)
      var nx = -ty / len, ny = tx / len;
      return [p[0] + (nx * marginCm) / W, p[1] + (ny * marginCm) / H];
    });
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

  // Driver's field of view: the FOV_CM wide band centred on the wheel — the
  // criterion glass shops use, so it scales with the pane's real width.
  function fovBand(params, wheel) {
    var half = (FOV_CM / 2) / params.widthCm;
    var cx = wheelX(wheel);
    return { from: cx - half, to: cx + half };
  }
  function wheelX(wheel) { return wheel === "right" ? 0.75 : 0.25; }

  // Is the chip inside the driver's field of view? This follows from where it
  // sits relative to the wheel, so it is derived, never a user-set flag — a
  // chip far from the wheel can't be "in the view" no matter what a box says.
  function inFov(params, chip, wheel) {
    var b = fovBand(params, wheel);
    var bx = chipToBox(params, chip).x;
    return bx >= b.from && bx <= b.to;
  }

  return {
    PRESETS: PRESETS, PRESET_ORDER: PRESET_ORDER, LIMITS: LIMITS,
    FOV_CM: FOV_CM,
    paramsFor: paramsFor, corners: corners, edgesAt: edgesAt,
    outlineSamples: outlineSamples, edgeDistanceCm: edgeDistanceCm,
    inMargin: inMargin, marginInset: marginInset,
    chipToBox: chipToBox, boxToChip: boxToChip, outlinePath: outlinePath,
    fovBand: fovBand, wheelX: wheelX, inFov: inFov, clamp: clamp,
  };
});
