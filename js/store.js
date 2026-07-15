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
      size: "c10",
      events: [logic.makeEvent("new", today)],
      gone: {},
      up: now(),
    };
  }

  // The country decides which repair criteria apply (sources.js), so a second
  // car inherits it from the one in hand — nobody owns two cars in two
  // countries often enough to retype it, and the guess is visible and editable.
  function newCar(name, country) {
    return {
      id: logic.uid("c_"), name: name || "", shape: "sedan", adjust: null, wheel: "left",
      country: country || guessCountry(), chips: [], gone: {}, up: now(),
    };
  }

  // First run only: the browser's region is a better opening bid than pinning
  // everyone to Germany, and it's one dropdown away from being corrected.
  function guessCountry() {
    var sources = window.SC.sources;
    try {
      var loc = new Intl.Locale(navigator.language);
      var region = (loc.region || "").toLowerCase();
      if (sources.has(region)) return region;
    } catch (e) { /* no Intl.Locale, or a language tag without a region */ }
    return sources.DEFAULT;
  }

  function defaultState() {
    var car = newCar("");
    return { v: 1, cars: [car], activeCar: car.id, gone: {} };
  }

  // Vet a whole state — from localStorage, a file, or a share link. The cars
  // themselves are vetted by logic.normalizeCars (shared with the CLI); only
  // the wrapper around them is this module's business.
  function sanitize(state) {
    if (!state || state.v !== 1) return null;
    var cars = logic.normalizeCars(state.cars);
    if (!cars.length) return null;
    return { v: 1, cars: cars, activeCar: state.activeCar, gone: logic.cleanGone(state.gone) };
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

  // Two devices' tombstone maps reconcile to the newest deletion per id.
  function unionGone(a, b) {
    var out = {};
    [a || {}, b || {}].forEach(function (m) {
      Object.keys(m).forEach(function (id) { if (!out[id] || m[id] > out[id]) out[id] = m[id]; });
    });
    return out;
  }

  // A tombstone outranks an entity only when strictly newer than its last touch
  // — a tie leaves the entity standing, the same "existing wins" rule the field
  // merges use.
  function tombNewer(ts, up) { return (ts || "") > (up || ""); }

  // A tombstone an entity has since outlived (re-edited after the deletion
  // elsewhere) is stale — drop it so a later merge can't read it as a fresh kill.
  function heal(gone, id, up) { if (gone[id] && (up || "") > gone[id]) delete gone[id]; }

  // Merge remote into local: union by id, newer `up` wins per entity, chip
  // events unioned by event id so a timeline never loses history — unless an
  // event was deliberately deleted. Deletions travel as tombstones (state.gone
  // -> carId, car.gone -> chipId, chip.gone -> eventId): a newer
  // tombstone blocks a stale remote copy from resurrecting and buries a local
  // entity the other device has since deleted. Returns { state, stats }, where
  // state is `local` mutated in place and stats feed the import summary.
  function merge(local, remote) {
    var stats = { cars: 0, added: 0, updated: 0, events: 0, blocked: 0, removed: 0 };

    // (a) Reconcile what's been deleted before deciding what to keep.
    local.gone = unionGone(local.gone, remote.gone);

    remote.cars.forEach(function (rc) {
      var lc = local.cars.find(function (c) { return c.id === rc.id; });
      if (!lc) {
        // (b) A car we buried must not return via an older remote copy.
        if (tombNewer(local.gone[rc.id], rc.up)) { stats.blocked++; return; }
        local.cars.push(rc);
        stats.cars++;
        return;
      }
      lc.gone = unionGone(lc.gone, rc.gone);
      if ((rc.up || "") > (lc.up || "")) {
        ["name", "shape", "adjust", "wheel", "country", "up"].forEach(function (f) { lc[f] = rc[f]; });
      }
      rc.chips.forEach(function (rk) {
        var lk = lc.chips.find(function (k) { return k.id === rk.id; });
        if (!lk) {
          if (tombNewer(lc.gone[rk.id], rk.up)) { stats.blocked++; return; }
          lc.chips.push(rk);
          stats.added++;
          return;
        }
        lk.gone = unionGone(lk.gone, rk.gone);
        if ((rk.up || "") > (lk.up || "")) {
          ["x", "y", "size", "up"].forEach(function (f) { lk[f] = rk[f]; });
          stats.updated++;
        }
        var seen = {};
        (lk.events || []).forEach(function (e) { seen[e.id] = true; });
        (rk.events || []).forEach(function (e) {
          if (seen[e.id]) return;
          // An event carries no `up` to outlive a tombstone with — deleted is final.
          if (lk.gone[e.id]) { stats.blocked++; return; }
          lk.events.push(e);
          stats.events++;
        });
      });
    });

    // (c)+(d) Apply the reconciled tombstones to what's local now: bury what a
    // newer tombstone deletes, heal a tombstone a newer edit has outlived.
    var activeGone = false;
    local.cars = local.cars.filter(function (lc) {
      if (tombNewer(local.gone[lc.id], lc.up)) {
        if (lc.id === local.activeCar) activeGone = true;
        stats.removed++;
        return false;
      }
      heal(local.gone, lc.id, lc.up);
      lc.gone = lc.gone || {};
      lc.chips = lc.chips.filter(function (lk) {
        if (tombNewer(lc.gone[lk.id], lk.up)) { stats.removed++; return false; }
        heal(lc.gone, lk.id, lk.up);
        lk.gone = lk.gone || {};
        lk.events = (lk.events || []).filter(function (e) {
          if (lk.gone[e.id]) { stats.removed++; return false; }
          return true;
        });
        // Two devices can each delete a different event until none is left; a
        // chip always keeps a timeline (normalizeChip's guarantee, held here too).
        if (!lk.events.length) lk.events.push(logic.makeEvent("new", now().slice(0, 10)));
        return true;
      });
      return true;
    });

    // deleteCar's guarantee, held through a merge too: never car-less, never
    // pointing at a car that's gone.
    if (!local.cars.length) local.cars.push(newCar(""));
    if (activeGone || !local.cars.some(function (c) { return c.id === local.activeCar; })) {
      local.activeCar = local.cars[0].id;
    }

    return { state: local, stats: stats };
  }

  window.SC = window.SC || {};
  window.SC.store = {
    KEY: KEY, load: load, save: save, sanitize: sanitize,
    newChip: newChip, newCar: newCar, defaultState: defaultState,
    activeCar: activeCar, merge: merge, now: now,
  };
})();
