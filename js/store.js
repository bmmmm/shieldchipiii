/* shieldchipiii — state, localStorage persistence, merge. */
(function () {
  "use strict";
  var KEY = "shieldchipiii.v1";

  function now() { return new Date().toISOString(); }
  function uid(prefix) {
    if (window.crypto && crypto.randomUUID) return prefix + crypto.randomUUID().slice(0, 8);
    return prefix + Math.random().toString(36).slice(2, 10);
  }

  function newChip(pos) {
    return {
      id: uid("k_"), x: pos.x, y: pos.y,
      status: "new", size: "c10", fov: false,
      found: new Date().toISOString().slice(0, 10),
      repairedAt: "", repairedBy: "", insurance: false, insuranceAt: "",
      note: "", up: now(),
    };
  }

  function newCar(name) {
    return { id: uid("c_"), name: name || "", shape: "sedan", adjust: null, wheel: "left", chips: [], up: now() };
  }

  function defaultState() {
    var car = newCar("");
    return { v: 1, cars: [car], activeCar: car.id };
  }

  function sanitize(state) {
    if (!state || state.v !== 1 || !Array.isArray(state.cars)) return null;
    state.cars = state.cars.filter(function (c) { return c && c.id; });
    state.cars.forEach(function (c) {
      if (!Array.isArray(c.chips)) c.chips = [];
      c.chips = c.chips.filter(function (k) { return k && k.id && typeof k.x === "number" && typeof k.y === "number"; });
    });
    if (!state.cars.length) return null;
    return state;
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = sanitize(JSON.parse(raw));
        if (parsed) return parsed;
      }
    } catch (e) { /* corrupted or private mode — start fresh */ }
    return defaultState();
  }

  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  function activeCar(state) {
    return state.cars.find(function (c) { return c.id === state.activeCar; }) || state.cars[0];
  }

  // Merge remote into local: union by id, newer `up` timestamp wins per entity.
  function merge(local, remote) {
    remote.cars.forEach(function (rc) {
      var lc = local.cars.find(function (c) { return c.id === rc.id; });
      if (!lc) { local.cars.push(rc); return; }
      if ((rc.up || "") > (lc.up || "")) {
        ["name", "shape", "adjust", "wheel", "up"].forEach(function (f) { lc[f] = rc[f]; });
      }
      rc.chips.forEach(function (rk) {
        var idx = lc.chips.findIndex(function (k) { return k.id === rk.id; });
        if (idx === -1) lc.chips.push(rk);
        else if ((rk.up || "") > (lc.chips[idx].up || "")) lc.chips[idx] = rk;
      });
    });
    return local;
  }

  window.SC = window.SC || {};
  window.SC.store = {
    KEY: KEY, load: load, save: save, sanitize: sanitize,
    newChip: newChip, newCar: newCar, defaultState: defaultState,
    activeCar: activeCar, merge: merge, now: now,
  };
})();
