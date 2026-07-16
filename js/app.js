/* shieldchipiii — UI wiring: windshield, floating marker popup, event timeline. */
(function () {
  "use strict";
  var store = window.SC.store, shapes = window.SC.shapes, render = window.SC.render;
  var share = window.SC.share, i18n = window.SC.i18n, ascii = window.SC.ascii, logic = window.SC.logic;
  var sources = window.SC.sources, qr = window.SC.qr;
  var t = i18n.t;

  // A count with its noun, pluralized by picking a form from a "one|many"
  // dictionary value — German plurals are irregular, so t() can't derive them.
  function plur(key, n) {
    var forms = t(key).split("|");
    return (n === 1 ? forms[0] : forms[forms.length - 1]).replace("{n}", n);
  }

  var state = store.load();
  var selectedId = null;
  var drag = null;            // { id, moved }
  var suppressClick = false;  // swallow the click that trails a marker pointerup

  var $ = function (id) { return document.getElementById(id); };
  var svg = $("windshield");
  var popup = $("markerPopup");

  var SHAPE_KEY = { compact: "shapeCompact", sedan: "shapeSedan", suv: "shapeSuv", van: "shapeVan", sport: "shapeSport" };
  var SIZE_KEY = logic.SIZE_KEY;

  // The repair threshold is named after a coin, and not every market measures
  // with the 2-euro one — Switzerland says CHF 2, Denmark a 2-krone. Same
  // stored size, different gauge on the label.
  function sizeLabel(size) {
    if (size === "e2") return "< " + t(sources.coinKeyFor(car().country));
    return t(SIZE_KEY[size] || size);
  }
  var STATUS_KEY = logic.STATUS_KEY, EVENT_KEY = logic.EVENT_KEY;
  // What the user can add from the timeline (all but the implicit initial "new").
  // "replaced" is a vehicle-level action (glassSwap), not a per-chip event.
  var ADDABLE = ["observing", "repair_planned", "repaired", "irreparable", "insurance_reported", "note"];
  var WHERE_TYPES = { repaired: 1, repair_planned: 1 };

  function car() { return store.activeCar(state); }
  function chipById(id) { return car().chips.find(function (k) { return k.id === id; }); }
  function persist() { store.save(state); scheduleShare(); }
  function touchCar() { car().up = store.now(); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function esc(s) { return render.esc(s); }

  // ---------- static + structural rendering ----------

  // The numbers the active car's country brings with it. Passed to every text
  // lookup: t() only substitutes what a string actually names, so a text can
  // start or stop citing the margin without its callers knowing.
  function countryVars() {
    var code = car().country;
    return {
      cm: sources.marginCmFor(code).toLocaleString(i18n.get()),
      coin: t(sources.coinKeyFor(code)),
    };
  }

  function applyStaticI18n() {
    document.documentElement.lang = i18n.get();
    var vars = countryVars();
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.dataset.i18n, vars); });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) { el.placeholder = t(el.dataset.i18nPh); });
    $("langToggle").textContent = i18n.get() === "de" ? "EN" : "DE";
  }

  function renderLegend() {
    var statuses = [
      ['<span class="lg m-new">●</span>', "statusNew"],
      ['<span class="lg m-observing">●</span>', "statusObserving"],
      ['<span class="lg m-planned">●</span>', "statusRepairPlanned"],
      ['<span class="lg m-repaired">●</span>', "statusRepaired"],
      ['<span class="lg m-irreparable">●</span>', "statusIrreparable"],
    ];
    // The two red zones mean the same thing, so they get one grouped line.
    var zones = [
      ['<span class="lg edge">▒</span>', "legendMargin"],
      ['<span class="lg fov">▒</span>', "legendFov"],
    ];
    var vars = countryVars();
    var fmt = function (it) { return it[0] + " " + esc(t(it[1], vars)); };
    $("legend").innerHTML = statuses.map(fmt).join(" · ") +
      '<span class="legend-zones"><strong>' + esc(t("legendNoRepair")) + "</strong> " + zones.map(fmt).join(" · ") + "</span>";
    renderCountry();
  }

  function renderCarTabs() {
    var html = state.cars.map(function (c) {
      return '<button class="tab' + (c.id === car().id ? " active" : "") + '" data-car="' + esc(c.id) + '">' + esc(c.name || "🚗") + "</button>";
    }).join("");
    html += '<button class="tab add" id="addCar">' + esc(t("addCar")) + "</button>";
    $("carTabs").innerHTML = html;
  }

  // Split out of renderCarForm: tweaking a slider drops the preset, and the
  // buttons have to say so without the sliders being rewritten underneath the
  // finger that's still dragging one.
  function renderShapeButtons() {
    var c = car();
    $("shapeButtons").innerHTML = shapes.PRESET_ORDER.map(function (key) {
      return '<button class="shape-btn' + (c.shape === key && !c.adjust ? " active" : "") + '" data-shape="' + key + '">' + esc(t(SHAPE_KEY[key])) + "</button>";
    }).join("");
  }

  // Country options, named in the UI's language and sorted by that name.
  // Rebuilt on language switch, hence not baked into index.html. Driven from
  // renderLegend: the picker sits with the zones it governs, and a number in
  // that legend is meaningless without the country it belongs to.
  function renderCountry() {
    var c = car();
    var lang = i18n.get();
    var active = sources.normalize(c.country);
    $("country").innerHTML = sources.codesByName(lang).map(function (code) {
      return '<option value="' + code + '"' + (code === active ? " selected" : "") + ">" +
        esc(sources.nameFor(code, lang)) + "</option>";
    }).join("");
  }

  function renderCarForm() {
    var c = car();
    $("carName").value = c.name;
    var p = shapes.paramsFor(c);
    renderShapeButtons();
    $("adjTop").value = Math.round(p.top * 100);
    $("adjBottom").value = Math.round(p.bottom * 100);
    $("adjRound").value = Math.round(p.round * 100);
    $("adjBow").value = Math.round(p.bow * 100);
    $("adjWidthCm").value = Math.round(p.widthCm);
    $("adjWidthCmOut").textContent = Math.round(p.widthCm) + " cm";
    $("adjHeightCm").value = Math.round(p.heightCm);
    $("adjHeightCmOut").textContent = Math.round(p.heightCm) + " cm";
    $("adjWheelCm").value = Math.round(p.wheelCm);
    $("adjWheelCmOut").textContent = Math.round(p.wheelCm) + " cm";
    $("wheelLeft").classList.toggle("active", c.wheel !== "right");
    $("wheelRight").classList.toggle("active", c.wheel === "right");
  }

  // The chip count is a statement about the pane, not about any one marker, so
  // it sits above the table rather than in a popup. Shown only once the count
  // can change the outcome; adding more is never blocked — the app records what
  // is on the glass, it doesn't ration it.
  function renderChipLoad() {
    var load = logic.chipLoad(car(), sources.maxChipsFor(car().country));
    if (!load) { $("chipLoad").innerHTML = ""; return; }
    var vars = countryVars();
    vars.count = load.count;
    vars.max = load.max;
    $("chipLoad").innerHTML = '<div class="rec rec-' + load.level + '">' +
      esc(t(load.key, vars)) + recSourceLink(load) + "</div>";
  }

  // Driven from here rather than from rerenderAll: every path that changes a
  // chip already rebuilds the table, and a count rendered anywhere else would
  // be the one place that forgets to update.
  function renderChipTable() {
    renderChipLoad();
    var chips = car().chips;
    if (!chips.length) {
      $("chipTable").innerHTML = '<p class="muted">' + esc(t("noChips")) + "</p>";
      return;
    }
    var p = shapes.paramsFor(car());
    var marginCm = sources.marginCmFor(car().country);
    var vars = countryVars();
    var rows = chips.map(function (k, i) {
      var status = logic.currentStatus(k);
      var edge = shapes.inMargin(p, k, marginCm);
      var fov = shapes.inFov(p, k, car().wheel);
      var rec = logic.recommend(k, { inMargin: edge, inFov: fov });
      var found = logic.foundDate(k);
      var badges = (fov ? "⌖ " : "") + (edge ? "▣ " : "") + (logic.insuranceReported(k) ? "🛡" : "");
      return '<tr class="' + (k.id === selectedId ? "selected " : "") + "st-" + status + '" data-id="' + esc(k.id) + '" tabindex="0" role="button">' +
        "<td>" + (i + 1) + "</td>" +
        '<td class="sym">' + ascii.markerChar(k) + "</td>" +
        "<td>" + esc(sizeLabel(k.size)) + "</td>" +
        "<td>" + esc(t(STATUS_KEY[status])) + "</td>" +
        "<td>" + esc(found) + "</td>" +
        // The dot is colour and the badges are bare glyphs; the advice itself
        // sits in title, which a screen reader skips — so it repeats as text
        // only a screen reader sees.
        '<td class="rec-dot rec-' + rec.level + '" title="' + esc(t(rec.key, vars)) + '">' +
          '<span aria-hidden="true">' + badges + "</span>" +
          '<span class="sr-only">' + esc(t(rec.key, vars)) + "</span>" +
        "</td></tr>";
    }).join("");
    var head = "<thead><tr>" + ["thNum", "thSym", "size", "thStatus", "evNew", "recommendation"].map(function (key) {
      return "<th>" + esc(t(key)) + "</th>";
    }).join("") + "</tr></thead>";
    $("chipTable").innerHTML = "<table>" + head + "<tbody>" + rows + "</tbody></table>";
  }

  function renderWindshield() { render.windshield(svg, car(), selectedId); }

  function rerenderAll() {
    applyStaticI18n();
    renderLegend();
    renderCarTabs();
    renderCarForm();
    renderWindshield();
    renderChipTable();
    renderShare();
  }

  // ---------- marker popup ----------

  // Cite the criteria behind an advice — only the ones we took from a shop,
  // and always that country's own page: its numbers are the ones we judged by.
  function recSourceLink(rec) {
    if (!rec.sourced) return "";
    var code = sources.normalize(car().country);
    var url = sources.criteriaFor(code).url;
    var label = t("recSource", { country: sources.nameFor(code, i18n.get()) });
    return ' <a class="rec-src" href="' + esc(url) + '" target="_blank" rel="noopener noreferrer"' +
      ' title="' + esc(label) + '" aria-label="' + esc(label) + '">ⓘ</a>';
  }

  function buildPopup(chip) {
    var idx = car().chips.indexOf(chip) + 1;
    var status = logic.currentStatus(chip);
    var p = shapes.paramsFor(car());
    var distCm = shapes.edgeDistanceCm(p, chip);
    var edge = distCm < sources.marginCmFor(car().country);
    var fov = shapes.inFov(p, chip, car().wheel);
    var rec = logic.recommend(chip, { inMargin: edge, inFov: fov });
    var tl = logic.timeline(chip);

    var sizeOpts = logic.SIZES.map(function (s) {
      return '<option value="' + s + '"' + (chip.size === s ? " selected" : "") + ">" + esc(sizeLabel(s)) + "</option>";
    }).join("");

    var tlRows = tl.map(function (e) {
      var line = esc(e.date) + " — " + esc(t(EVENT_KEY[e.type] || e.type));
      var extra = [];
      if (e.where) extra.push(esc(e.where));
      if (e.note) extra.push("„" + esc(e.note) + "“");
      if (extra.length) line += " · " + extra.join(" · ");
      var del = tl.length > 1 ? '<button class="tl-del" data-act="delEvent" data-id="' + esc(e.id) + '" title="' + esc(t("deleteEvent")) + '">×</button>' : "";
      return '<li class="tl-' + esc(e.type) + '">' + line + del + "</li>";
    }).join("");

    var addOpts = ADDABLE.map(function (ty) {
      return '<option value="' + ty + '">' + esc(t(EVENT_KEY[ty])) + "</option>";
    }).join("");

    // The dialog announces itself the way the marker does: number and status.
    popup.setAttribute("aria-label", "#" + idx + " · " + t(STATUS_KEY[status]));
    popup.innerHTML =
      '<div class="popup-head">' +
        "<strong>#" + idx + " · " + esc(t(STATUS_KEY[status])) + "</strong>" +
        '<button class="ghost pop-x" data-act="close" title="' + esc(t("close")) + '">×</button>' +
      "</div>" +
      '<div class="rec rec-' + rec.level + '"><span class="rec-label">' + esc(t("recommendation")) + ":</span> " + esc(t(rec.key, countryVars())) + recSourceLink(rec) + "</div>" +
      '<div class="popup-fields">' +
        '<label class="pf">' + esc(t("size")) + ' <select data-act="size">' + sizeOpts + "</select></label>" +
        // Both zone facts are derived from the position — shown, not editable.
        '<span class="pf zone-fact' + (fov ? " is-hit" : "") + '">' + esc(t("fov")) + ": " + esc(t(fov ? "yes" : "no")) + "</span>" +
        '<span class="pf zone-fact' + (edge ? " is-hit" : "") + '">' + esc(t("edgeDistance")) + " ~" + Math.round(distCm) + " cm</span>" +
      "</div>" +
      '<div class="timeline"><div class="tl-head">' + esc(t("timeline")) + "</div><ul>" + tlRows + "</ul></div>" +
      '<form class="add-event" data-act="addEvent">' +
        '<label class="ae-field"><span>' + esc(t("eventType")) + '</span><select data-field="type">' + addOpts + "</select></label>" +
        '<label class="ae-field"><span>' + esc(t("eventDate")) + '</span><input type="date" data-field="date" value="' + today() + '"></label>' +
        '<input class="ae-where" data-field="where" placeholder="' + esc(t("eventWherePh")) + '" maxlength="60" hidden>' +
        '<input class="ae-note" data-field="note" placeholder="' + esc(t("eventNote")) + '" maxlength="200">' +
        '<button type="submit">' + esc(t("saveEvent")) + "</button>" +
      "</form>" +
      '<button class="ghost danger pop-del" data-act="delChip">' + esc(t("deleteChip")) + "</button>";
    updateWhereVisibility();
  }

  function updateWhereVisibility() {
    var sel = popup.querySelector('[data-field="type"]');
    var where = popup.querySelector(".ae-where");
    if (sel && where) where.hidden = !WHERE_TYPES[sel.value];
  }

  function positionPopup(chip) {
    var pos = render.markerElementPos(svg, car(), chip);
    var stage = $("glassStage");
    var pw = popup.offsetWidth, ph = popup.offsetHeight;
    var sw = stage.clientWidth, sh = stage.clientHeight;
    var left = pos.x + 22;
    if (left + pw > sw) left = pos.x - 22 - pw;
    left = Math.max(4, Math.min(sw - pw - 4, left));
    var top = Math.max(4, Math.min(sh - ph - 4, pos.y - ph / 2));
    popup.style.left = left + "px";
    popup.style.top = top + "px";
  }

  // Where focus goes back to on close. Kept as kind+id, not as an element:
  // the table and the glass are rebuilt via innerHTML while the popup is
  // open, so any element grabbed at open time is dead by close time.
  var popupOpener = null;

  function openPopup(id, from) {
    var chip = chipById(id);
    if (!chip) { closePopup(); return; }
    popupOpener = { kind: from === "row" ? "row" : "marker", id: id };
    selectedId = id;
    popup.hidden = false;
    buildPopup(chip);
    positionPopup(chip);
    renderWindshield();
    renderChipTable();
    popup.focus({ preventScroll: true });
  }

  function refreshPopup() {
    var chip = chipById(selectedId);
    if (!chip) { closePopup(); return; }
    buildPopup(chip);
    positionPopup(chip);
  }

  function closePopup() {
    // Only restore focus if it was actually inside the popup — closePopup
    // also runs on language toggles and shape edits, where stealing focus
    // from whatever the user is on would be the bug, not the fix.
    var hadFocus = popup.contains(document.activeElement);
    selectedId = null;
    popup.hidden = true;
    popup.innerHTML = "";
    renderWindshield();
    renderChipTable();
    if (hadFocus && popupOpener) {
      var el = document.querySelector(popupOpener.kind === "row"
        ? '#chipTable tr[data-id="' + popupOpener.id + '"]'
        : '.marker[data-id="' + popupOpener.id + '"]');
      if (el) el.focus({ preventScroll: true });
    }
    popupOpener = null;
  }

  // ---------- popup interactions (delegated) ----------

  popup.addEventListener("click", function (e) {
    var act = e.target.closest("[data-act]");
    if (!act) return;
    var kind = act.dataset.act;
    if (kind === "close") { closePopup(); return; }
    if (kind === "delChip") {
      var delId = selectedId; // captured: the popup may close before the dialog resolves
      confirmDialog(t("confirmDeleteChip"), t("deleteChip"), function () {
        var c = car();
        c.gone = c.gone || {};
        c.gone[delId] = store.now(); // tombstone so a later merge can't resurrect it
        c.chips = c.chips.filter(function (k) { return k.id !== delId; });
        touchCar();
        persist();
        closePopup();
        renderWindshield();
        renderChipTable();
      });
      return;
    }
    if (kind === "delEvent") {
      var chip = chipById(selectedId);
      chip.gone = chip.gone || {};
      chip.gone[act.dataset.id] = store.now(); // tombstone: a merge must not bring it back
      chip.events = chip.events.filter(function (ev) { return ev.id !== act.dataset.id; });
      chip.up = store.now();
      persist();
      refreshPopup();
      renderWindshield();
      renderChipTable();
    }
  });

  popup.addEventListener("change", function (e) {
    var el = e.target.closest("[data-act], [data-field]");
    if (!el) return;
    var chip = chipById(selectedId);
    if (!chip) return;
    if (el.dataset.act === "size") { chip.size = el.value; chip.up = store.now(); persist(); refreshPopup(); renderWindshield(); renderChipTable(); }
    else if (el.dataset.field === "type") { updateWhereVisibility(); }
  });

  popup.addEventListener("submit", function (e) {
    if (!e.target.closest('[data-act="addEvent"]')) return;
    e.preventDefault();
    var chip = chipById(selectedId);
    if (!chip) return;
    var form = e.target;
    var type = form.querySelector('[data-field="type"]').value;
    var date = form.querySelector('[data-field="date"]').value || today();
    var note = form.querySelector('[data-field="note"]').value.trim();
    var where = form.querySelector('[data-field="where"]').value.trim();
    var extra = {};
    if (note) extra.note = note;
    if (where && WHERE_TYPES[type]) extra.where = where;
    chip.events.push(logic.makeEvent(type, date, extra));
    chip.up = store.now();
    persist();
    refreshPopup();
    renderWindshield();
    renderChipTable();
    // Marking a repair gets its little moment: the brand micro-animation plays
    // over the marker and hands off to the '@' the rerender just drew.
    if (type === "repair_planned") {
      var pos = render.markerElementPos(svg, car(), chip);
      window.SC.anim.repairFx($("glassStage"), pos.x, pos.y);
    }
  });

  // ---------- top controls ----------

  $("langToggle").addEventListener("click", function () { i18n.set(i18n.get() === "de" ? "en" : "de"); closePopup(); rerenderAll(); });

  $("carTabs").addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    if (btn.id === "addCar") {
      var c = store.newCar("", car().country);
      state.cars.push(c);
      state.activeCar = c.id;
    } else {
      state.activeCar = btn.dataset.car;
    }
    closePopup();
    persist();
    rerenderAll();
    if (btn.id === "addCar") $("carName").focus();
  });

  $("carName").addEventListener("input", function () { car().name = this.value; touchCar(); persist(); renderCarTabs(); });

  $("shapeButtons").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-shape]");
    if (!btn) return;
    car().shape = btn.dataset.shape;
    car().adjust = null;
    touchCar();
    persist();
    closePopup();
    rerenderAll();
  });

  function onAdjust() {
    car().adjust = {
      top: $("adjTop").value / 100, bottom: $("adjBottom").value / 100,
      round: $("adjRound").value / 100, bow: $("adjBow").value / 100,
      widthCm: +$("adjWidthCm").value, heightCm: +$("adjHeightCm").value,
      wheelCm: +$("adjWheelCm").value,
    };
    touchCar();
    persist();
    $("adjWidthCmOut").textContent = $("adjWidthCm").value + " cm";
    $("adjHeightCmOut").textContent = $("adjHeightCm").value + " cm";
    $("adjWheelCmOut").textContent = $("adjWheelCm").value + " cm";
    renderShapeButtons(); // the shape is no longer a plain preset
    renderWindshield();
    renderChipTable(); // both edge margin and field of view are measured on the real pane
  }
  ["adjTop", "adjBottom", "adjRound", "adjBow", "adjWidthCm", "adjHeightCm", "adjWheelCm"].forEach(function (id) { $(id).addEventListener("input", function () { closePopup(); onAdjust(); }); });
  $("adjReset").addEventListener("click", function () { car().adjust = null; touchCar(); persist(); closePopup(); rerenderAll(); });

  // Opens a prefilled GitHub issue form with the current shape values, so
  // community car models can be collected without any server of our own.
  // Every value a preset needs and the user can set goes along — a proposal
  // missing the real width can't be turned into one (the 10 cm margin and the
  // 29 cm field of view are measured against it).
  $("proposeShape").addEventListener("click", function () {
    var c = car();
    var p = shapes.paramsFor(c);
    var fields = {
      title: "[model] " + (c.name || ""),
      car: c.name || "",
      top: p.top.toFixed(2), bottom: p.bottom.toFixed(2),
      round: p.round.toFixed(2), bow: p.bow.toFixed(2),
      width_cm: String(Math.round(p.widthCm)), height_cm: String(Math.round(p.heightCm)),
      // Carried from the preset the proposer started from — no slider sets it,
      // but a preset without it can't turn a real pane into a drawing.
      rake: p.rake.toFixed(2),
      wheel_cm: String(Math.round(p.wheelCm)),
    };
    var query = Object.keys(fields).map(function (k) {
      return k + "=" + encodeURIComponent(fields[k]);
    }).join("&");
    window.open("https://github.com/bmmmm/shieldchipiii/issues/new?template=car-model.yml&" + query, "_blank", "noopener");
  });

  $("wheelLeft").addEventListener("click", function () { car().wheel = "left"; touchCar(); persist(); closePopup(); rerenderAll(); });
  $("wheelRight").addEventListener("click", function () { car().wheel = "right"; touchCar(); persist(); closePopup(); rerenderAll(); });
  // The country moves the edge margin, so the drawn zone and every verdict
  // change with it — a full rerender, not just the form.
  $("country").addEventListener("change", function () { car().country = this.value; touchCar(); persist(); closePopup(); rerenderAll(); });

  $("glassSwap").addEventListener("click", function () {
    confirmDialog(t("confirmGlassSwap", { count: car().chips.length }), t("glassSwap"), function () {
      var c = car();
      c.gone = c.gone || {};
      var ts = store.now(); // one deletion moment for the whole pane
      c.chips.forEach(function (k) { c.gone[k.id] = ts; });
      c.chips = [];
      touchCar();
      closePopup();
      persist();
      rerenderAll();
    });
  });

  $("deleteCar").addEventListener("click", function () {
    confirmDialog(t("confirmDeleteCar"), t("deleteCar"), function () {
      var gid = car().id;
      state.gone = state.gone || {};
      state.gone[gid] = store.now(); // tombstone the car for later merges
      state.cars = state.cars.filter(function (c) { return c.id !== gid; });
      if (!state.cars.length) state.cars.push(store.newCar(""));
      state.activeCar = state.cars[0].id;
      closePopup();
      persist();
      rerenderAll();
    });
  });

  // ---------- glass: add / select / drag ----------

  // Which marker a tap means — by distance in real pixels, not by what the
  // pointer happens to be over. See render.markerAt.
  function pickMarker(e) { return render.markerAt(svg, car(), e.clientX, e.clientY); }

  svg.addEventListener("pointerdown", function (e) {
    var chip = pickMarker(e);
    if (chip) {
      drag = { id: chip.id, moved: false };
      svg.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  });

  svg.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var k = chipById(drag.id);
    if (!k) return;
    if (!drag.moved) { popup.hidden = true; } // hide while dragging
    var box = render.clientToBox(svg, car(), e.clientX, e.clientY);
    var pos = shapes.boxToChip(shapes.paramsFor(car()), box.x, box.y);
    k.x = pos.x; k.y = pos.y;
    drag.moved = true;
    renderWindshield();
  });

  function endDrag(id, moved) {
    drag = null;
    var k = chipById(id);
    if (moved && k) { k.up = store.now(); persist(); }
    openPopup(id); // select + (re)position popup at the marker
  }

  svg.addEventListener("pointerup", function () {
    if (!drag) return;
    suppressClick = true; // swallow the click trailing this pointerup
    endDrag(drag.id, drag.moved);
  });

  // A cancelled pointer — a system gesture, a context menu — never sends
  // pointerup. Without this the drag stays live and the next move drags the
  // marker around with no button held. No click follows a cancel, so nothing
  // to swallow.
  svg.addEventListener("pointercancel", function () {
    if (!drag) return;
    endDrag(drag.id, drag.moved);
  });

  svg.addEventListener("click", function (e) {
    if (suppressClick) { suppressClick = false; return; }
    // Missing a marker used to add a chip on top of the one you were aiming
    // at, so the same reach that selects has to be the one that decides the
    // glass is empty here.
    if (pickMarker(e)) return;
    var box = render.clientToBox(svg, car(), e.clientX, e.clientY);
    if (!render.onGlass(car(), box)) { closePopup(); return; }
    var p = shapes.paramsFor(car());
    var pos = shapes.boxToChip(p, box.x, box.y);
    var chip = store.newChip(pos); // fov/edge are derived from the position, not stored
    car().chips.push(chip);
    persist();
    openPopup(chip.id);
  });

  // Toggle from a row — one path for click and keyboard. The scroll takes
  // its smoothness from the CSS scroll-behavior, so reduced motion is
  // honoured without a second code path.
  function rowActivate(row) {
    if (row.dataset.id === selectedId) { closePopup(); return; }
    openPopup(row.dataset.id, "row");
    $("glassStage").scrollIntoView({ block: "center" });
  }

  $("chipTable").addEventListener("click", function (e) {
    var row = e.target.closest("tr[data-id]");
    if (row) rowActivate(row);
  });

  // Rows carry role="button", so Enter and Space must do what a click does.
  $("chipTable").addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var row = e.target.closest("tr[data-id]");
    if (!row) return;
    e.preventDefault(); // Space would scroll the page
    rowActivate(row);
  });

  // Markers are focusable buttons in the SVG; Enter or Space opens what a
  // tap opens. Dragging stays pointer-only — the popup covers editing.
  svg.addEventListener("keydown", function (e) {
    if (e.key !== "Enter" && e.key !== " ") return;
    var g = e.target.closest(".marker");
    if (!g) return;
    e.preventDefault();
    openPopup(g.dataset.id);
  });

  window.addEventListener("resize", function () { if (!popup.hidden && selectedId) positionPopup(chipById(selectedId)); });

  // Click anywhere outside the glass, popup or entry table closes the popup.
  // The glass and table run their own selection logic, so they're excluded.
  document.addEventListener("pointerdown", function (e) {
    if (popup.hidden) return;
    if (e.target.closest("#markerPopup, #windshield, #chipTable, #confirmOverlay")) return;
    closePopup();
  });

  // Escape backs out of whatever is floating on top, innermost first.
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (!$("confirmOverlay").hidden) { closeConfirm(); return; }
    if (!$("reportOverlay").hidden) { closeReport(); return; }
    if (!$("importOverlay").hidden) { $("importOverlay").hidden = true; return; }
    if (!popup.hidden) closePopup();
  });

  // ---------- share ----------

  function flash(btn, key) {
    var old = btn.textContent;
    btn.textContent = t(key);
    setTimeout(function () { btn.textContent = old; }, 1200);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; }
    catch (e) {
      var ta = document.createElement("textarea");
      ta.value = text; document.body.appendChild(ta); ta.select();
      var ok = document.execCommand("copy"); ta.remove(); return ok;
    }
  }

  $("copyLink").addEventListener("click", async function () {
    var url = await share.shareUrl(state);
    if (await copyText(url)) flash(this, "copied");
  });
  $("copyAscii").addEventListener("click", async function () {
    if (await copyText(ascii.renderAscii(car()))) flash(this, "copied");
  });
  $("exportJson").addEventListener("click", function () {
    var blob = new Blob([JSON.stringify({ v: 1, cars: state.cars, gone: state.gone }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    var url = URL.createObjectURL(blob);
    a.href = url;
    a.download = "shieldchipiii-" + today() + ".json";
    a.click();
    // Revoked on the next tick: the download reads the blob after click()
    // returns, and pulling the URL out from under it races that read.
    setTimeout(function () { URL.revokeObjectURL(url); }, 0);
  });
  $("importJson").addEventListener("change", function () {
    var file = this.files[0];
    this.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var incoming = null;
      try { incoming = store.sanitize(JSON.parse(reader.result)); } catch (e) { /* handled below */ }
      if (!incoming) { toast(t("importFileBroken"), "danger"); return; }
      showImportDialog(incoming);
    };
    reader.readAsText(file);
  });

  // ---------- share panel (QR + live indicators) ----------

  // The panel mirrors the whole state, so it re-renders on every mutation
  // (debounced via persist — a slider drag calls persist many times) and once
  // directly from rerenderAll. shareUrl is async: a sequence counter drops a
  // stale resolve that lands after a newer one.
  var QR_MAX = 2953; // ECC L, version 40 byte capacity (payload is ASCII, so bytes == chars)
  var shareSeq = 0, shareTimer = null;

  function scheduleShare() {
    if (shareTimer) clearTimeout(shareTimer);
    shareTimer = setTimeout(renderShare, 250);
  }

  function renderShare() {
    var seq = ++shareSeq;
    var snap = state;
    share.shareUrl(snap).then(function (url) {
      if (seq !== shareSeq) return; // a newer render already superseded this one
      var carsN = snap.cars.length;
      var chipsN = snap.cars.reduce(function (n, c) { return n + c.chips.length; }, 0);
      var kb = (url.length / 1024).toFixed(1);
      $("shareStats").textContent = plur("nVehicles", carsN) + " · " + plur("nEntries", chipsN) + " · " + kb + " kB";
      $("shareUrlRead").textContent = url;

      var svgStr = null;
      if (url.length <= QR_MAX) { try { svgStr = qr.svg(url); } catch (e) { svgStr = null; } }
      var tile = $("qrTile");
      tile.innerHTML = svgStr || "";
      tile.hidden = !svgStr;
      var cap = $("qrCapacity");
      cap.textContent = svgStr ? t("qrFits") : t("qrTooBig");
      cap.className = "qr-capacity " + (svgStr ? "cap-ok" : "cap-danger");
    });
  }

  // ---------- toast ----------

  // One reusable bottom-centre banner, polite live region, auto-hides.
  var toastTimer = null;
  function toast(msg, kind) {
    var el = $("toast");
    el.textContent = msg;
    el.className = "toast toast-" + (kind === "danger" ? "danger" : "ok");
    el.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 4000);
  }

  // ---------- confirm dialog ----------

  // Replaces native confirm(): consistent with the app's own dialogs, and the
  // OK button names the action it confirms instead of a generic "OK".
  var confirmYes = null;
  function confirmDialog(msg, okLabel, onYes) {
    $("confirmMsg").textContent = msg;
    $("confirmOk").textContent = okLabel;
    confirmYes = onYes;
    $("confirmOverlay").hidden = false;
    $("confirmCancel").focus(); // safe default for a destructive question
  }
  function closeConfirm() { $("confirmOverlay").hidden = true; confirmYes = null; }
  $("confirmOk").addEventListener("click", function () {
    var fn = confirmYes;
    closeConfirm();
    if (fn) fn();
  });
  $("confirmCancel").addEventListener("click", closeConfirm);

  // ---------- import dialog + URL hash ----------

  // A brand-new install is exactly the default state: one unnamed, empty car and
  // no tombstones. Merging into it would leave that empty car beside the imported
  // ones (and still active), so the import reads as a failure — hence a single
  // "take over" (replace) on first setup.
  function isPristine(s) {
    if (s.cars.length !== 1) return false;
    var c = s.cars[0];
    if (c.name || c.chips.length) return false;
    if (s.gone && Object.keys(s.gone).length) return false;
    if (c.gone && Object.keys(c.gone).length) return false;
    return true;
  }

  function showImportDialog(incoming) {
    var first = isPristine(state);
    $("importTitle").textContent = first ? t("importTitleFirst") : t("importTitle");

    var shown = incoming.cars.slice(0, 6).map(function (c) {
      return "<li>" + esc(c.name || "🚗") + " · " + plur("nEntries", c.chips.length) + "</li>";
    });
    if (incoming.cars.length > 6) {
      shown.push('<li class="import-more">' + t("importMore").replace("{n}", incoming.cars.length - 6) + "</li>");
    }
    $("importPreview").innerHTML = shown.join("");

    var merge = $("importMerge"), replace = $("importReplace");
    replace.hidden = first;
    merge.textContent = first ? t("importTakeover") : t("importMerge");
    $("importHint").textContent = first ? t("importTakeoverHint") : t("importMergeHint");
    merge.onclick = first
      ? function () { doReplace(incoming); }
      : function () { var r = store.merge(state, incoming); state = r.state; finishImport(); toastStats(r.stats); };
    replace.onclick = function () { doReplace(incoming); };
    $("importCancel").onclick = function () { $("importOverlay").hidden = true; };
    $("importOverlay").hidden = false;

    function doReplace(inc) {
      var carsN = inc.cars.length;
      var chipsN = inc.cars.reduce(function (n, c) { return n + c.chips.length; }, 0);
      inc.activeCar = inc.cars[0].id;
      state = inc;
      finishImport();
      toast(t("replaceDone") + " " + plur("nVehicles", carsN) + ", " + plur("nEntries", chipsN), "ok");
    }
    function finishImport() {
      $("importOverlay").hidden = true;
      closePopup();
      if (!state.cars.some(function (c) { return c.id === state.activeCar; })) state.activeCar = state.cars[0].id;
      persist();
      rerenderAll();
    }
  }

  // The merge stats become a toast of only the parts that actually happened;
  // blocked + removed are both deletions that stuck, so they read as one honest
  // "deletion kept". An all-zero merge says so rather than an empty "Imported:".
  function toastStats(stats) {
    var parts = [];
    if (stats.cars) parts.push(plur("statCars", stats.cars));
    if (stats.added) parts.push(plur("statAdded", stats.added));
    if (stats.updated) parts.push(plur("statUpdated", stats.updated));
    if (stats.events) parts.push(plur("statEvents", stats.events));
    var del = (stats.blocked || 0) + (stats.removed || 0);
    if (del) parts.push(plur("statDeletions", del));
    toast(parts.length ? t("importDone") + " " + parts.join(" · ") : t("importNothing"), "ok");
  }

  async function handleHash() {
    var hash = location.hash;
    if (!/^#[ij]:/.test(hash)) return;
    history.replaceState(null, "", location.pathname + location.search);
    try { showImportDialog(await share.decodeToken(hash)); }
    catch (e) { toast(t("importBroken"), "danger"); }
  }
  window.addEventListener("hashchange", handleHash);

  // ---------- receive: paste a link from the other device ----------

  // Accepts a full share URL or a bare i:/j: token — the same import path the
  // URL hash takes, minus the address bar.
  async function importFromText(text) {
    var m = (text || "").match(/[ij]:[A-Za-z0-9_-]+/);
    if (!m) { toast(t("importBroken"), "danger"); return; }
    try {
      showImportDialog(await share.decodeToken(m[0]));
      $("pasteLink").value = "";
    } catch (e) { toast(t("importBroken"), "danger"); }
  }
  // ---------- workshop report ----------

  function closeReport() {
    $("reportOverlay").hidden = true;
    document.body.classList.remove("report-open");
    $("reportBody").innerHTML = "";
  }
  $("makeReport").addEventListener("click", function () {
    $("reportBody").innerHTML = window.SC.report.html(car(), { date: today() });
    // The drawing goes in after the fact: report.html is a pure string
    // builder, and the SVG needs a live element to be rendered into.
    render.windshield($("reportBody").querySelector("[data-report-svg]"), car(), null);
    document.body.classList.add("report-open"); // scopes the print stylesheet
    $("reportOverlay").hidden = false;
    $("reportClose").focus();
  });
  $("reportPrint").addEventListener("click", function () { window.print(); });
  $("reportClose").addEventListener("click", closeReport);

  $("pasteGo").addEventListener("click", function () { importFromText($("pasteLink").value); });
  $("pasteLink").addEventListener("keydown", function (e) { if (e.key === "Enter") importFromText(this.value); });
  $("pasteLink").addEventListener("paste", function () {
    var el = this;
    setTimeout(function () { importFromText(el.value); }, 0); // the value lands after the paste event
  });

  // ---------- boot ----------
  // Brand splash first, so it's on screen before the first paint. Pure
  // garnish: skippable, reduced-motion aware, and never in front of the
  // import dialog a shared link opens.
  if (!/^#[ij]:/.test(location.hash)) window.SC.anim.splash();
  rerenderAll();
  handleHash();

  // Offline shell: best effort, never in the way. file:// has no worker and
  // stays a supported way to open the app, so failure is silence, not a toast.
  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }

  // This browser holds the data's only copy — there is no server. Ask not to
  // be evicted under storage pressure; an installed PWA gets this granted
  // almost always, and where it isn't supported the promise just resolves
  // false. Nothing to show the user: the remedy is installing the app.
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().catch(function () {});
  }
})();
