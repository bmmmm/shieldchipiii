/* shieldchipiii — SVG renderer: rounded trapezoid (view from inside, top edge
 * shorter), mirror top center, dashboard + steering wheel, chip markers. */
(function () {
  "use strict";
  var shapes = window.SC.shapes;
  var logic = window.SC.logic;

  // CSS marker class per current status.
  var STATUS_CLASS = {
    new: "m-new", observing: "m-observing", repair_planned: "m-planned",
    repaired: "m-repaired", irreparable: "m-irreparable", replaced: "m-replaced",
  };

  var M = 20;          // outer margin in viewBox units
  var BOTTOM_W = 960;  // glass bottom edge width in viewBox units
  var VB_W = BOTTOM_W + 2 * M;
  var DASH_H = 95;     // dashboard + wheel strip below the glass

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function glassHeight(car) {
    return BOTTOM_W * shapes.paramsFor(car).aspect;
  }

  function viewBox(car) {
    return "0 0 " + VB_W + " " + (glassHeight(car) + DASH_H + 2 * M);
  }

  function markerGlyph(chip) {
    var cls = STATUS_CLASS[logic.currentStatus(chip)] || "m-new";
    if (/^crack/.test(chip.size)) {
      var half = { crackS: 14, crackM: 22, crackL: 32 }[chip.size] || 22;
      var d = "M" + -half + ",5 l" + half * 0.45 + ",-11 l" + half * 0.4 + ",13 l" +
        half * 0.5 + ",-11 l" + half * 0.65 + ",7";
      return '<path class="crack ' + cls + '" d="' + d + '"/>';
    }
    var r = { c10: 9, c50: 11, e2: 13 }[chip.size] || 10;
    return '<circle class="chip ' + cls + '" r="' + r + '"/>';
  }

  function windshield(svg, car, selectedId) {
    var p = shapes.paramsFor(car);
    var h = glassHeight(car);
    var outline = shapes.outlinePath(p, BOTTOM_W);
    var parts = [];

    parts.push('<defs><clipPath id="glassClip"><path d="' + outline + '"/></clipPath></defs>');
    parts.push('<g transform="translate(' + M + "," + M + ')">');

    // glass
    parts.push('<path class="glass" d="' + outline + '"/>');

    // driver field-of-view band (dashed, clipped to the glass)
    var band = shapes.fovBand(car.wheel);
    parts.push('<g clip-path="url(#glassClip)">' +
      '<rect class="fov-band" x="' + band.from * BOTTOM_W + '" y="-5" width="' +
      (band.to - band.from) * BOTTOM_W + '" height="' + (h + 10) + '" rx="18"/></g>');

    // mirror, top center: stalk + body
    var mirrorW = Math.max(90, BOTTOM_W * p.top * 0.16);
    var stalk = Math.max(26, h * 0.12);
    parts.push('<line class="mirror-stalk" x1="' + BOTTOM_W / 2 + '" y1="2" x2="' + BOTTOM_W / 2 + '" y2="' + stalk + '"/>');
    parts.push('<rect class="mirror" x="' + (BOTTOM_W / 2 - mirrorW / 2) + '" y="' + stalk + '" width="' + mirrorW + '" height="30" rx="8"/>');

    // markers
    (car.chips || []).forEach(function (chip, i) {
      var box = shapes.chipToBox(p, chip);
      var x = box.x * BOTTOM_W, y = box.y * h;
      var sel = chip.id === selectedId ? " selected" : "";
      parts.push('<g class="marker' + sel + '" data-id="' + esc(chip.id) + '" transform="translate(' + x.toFixed(1) + "," + y.toFixed(1) + ')">' +
        (sel ? '<circle class="sel-ring" r="24"/>' : "") +
        '<circle class="hit" r="26"/>' +
        markerGlyph(chip) +
        '<text class="marker-label" x="18" y="-12">' + (i + 1) + "</text></g>");
    });

    // dashboard + steering wheel
    var dashY = h + 26;
    var wx = shapes.wheelX(car.wheel) * BOTTOM_W;
    parts.push('<line class="dash" x1="-8" y1="' + dashY + '" x2="' + (BOTTOM_W + 8) + '" y2="' + dashY + '"/>');
    parts.push('<line class="dash thin" x1="30" y1="' + (dashY + 10) + '" x2="' + (BOTTOM_W - 30) + '" y2="' + (dashY + 10) + '"/>');
    parts.push('<g class="wheel" transform="translate(' + wx + "," + (dashY + 42) + ')">' +
      '<circle r="30"/><line x1="-30" y1="0" x2="30" y2="0"/><line x1="0" y1="0" x2="0" y2="30"/></g>');

    parts.push("</g>");
    svg.setAttribute("viewBox", viewBox(car));
    svg.innerHTML = parts.join("");
  }

  // Client (mouse/touch) coords -> glass bounding-box fractions.
  function clientToBox(svg, car, clientX, clientY) {
    var rect = svg.getBoundingClientRect();
    var vb = svg.viewBox.baseVal;
    var scale = vb.width / rect.width;
    var px = (clientX - rect.left) * scale - M;
    var py = (clientY - rect.top) * (vb.height / rect.height) - M;
    return { x: px / BOTTOM_W, y: py / glassHeight(car) };
  }

  // Is a box point on the glass (with a little tolerance)?
  function onGlass(car, box) {
    if (box.y < -0.04 || box.y > 1.04) return false;
    var e = shapes.edgesAt(shapes.paramsFor(car), Math.min(1, Math.max(0, box.y)));
    return box.x >= e.left - 0.03 && box.x <= e.right + 0.03;
  }

  // Marker centre in pixels relative to the SVG element's top-left — used to
  // place the floating popup next to the marker.
  function markerElementPos(svg, car, chip) {
    var rect = svg.getBoundingClientRect();
    var vb = svg.viewBox.baseVal;
    var p = shapes.paramsFor(car);
    var box = shapes.chipToBox(p, chip);
    var vx = M + box.x * BOTTOM_W;
    var vy = M + box.y * glassHeight(car);
    return { x: (vx / vb.width) * rect.width, y: (vy / vb.height) * rect.height };
  }

  window.SC = window.SC || {};
  window.SC.render = {
    windshield: windshield, clientToBox: clientToBox, onGlass: onGlass,
    markerElementPos: markerElementPos, esc: esc,
  };
})();
