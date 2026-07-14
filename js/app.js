/* shieldchipiii — UI wiring: windshield, floating marker popup, event timeline. */
(function () {
  "use strict";
  var store = window.SC.store, shapes = window.SC.shapes, render = window.SC.render;
  var share = window.SC.share, i18n = window.SC.i18n, ascii = window.SC.ascii, logic = window.SC.logic;
  var t = i18n.t;

  var state = store.load();
  var selectedId = null;
  var drag = null;            // { id, moved }
  var suppressClick = false;  // swallow the click that trails a marker pointerup

  var $ = function (id) { return document.getElementById(id); };
  var svg = $("windshield");
  var popup = $("markerPopup");

  var SHAPE_KEY = { compact: "shapeCompact", sedan: "shapeSedan", suv: "shapeSuv", van: "shapeVan", sport: "shapeSport" };
  var SIZE_KEY = { c10: "sizeC10", c50: "sizeC50", e2: "sizeE2", crackS: "sizeCrackS", crackM: "sizeCrackM", crackL: "sizeCrackL" };
  var STATUS_KEY = {
    new: "statusNew", observing: "statusObserving", repair_planned: "statusRepairPlanned",
    repaired: "statusRepaired", irreparable: "statusIrreparable", replaced: "statusReplaced",
  };
  var EVENT_KEY = {
    observing: "evObserving", repair_planned: "evRepairPlanned", repaired: "evRepaired",
    irreparable: "evIrreparable", replaced: "evReplaced", insurance_reported: "evInsuranceReported",
    note: "evNote", new: "evNew",
  };
  // What the user can add from the timeline (all but the implicit initial "new").
  // "replaced" is a vehicle-level action (glassSwap), not a per-chip event.
  var ADDABLE = ["observing", "repair_planned", "repaired", "irreparable", "insurance_reported", "note"];
  var WHERE_TYPES = { repaired: 1, repair_planned: 1 };

  function car() { return store.activeCar(state); }
  function chipById(id) { return car().chips.find(function (k) { return k.id === id; }); }
  function persist() { store.save(state); }
  function touchCar() { car().up = store.now(); }
  function today() { return new Date().toISOString().slice(0, 10); }
  function esc(s) { return render.esc(s); }

  // ---------- static + structural rendering ----------

  function applyStaticI18n() {
    document.documentElement.lang = i18n.get();
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) { el.placeholder = t(el.dataset.i18nPh); });
    $("langToggle").textContent = i18n.get() === "de" ? "EN" : "DE";
  }

  function renderLegend() {
    var items = [
      ['<span class="lg m-new">●</span>', "statusNew"],
      ['<span class="lg m-observing">●</span>', "statusObserving"],
      ['<span class="lg m-planned">●</span>', "statusRepairPlanned"],
      ['<span class="lg m-repaired">●</span>', "statusRepaired"],
      ['<span class="lg m-irreparable">●</span>', "statusIrreparable"],
      ['<span class="lg fov">▒</span>', "legendFov"],
      ['<span class="lg edge">▒</span>', "legendMargin"],
    ];
    $("legend").innerHTML = items.map(function (it) { return it[0] + " " + esc(t(it[1])); }).join(" · ");
  }

  function renderCarTabs() {
    var html = state.cars.map(function (c) {
      return '<button class="tab' + (c.id === car().id ? " active" : "") + '" data-car="' + esc(c.id) + '">' + esc(c.name || "🚗") + "</button>";
    }).join("");
    html += '<button class="tab add" id="addCar">' + esc(t("addCar")) + "</button>";
    $("carTabs").innerHTML = html;
  }

  function renderCarForm() {
    var c = car();
    $("carName").value = c.name;
    var p = shapes.paramsFor(c);
    $("shapeButtons").innerHTML = shapes.PRESET_ORDER.map(function (key) {
      return '<button class="shape-btn' + (c.shape === key && !c.adjust ? " active" : "") + '" data-shape="' + key + '">' + esc(t(SHAPE_KEY[key])) + "</button>";
    }).join("");
    $("adjTop").value = Math.round(p.top * 100);
    $("adjBottom").value = Math.round(p.bottom * 100);
    $("adjHeight").value = Math.round(p.aspect * 100);
    $("adjRound").value = Math.round(p.round * 100);
    $("adjBow").value = Math.round(p.bow * 100);
    $("adjWidthCm").value = Math.round(p.widthCm);
    $("adjWidthCmOut").textContent = Math.round(p.widthCm) + " cm";
    $("adjWheelCm").value = Math.round(p.wheelCm);
    $("adjWheelCmOut").textContent = Math.round(p.wheelCm) + " cm";
    $("wheelLeft").classList.toggle("active", c.wheel !== "right");
    $("wheelRight").classList.toggle("active", c.wheel === "right");
  }

  function renderChipTable() {
    var chips = car().chips;
    if (!chips.length) {
      $("chipTable").innerHTML = '<p class="muted">' + esc(t("noChips")) + "</p>";
      return;
    }
    var p = shapes.paramsFor(car());
    var rows = chips.map(function (k, i) {
      var status = logic.currentStatus(k);
      var edge = shapes.inMargin(p, k);
      var rec = logic.recommend(k, { inMargin: edge });
      var found = (logic.timeline(k)[0] || {}).date || "";
      var badges = (k.fov ? "⌖ " : "") + (edge ? "▣ " : "") + (logic.insuranceReported(k) ? "🛡" : "");
      return '<tr class="' + (k.id === selectedId ? "selected " : "") + "st-" + status + '" data-id="' + esc(k.id) + '">' +
        "<td>" + (i + 1) + "</td>" +
        '<td class="sym">' + ascii.markerChar(k) + "</td>" +
        "<td>" + esc(t(SIZE_KEY[k.size] || k.size)) + "</td>" +
        "<td>" + esc(t(STATUS_KEY[status])) + "</td>" +
        "<td>" + esc(found) + "</td>" +
        '<td class="rec-dot rec-' + rec.level + '" title="' + esc(t(rec.key)) + '">' + badges + "</td></tr>";
    }).join("");
    $("chipTable").innerHTML = "<table><tbody>" + rows + "</tbody></table>";
  }

  function renderWindshield() { render.windshield(svg, car(), selectedId); }

  function rerenderAll() {
    applyStaticI18n();
    renderLegend();
    renderCarTabs();
    renderCarForm();
    renderWindshield();
    renderChipTable();
  }

  // ---------- marker popup ----------

  function buildPopup(chip) {
    var idx = car().chips.indexOf(chip) + 1;
    var status = logic.currentStatus(chip);
    var p = shapes.paramsFor(car());
    var distCm = shapes.edgeDistanceCm(p, chip);
    var edge = distCm < shapes.MARGIN_CM;
    var rec = logic.recommend(chip, { inMargin: edge });
    var tl = logic.timeline(chip);

    var sizeOpts = logic.SIZES.map(function (s) {
      return '<option value="' + s + '"' + (chip.size === s ? " selected" : "") + ">" + esc(t(SIZE_KEY[s])) + "</option>";
    }).join("");

    var tlRows = tl.map(function (e) {
      var line = e.date + " — " + esc(t(EVENT_KEY[e.type] || e.type));
      var extra = [];
      if (e.where) extra.push(esc(e.where));
      if (e.note) extra.push("„" + esc(e.note) + "“");
      if (extra.length) line += " · " + extra.join(" · ");
      var del = tl.length > 1 ? '<button class="tl-del" data-act="delEvent" data-id="' + esc(e.id) + '" title="' + esc(t("deleteEvent")) + '">×</button>' : "";
      return '<li class="tl-' + e.type + '">' + line + del + "</li>";
    }).join("");

    var addOpts = ADDABLE.map(function (ty) {
      return '<option value="' + ty + '">' + esc(t(EVENT_KEY[ty])) + "</option>";
    }).join("");

    popup.innerHTML =
      '<div class="popup-head">' +
        "<strong>#" + idx + " · " + esc(t(STATUS_KEY[status])) + "</strong>" +
        '<button class="ghost pop-x" data-act="close" title="' + esc(t("close")) + '">×</button>' +
      "</div>" +
      '<div class="rec rec-' + rec.level + '"><span class="rec-label">' + esc(t("recommendation")) + ":</span> " + esc(t(rec.key)) + "</div>" +
      '<div class="popup-fields">' +
        '<label class="pf">' + esc(t("size")) + ' <select data-act="size">' + sizeOpts + "</select></label>" +
        '<label class="pf pf-check"><input type="checkbox" data-act="fov"' + (chip.fov ? " checked" : "") + "> " + esc(t("fov")) + "</label>" +
        '<span class="pf edge-dist' + (edge ? " is-edge" : "") + '">' + esc(t("edgeDistance")) + " ~" + Math.round(distCm) + " cm</span>" +
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

  function openPopup(id) {
    var chip = chipById(id);
    if (!chip) { closePopup(); return; }
    selectedId = id;
    popup.hidden = false;
    buildPopup(chip);
    positionPopup(chip);
    renderWindshield();
    renderChipTable();
  }

  function refreshPopup() {
    var chip = chipById(selectedId);
    if (!chip) { closePopup(); return; }
    buildPopup(chip);
    positionPopup(chip);
  }

  function closePopup() {
    selectedId = null;
    popup.hidden = true;
    popup.innerHTML = "";
    renderWindshield();
    renderChipTable();
  }

  // ---------- popup interactions (delegated) ----------

  popup.addEventListener("click", function (e) {
    var act = e.target.closest("[data-act]");
    if (!act) return;
    var kind = act.dataset.act;
    if (kind === "close") { closePopup(); return; }
    if (kind === "delChip") {
      if (!confirm(t("confirmDeleteChip"))) return;
      car().chips = car().chips.filter(function (k) { return k.id !== selectedId; });
      touchCar();
      persist();
      closePopup();
      renderWindshield();
      renderChipTable();
      return;
    }
    if (kind === "delEvent") {
      var chip = chipById(selectedId);
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
    else if (el.dataset.act === "fov") { chip.fov = el.checked; chip.up = store.now(); persist(); refreshPopup(); renderWindshield(); renderChipTable(); }
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
  });

  // ---------- top controls ----------

  $("langToggle").addEventListener("click", function () { i18n.set(i18n.get() === "de" ? "en" : "de"); closePopup(); rerenderAll(); });

  $("carTabs").addEventListener("click", function (e) {
    var btn = e.target.closest("button");
    if (!btn) return;
    if (btn.id === "addCar") {
      var c = store.newCar("");
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
      aspect: $("adjHeight").value / 100, round: $("adjRound").value / 100, bow: $("adjBow").value / 100,
      widthCm: +$("adjWidthCm").value, wheelCm: +$("adjWheelCm").value,
    };
    touchCar();
    persist();
    $("adjWidthCmOut").textContent = $("adjWidthCm").value + " cm";
    $("adjWheelCmOut").textContent = $("adjWheelCm").value + " cm";
    renderWindshield();
    renderChipTable(); // the edge margin scales with the real width
  }
  ["adjTop", "adjBottom", "adjHeight", "adjRound", "adjBow", "adjWidthCm", "adjWheelCm"].forEach(function (id) { $(id).addEventListener("input", function () { closePopup(); onAdjust(); }); });
  $("adjReset").addEventListener("click", function () { car().adjust = null; touchCar(); persist(); closePopup(); rerenderAll(); });

  // Opens a prefilled GitHub issue form with the current shape values, so
  // community car models can be collected without any server of our own.
  $("proposeShape").addEventListener("click", function () {
    var c = car();
    var p = shapes.paramsFor(c);
    var url = "https://github.com/bmmmm/shieldchipiii/issues/new?template=car-model.yml" +
      "&title=" + encodeURIComponent("[model] " + (c.name || "")) +
      "&car=" + encodeURIComponent(c.name || "") +
      "&top=" + p.top.toFixed(2) + "&aspect=" + p.aspect.toFixed(2) +
      "&round=" + p.round.toFixed(2) + "&bow=" + p.bow.toFixed(2);
    window.open(url, "_blank", "noopener");
  });

  $("wheelLeft").addEventListener("click", function () { car().wheel = "left"; touchCar(); persist(); closePopup(); rerenderAll(); });
  $("wheelRight").addEventListener("click", function () { car().wheel = "right"; touchCar(); persist(); closePopup(); rerenderAll(); });

  $("glassSwap").addEventListener("click", function () {
    if (!confirm(t("confirmGlassSwap", { count: car().chips.length }))) return;
    car().chips = [];
    touchCar();
    closePopup();
    persist();
    rerenderAll();
  });

  $("deleteCar").addEventListener("click", function () {
    if (!confirm(t("confirmDeleteCar"))) return;
    state.cars = state.cars.filter(function (c) { return c.id !== car().id; });
    if (!state.cars.length) state.cars.push(store.newCar(""));
    state.activeCar = state.cars[0].id;
    closePopup();
    persist();
    rerenderAll();
  });

  // ---------- glass: add / select / drag ----------

  svg.addEventListener("pointerdown", function (e) {
    var markerEl = e.target.closest(".marker");
    if (markerEl) {
      drag = { id: markerEl.dataset.id, moved: false };
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

  svg.addEventListener("pointerup", function (e) {
    if (!drag) return;
    var id = drag.id, moved = drag.moved;
    drag = null;
    suppressClick = true;
    var k = chipById(id);
    if (moved && k) { k.up = store.now(); persist(); }
    openPopup(id); // select + (re)position popup at the marker
  });

  svg.addEventListener("click", function (e) {
    if (suppressClick) { suppressClick = false; return; }
    if (e.target.closest(".marker")) return;
    var box = render.clientToBox(svg, car(), e.clientX, e.clientY);
    if (!render.onGlass(car(), box)) { closePopup(); return; }
    var p = shapes.paramsFor(car());
    var pos = shapes.boxToChip(p, box.x, box.y);
    var chip = store.newChip(pos);
    chip.fov = shapes.suggestFov(p, chip, car().wheel);
    car().chips.push(chip);
    persist();
    openPopup(chip.id);
  });

  $("chipTable").addEventListener("click", function (e) {
    var row = e.target.closest("tr[data-id]");
    if (!row) return;
    if (row.dataset.id === selectedId) { closePopup(); return; }
    openPopup(row.dataset.id);
    $("glassStage").scrollIntoView({ behavior: "smooth", block: "center" });
  });

  window.addEventListener("resize", function () { if (!popup.hidden && selectedId) positionPopup(chipById(selectedId)); });

  // Click anywhere outside the glass, popup or entry table closes the popup.
  // The glass and table run their own selection logic, so they're excluded.
  document.addEventListener("pointerdown", function (e) {
    if (popup.hidden) return;
    if (e.target.closest("#markerPopup, #windshield, #chipTable")) return;
    closePopup();
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
    var blob = new Blob([JSON.stringify({ v: 1, cars: state.cars }, null, 2)], { type: "application/json" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "shieldchipiii-" + today() + ".json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $("importJson").addEventListener("change", function () {
    var file = this.files[0];
    this.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var incoming = null;
      try { incoming = store.sanitize(JSON.parse(reader.result)); } catch (e) { /* handled below */ }
      if (!incoming) { alert(t("importFileBroken")); return; }
      showImportDialog(incoming);
    };
    reader.readAsText(file);
  });

  // ---------- import via URL hash ----------

  function showImportDialog(incoming) {
    var chips = incoming.cars.reduce(function (n, c) { return n + c.chips.length; }, 0);
    $("importSummary").textContent = t("importSummary", { cars: incoming.cars.length, chips: chips });
    $("importOverlay").hidden = false;
    $("importMerge").onclick = function () { state = store.merge(state, incoming); finishImport(); };
    $("importReplace").onclick = function () { incoming.activeCar = incoming.cars[0].id; state = incoming; finishImport(); };
    $("importCancel").onclick = function () { $("importOverlay").hidden = true; };
    function finishImport() {
      $("importOverlay").hidden = true;
      closePopup();
      if (!state.cars.some(function (c) { return c.id === state.activeCar; })) state.activeCar = state.cars[0].id;
      persist();
      rerenderAll();
    }
  }

  async function handleHash() {
    var hash = location.hash;
    if (!/^#[ij]:/.test(hash)) return;
    history.replaceState(null, "", location.pathname + location.search);
    try { showImportDialog(await share.decodeToken(hash)); }
    catch (e) { alert(t("importBroken")); }
  }
  window.addEventListener("hashchange", handleHash);

  // ---------- boot ----------
  rerenderAll();
  handleHash();
})();
