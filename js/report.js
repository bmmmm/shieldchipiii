/* shieldchipiii — workshop report: one printable sheet with the drawing, the
 * pane's facts, a damage table and each chip's history. A pure string builder
 * with no DOM, so the smoke test can hold it to the same numbers the UI
 * shows; the caller renders the SVG into the [data-report-svg] slot. */
(function () {
  "use strict";
  var shapes = window.SC.shapes;
  var logic = window.SC.logic;
  var sources = window.SC.sources;

  function t(key, vars) { return window.SC.i18n.t(key, vars); }
  function esc(s) { return window.SC.render.esc(s); }

  function sizeLabel(size, code) {
    if (size === "e2") return "< " + t(sources.coinKeyFor(code));
    return t(logic.SIZE_KEY[size] || size);
  }

  // The same facts the popup shows, derived the same way: nothing in the
  // report is computed a second time by different rules.
  function facts(p, chip, car, marginCm) {
    var distCm = shapes.edgeDistanceCm(p, chip);
    return {
      distCm: distCm,
      edge: distCm < marginCm,
      fov: shapes.inFov(p, chip, car.wheel),
    };
  }

  function timelineItems(chip) {
    return logic.timeline(chip).map(function (e) {
      var line = esc(e.date) + " — " + esc(t(logic.EVENT_KEY[e.type] || e.type));
      var extra = [];
      if (e.where) extra.push(esc(e.where));
      if (e.note) extra.push("„" + esc(e.note) + "“");
      if (extra.length) line += " · " + extra.join(" · ");
      return "<li>" + line + "</li>";
    }).join("");
  }

  // -> HTML string for the sheet. opts: { date: "YYYY-MM-DD", origin: url }
  function html(car, opts) {
    var lang = window.SC.i18n.get();
    var p = shapes.paramsFor(car);
    var code = sources.normalize(car.country);
    var marginCm = sources.marginCmFor(code);
    var vars = { cm: marginCm.toLocaleString(lang), coin: t(sources.coinKeyFor(code)) };
    var chips = car.chips || [];
    var out = [];

    out.push('<h1 id="reportTitleEl">' + esc(t("reportTitle")) + "</h1>");
    out.push('<p class="rp-meta">' + esc(car.name || "🚗") + " · " +
      Math.round(p.widthCm) + " × " + Math.round(p.heightCm) + " cm · " +
      esc(t("wheel")) + " " + esc(t(car.wheel === "right" ? "wheelRight" : "wheelLeft")) + " · " +
      esc(opts.date) + "</p>");

    out.push('<div class="rp-svg"><svg data-report-svg role="img" aria-label="windshield diagram"></svg></div>');

    var STATUS_CLASS = window.SC.render.STATUS_CLASS;
    out.push('<p class="rp-legend">' + logic.STATUS_TYPES.map(function (st) {
      return '<span class="lg ' + STATUS_CLASS[st] + '">●</span> ' + esc(t(logic.STATUS_KEY[st]));
    }).join(" · ") + "</p>");
    out.push('<p class="rp-legend"><strong>' + esc(t("legendNoRepair")) + "</strong> " +
      '<span class="lg fov">▒</span> ' + esc(t("legendMargin", vars)) + " · " +
      '<span class="lg fov">▒</span> ' + esc(t("legendFov")) + "</p>");

    var src = sources.criteriaFor(code);
    out.push('<p class="rp-criteria">' +
      esc(t("reportCriteria", { country: sources.nameFor(code, lang), cm: vars.cm })) +
      ' <a href="' + esc(src.url) + '" rel="noopener">' + esc(src.url) + "</a></p>");

    var load = logic.chipLoad(car, sources.maxChipsFor(code));
    if (load) {
      var lv = { cm: vars.cm, coin: vars.coin, count: load.count, max: load.max };
      out.push('<p class="rec rec-' + load.level + '">' + esc(t(load.key, lv)) + "</p>");
    }

    if (!chips.length) {
      out.push('<p class="rp-meta">' + esc(t("noChips")) + "</p>");
    } else {
      var head = ["thNum", "size", "thStatus", "evNew", "fov", "edgeDistance"].map(function (key) {
        return "<th>" + esc(t(key)) + "</th>";
      }).join("");
      var rows = chips.map(function (k, i) {
        var f = facts(p, k, car, marginCm);
        return "<tr><td>" + (i + 1) + "</td>" +
          "<td>" + esc(sizeLabel(k.size, code)) + "</td>" +
          "<td>" + esc(t(logic.STATUS_KEY[logic.currentStatus(k)])) + "</td>" +
          "<td>" + esc(logic.foundDate(k)) + "</td>" +
          "<td>" + esc(t(f.fov ? "yes" : "no")) + "</td>" +
          "<td>~" + Math.round(f.distCm) + " cm</td></tr>";
      }).join("");
      out.push("<table><thead><tr>" + head + "</tr></thead><tbody>" + rows + "</tbody></table>");

      out.push(chips.map(function (k, i) {
        var f = facts(p, k, car, marginCm);
        var rec = logic.recommend(k, { inMargin: f.edge, inFov: f.fov });
        return '<div class="rp-chip"><h3>#' + (i + 1) + " · " + esc(t(logic.STATUS_KEY[logic.currentStatus(k)])) + "</h3>" +
          '<p class="rec rec-' + rec.level + '">' + esc(t("recommendation")) + ": " + esc(t(rec.key, vars)) + "</p>" +
          '<ul class="rp-tl">' + timelineItems(k) + "</ul></div>";
      }).join(""));
    }

    out.push('<p class="rp-disclaimer">' + esc(t("reportDisclaimer")) + "<br>" +
      esc(t("reportMadeWith")) + " " + esc(opts.origin || "") + "</p>");

    return out.join("");
  }

  window.SC = window.SC || {};
  window.SC.report = { html: html };
})();
