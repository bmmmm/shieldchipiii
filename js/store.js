/* shieldchipiii — state, localStorage persistence, merge. */
(function () {
  "use strict";
  var logic = window.SC.logic;
  var KEY = "shieldchipiii.v1";

  function now() { return new Date().toISOString(); }

  function newChip(pos) {
    var today = new Date().toISOString().slice(0, 10);
    return {
      id: logic.uid("k_"), x: pos.x, y: pos.y,
      size: "c10", fov: false,
      events: [logic.makeEvent("new", today)],
      up: now(),
    };
  }

  function newCar(name) {
    return { id: logic.uid("c_"), name: name || "", shape: "sedan", adjust: null, wheel: "left", chips: [], up: now() };
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
      c.chips = c.chips
        .filter(function (k) { return k && k.id && typeof k.x === "number" && typeof k.y === "number"; })
        .map(function (k) {
          var m = logic.migrateChip(k);
          if (!Array.isArray(m.events) || !m.events.length) {
            m.events = [logic.makeEvent("new", new Date().toISOString().slice(0, 10))];
          }
          return m;
        });
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

  // Merge remote into local: union by id, newer `up` wins per entity. Chip
  // events are unioned by event id so a timeline never loses history on merge.
  function merge(local, remote) {
    remote.cars.forEach(function (rc) {
      var lc = local.cars.find(function (c) { return c.id === rc.id; });
      if (!lc) { local.cars.push(rc); return; }
      if ((rc.up || "") > (lc.up || "")) {
        ["name", "shape", "adjust", "wheel", "up"].forEach(function (f) { lc[f] = rc[f]; });
      }
      rc.chips.forEach(function (rk) {
        var lk = lc.chips.find(function (k) { return k.id === rk.id; });
        if (!lk) { lc.chips.push(rk); return; }
        if ((rk.up || "") > (lk.up || "")) {
          ["x", "y", "size", "fov", "up"].forEach(function (f) { lk[f] = rk[f]; });
        }
        var seen = {};
        (lk.events || []).forEach(function (e) { seen[e.id] = true; });
        (rk.events || []).forEach(function (e) { if (!seen[e.id]) lk.events.push(e); });
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
