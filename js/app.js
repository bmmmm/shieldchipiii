/* shieldchipii — UI wiring. */
(function () {
  "use strict";
  var store = window.SC.store, shapes = window.SC.shapes, render = window.SC.render;
  var share = window.SC.share, i18n = window.SC.i18n, ascii = window.SC.ascii;
  var t = i18n.t;

  var state = store.load();
  var selectedId = null;
  var drag = null; // { id, moved }
  // A click event always follows pointerup; after a marker tap/drag the DOM was
  // re-rendered, so that click would hit the bare SVG and create a bogus chip.
  var suppressClick = false;

  var $ = function (id) { return document.getElementById(id); };
  var svg = $("windshield");

  var SIZES = ["c10", "c50", "e2", "crackS", "crackM", "crackL"];
  var SIZE_KEY = { c10: "sizeC10", c50: "sizeC50", e2: "sizeE2", crackS: "sizeCrackS", crackM: "sizeCrackM", crackL: "sizeCrackL" };
  var SHAPE_KEY = { compact: "shapeCompact", sedan: "shapeSedan", suv: "shapeSuv", van: "shapeVan", sport: "shapeSport" };

  function car() { return store.activeCar(state); }
  function chipById(id) { return car().chips.find(function (k) { return k.id === id; }); }
  function persist() { store.save(state); }
  function touchCar() { car().up = store.now(); }

  // ---------- rendering ----------

  function applyStaticI18n() {
    document.documentElement.lang = i18n.get();
    document.querySelectorAll("[data-i18n]").forEach(function (el) { el.textContent = t(el.dataset.i18n); });
    document.querySelectorAll("[data-i18n-ph]").forEach(function (el) { el.placeholder = t(el.dataset.i18nPh); });
    $("langToggle").textContent = i18n.get() === "de" ? "EN" : "DE";
  }

  function renderCarTabs() {
    var html = state.cars.map(function (c) {
      var name = c.name || "🚗";
      return '<button class="tab' + (c.id === car().id ? " active" : "") + '" data-car="' + render.esc(c.id) + '">' + render.esc(name) + "</button>";
    }).join("");
    html += '<button class="tab add" id="addCar">' + render.esc(t("addCar")) + "</button>";
    $("carTabs").innerHTML = html;
  }

  function renderCarForm() {
    var c = car();
    $("carName").value = c.name;
    var p = shapes.paramsFor(c);
    $("shapeButtons").innerHTML = shapes.PRESET_ORDER.map(function (key) {
      return '<button class="shape-btn' + (c.shape === key && !c.adjust ? " active" : "") + '" data-shape="' + key + '">' + render.esc(t(SHAPE_KEY[key])) + "</button>";
    }).join("");
    $("adjTop").value = Math.round(p.top * 100);
    $("adjHeight").value = Math.round(p.aspect * 100);
    $("adjRound").value = Math.round(p.round * 100);
    $("wheelLeft").classList.toggle("active", c.wheel !== "right");
    $("wheelRight").classList.toggle("active", c.wheel === "right");
  }

  function badgesFor(k) {
    var out = [];
    if (k.fov) out.push("⌖");
    if (k.insurance) out.push("🛡");
    return out.join(" ");
  }

  function renderChipTable() {
    var chips = car().chips;
    if (!chips.length) {
      $("chipTable").innerHTML = '<p class="muted">' + render.esc(t("noChips")) + "</p>";
      return;
    }
    var rows = chips.map(function (k, i) {
      var sym = ascii.markerChar(k);
      var statusTxt = t(k.status === "repaired" ? "statusRepaired" : "statusNew");
      return '<tr class="' + (k.id === selectedId ? "selected " : "") + (k.status === "repaired" ? "repaired" : "new") + '" data-id="' + render.esc(k.id) + '">' +
        "<td>" + (i + 1) + "</td><td>" + sym + "</td><td>" + render.esc(t(SIZE_KEY[k.size] || k.size)) + "</td>" +
        "<td>" + render.esc(statusTxt) + "</td><td>" + render.esc(k.found || "") + "</td><td>" + badgesFor(k) + "</td></tr>";
    }).join("");
    $("chipTable").innerHTML = '<table><tbody>' + rows + "</tbody></table>";
  }

  function renderDetail() {
    var k = selectedId && chipById(selectedId);
    $("detail").hidden = !k;
    if (!k) return;
    $("chipSize").innerHTML = SIZES.map(function (s) {
      return '<option value="' + s + '"' + (k.size === s ? " selected" : "") + ">" + render.esc(t(SIZE_KEY[s])) + "</option>";
    }).join("");
    $("chipStatus").innerHTML = ["new", "repaired"].map(function (s) {
      return '<option value="' + s + '"' + (k.status === s ? " selected" : "") + ">" + render.esc(t(s === "new" ? "statusNew" : "statusRepaired")) + "</option>";
    }).join("");
    $("chipFov").checked = !!k.fov;
    $("chipFound").value = k.found || "";
    $("chipNote").value = k.note || "";
    $("repairFields").hidden = k.status !== "repaired";
    $("chipRepairedAt").value = k.repairedAt || "";
    $("chipRepairedBy").value = k.repairedBy || "";
    $("chipInsurance").checked = !!k.insurance;
    $("insuranceDateField").hidden = !k.insurance;
    $("chipInsuranceAt").value = k.insuranceAt || "";
    var idx = car().chips.indexOf(k) + 1;
    $("detailTitle").textContent = "#" + idx + " — " + t("position") + " " +
      Math.round(k.x * 100) + "% / " + Math.round(k.y * 100) + "%";
  }

  function rerender() {
    applyStaticI18n();
    renderCarTabs();
    renderCarForm();
    render.windshield(svg, car(), selectedId);
    renderChipTable();
    renderDetail();
  }

  // ---------- chip edits ----------

  function updateChip(fields) {
    var k = chipById(selectedId);
    if (!k) return;
    Object.assign(k, fields, { up: store.now() });
    persist();
    rerender();
  }

  // ---------- events ----------

  $("langToggle").addEventListener("click", function () {
    i18n.set(i18n.get() === "de" ? "en" : "de");
    rerender();
  });

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
    selectedId = null;
    persist();
    rerender();
    if (e.target.closest("#addCar")) $("carName").focus();
  });

  $("carName").addEventListener("input", function () {
    car().name = this.value;
    touchCar();
    persist();
    renderCarTabs();
  });

  $("shapeButtons").addEventListener("click", function (e) {
    var btn = e.target.closest("[data-shape]");
    if (!btn) return;
    car().shape = btn.dataset.shape;
    car().adjust = null;
    touchCar();
    persist();
    rerender();
  });

  function onAdjust() {
    car().adjust = {
      top: $("adjTop").value / 100,
      aspect: $("adjHeight").value / 100,
      round: $("adjRound").value / 100,
    };
    touchCar();
    persist();
    render.windshield(svg, car(), selectedId);
  }
  ["adjTop", "adjHeight", "adjRound"].forEach(function (id) { $(id).addEventListener("input", onAdjust); });
  $("adjReset").addEventListener("click", function () {
    car().adjust = null;
    touchCar();
    persist();
    rerender();
  });

  $("wheelLeft").addEventListener("click", function () { car().wheel = "left"; touchCar(); persist(); rerender(); });
  $("wheelRight").addEventListener("click", function () { car().wheel = "right"; touchCar(); persist(); rerender(); });

  $("deleteCar").addEventListener("click", function () {
    if (!confirm(t("confirmDeleteCar"))) return;
    state.cars = state.cars.filter(function (c) { return c.id !== car().id; });
    if (!state.cars.length) state.cars.push(store.newCar(""));
    state.activeCar = state.cars[0].id;
    selectedId = null;
    persist();
    rerender();
  });

  // glass: click to add, drag markers to move
  svg.addEventListener("pointerdown", function (e) {
    var markerEl = e.target.closest(".marker");
    if (markerEl) {
      selectedId = markerEl.dataset.id;
      drag = { id: selectedId, moved: false };
      svg.setPointerCapture(e.pointerId);
      rerender();
      e.preventDefault();
    }
  });

  svg.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var k = chipById(drag.id);
    if (!k) return;
    var box = render.clientToBox(svg, car(), e.clientX, e.clientY);
    var pos = shapes.boxToChip(shapes.paramsFor(car()), box.x, box.y);
    k.x = pos.x; k.y = pos.y;
    drag.moved = true;
    render.windshield(svg, car(), selectedId);
  });

  svg.addEventListener("pointerup", function (e) {
    if (drag) {
      if (drag.moved) {
        var k = chipById(drag.id);
        if (k) k.up = store.now();
        persist();
      }
      drag = null;
      suppressClick = true;
      rerender();
    }
  });

  svg.addEventListener("click", function (e) {
    if (suppressClick) { suppressClick = false; return; }
    if (e.target.closest(".marker")) return; // handled via pointerdown
    var box = render.clientToBox(svg, car(), e.clientX, e.clientY);
    if (!render.onGlass(car(), box)) { selectedId = null; rerender(); return; }
    var p = shapes.paramsFor(car());
    var pos = shapes.boxToChip(p, box.x, box.y);
    var chip = store.newChip(pos);
    chip.fov = shapes.suggestFov(p, chip, car().wheel);
    car().chips.push(chip);
    selectedId = chip.id;
    persist();
    rerender();
  });

  $("chipTable").addEventListener("click", function (e) {
    var row = e.target.closest("tr[data-id]");
    if (!row) return;
    selectedId = row.dataset.id === selectedId ? null : row.dataset.id;
    rerender();
  });

  $("chipSize").addEventListener("change", function () { updateChip({ size: this.value }); });
  $("chipStatus").addEventListener("change", function () { updateChip({ status: this.value }); });
  $("chipFov").addEventListener("change", function () { updateChip({ fov: this.checked }); });
  $("chipFound").addEventListener("change", function () { updateChip({ found: this.value }); });
  $("chipNote").addEventListener("change", function () { updateChip({ note: this.value }); });
  $("chipRepairedAt").addEventListener("change", function () { updateChip({ repairedAt: this.value }); });
  $("chipRepairedBy").addEventListener("change", function () { updateChip({ repairedBy: this.value }); });
  $("chipInsurance").addEventListener("change", function () {
    updateChip({ insurance: this.checked, insuranceAt: this.checked ? (chipById(selectedId).insuranceAt || new Date().toISOString().slice(0, 10)) : "" });
  });
  $("chipInsuranceAt").addEventListener("change", function () { updateChip({ insuranceAt: this.value }); });

  $("deleteChip").addEventListener("click", function () {
    if (!confirm(t("confirmDeleteChip"))) return;
    car().chips = car().chips.filter(function (k) { return k.id !== selectedId; });
    selectedId = null;
    touchCar();
    persist();
    rerender();
  });
  $("closeDetail").addEventListener("click", function () { selectedId = null; rerender(); });

  // ---------- share ----------

  function flash(btn, key) {
    var old = btn.textContent;
    btn.textContent = t(key);
    setTimeout(function () { btn.textContent = old; rerender(); }, 1200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      var ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      ta.remove();
      return ok;
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
    a.download = "shieldchipii-" + new Date().toISOString().slice(0, 10) + ".json";
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
    $("importMerge").onclick = function () {
      state = store.merge(state, incoming);
      finishImport();
    };
    $("importReplace").onclick = function () {
      incoming.activeCar = incoming.cars[0].id;
      state = incoming;
      finishImport();
    };
    $("importCancel").onclick = function () { $("importOverlay").hidden = true; };
    function finishImport() {
      $("importOverlay").hidden = true;
      selectedId = null;
      if (!state.cars.some(function (c) { return c.id === state.activeCar; })) state.activeCar = state.cars[0].id;
      persist();
      rerender();
    }
  }

  async function handleHash() {
    var hash = location.hash;
    if (!/^#[ij]:/.test(hash)) return;
    history.replaceState(null, "", location.pathname + location.search);
    try {
      showImportDialog(await share.decodeToken(hash));
    } catch (e) {
      alert(t("importBroken"));
    }
  }

  window.addEventListener("hashchange", handleHash);

  // ---------- boot ----------
  rerender();
  handleHash();
})();
