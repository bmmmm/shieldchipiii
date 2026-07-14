/* shieldchipiii — ASCII renderer for the windshield, shared by browser ("copy as
 * ASCII") and the terminal CLI. UMD-ish like shapes.js. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory(require("./shapes.js"), require("./logic.js"));
  } else {
    root.SC = root.SC || {};
    root.SC.ascii = factory(root.SC.shapes, root.SC.logic);
  }
})(typeof self !== "undefined" ? self : this, function (shapes, logic) {
  "use strict";

  // Marker char reflects the current status (o=new ?=observing @=planned
  // *=repaired X=irreparable ==replaced).
  function markerChar(chip) {
    return logic.STATUS_SYMBOL[logic.currentStatus(chip)] || "o";
  }

  function renderAscii(car, opts) {
    opts = opts || {};
    var width = opts.width || 58;
    var p = shapes.paramsFor(car);
    // ~0.5 char cell aspect compensation so the trapezoid looks proportional.
    var rows = Math.max(6, Math.round(width * p.aspect * 0.5));
    var inset = Math.round(((1 - p.top) / 2) * width);
    var grid = [];
    var r, cLine;

    function edgeCols(row) {
      // row 0 = top border, row rows = bottom border
      var f = row / rows;
      var l = Math.round(inset * (1 - f));
      return { l: l, r: width - 1 - l };
    }

    // top border: spaces, then '_' with the mirror [=] centered
    var top = edgeCols(0);
    cLine = new Array(width).fill(" ");
    for (r = top.l + 1; r < top.r; r++) cLine[r] = "_";
    var mid = Math.floor(width / 2);
    cLine[mid - 1] = "["; cLine[mid] = "="; cLine[mid + 1] = "]";
    grid.push(cLine);

    // glass rows with slanted edges
    for (r = 1; r < rows; r++) {
      var e = edgeCols(r);
      cLine = new Array(width).fill(" ");
      cLine[e.l] = inset > 0 ? "/" : "|";
      cLine[e.r] = inset > 0 ? "\\" : "|";
      if (r === 1) { cLine[mid] = "|"; } // mirror stalk
      grid.push(cLine);
    }

    // bottom border
    var bot = edgeCols(rows);
    cLine = new Array(width).fill(" ");
    cLine[bot.l] = inset > 0 ? "/" : "|";
    cLine[bot.r] = inset > 0 ? "\\" : "|";
    for (r = bot.l + 1; r < bot.r; r++) cLine[r] = "_";
    grid.push(cLine);

    // markers (chips get their 1-based index as label)
    (car.chips || []).forEach(function (chip, i) {
      var row = 1 + Math.round(chip.y * (rows - 1));
      var e = edgeCols(row);
      var col = Math.round((e.l + 1) + chip.x * (e.r - e.l - 2));
      col = Math.max(e.l + 1, Math.min(e.r - 1, col));
      grid[row][col] = markerChar(chip);
      var label = String(i + 1);
      if (col + label.length < e.r) {
        for (var k = 0; k < label.length; k++) grid[row][col + 1 + k] = label[k];
      }
    });

    // dashboard + steering wheel on the driver side
    var dash = new Array(width).fill(" ");
    for (r = 1; r < width - 1; r++) dash[r] = "~";
    var wx = Math.round(shapes.wheelX(car.wheel) * width);
    dash[wx - 1] = "("; dash[wx] = "O"; dash[wx + 1] = ")";
    grid.push(dash);

    return grid.map(function (row) { return row.join("").replace(/\s+$/, ""); }).join("\n");
  }

  return { renderAscii: renderAscii, markerChar: markerChar };
});
