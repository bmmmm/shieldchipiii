/* shieldchipiii — status model, event timeline, repair recommendation.
 * Shared by browser and CLI (UMD-ish). Pure data logic, no DOM, no i18n:
 * everything returns keys that i18n.js / the CLI turn into text. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.logic = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Event types that set the marker's current status, in lifecycle order.
  // Replacing the whole windshield is a vehicle-level action, not a per-chip
  // status — so "replaced" is intentionally not here.
  var STATUS_TYPES = ["new", "observing", "repair_planned", "repaired", "irreparable"];
  // Neutral events — recorded in the timeline but don't change the status.
  var NEUTRAL_TYPES = ["insurance_reported", "note"];
  var ALL_TYPES = STATUS_TYPES.concat(NEUTRAL_TYPES);

  // Terminal glyph per current status (also drives the SVG marker class).
  var STATUS_SYMBOL = {
    new: "o", observing: "?", repair_planned: "@", repaired: "*", irreparable: "X",
  };
  var SIZES = ["c10", "c50", "e2", "crackS", "crackM", "crackL"];

  function isCrack(size) { return /^crack/.test(size || ""); }

  function currentStatus(chip) {
    var events = (chip && chip.events) || [];
    for (var i = events.length - 1; i >= 0; i--) {
      if (STATUS_TYPES.indexOf(events[i].type) !== -1) return events[i].type;
    }
    return "new";
  }

  // Chronological timeline (stable sort by date, then insertion order).
  function timeline(chip) {
    var events = ((chip && chip.events) || []).slice();
    return events
      .map(function (e, i) { return { e: e, i: i }; })
      .sort(function (a, b) {
        var d = (a.e.date || "").localeCompare(b.e.date || "");
        return d !== 0 ? d : a.i - b.i;
      })
      .map(function (w) { return w.e; });
  }

  function lastEventOfType(chip, type) {
    var t = timeline(chip);
    for (var i = t.length - 1; i >= 0; i--) if (t[i].type === type) return t[i];
    return null;
  }

  function insuranceReported(chip) { return !!lastEventOfType(chip, "insurance_reported"); }

  // Where the repair criteria come from, so the UI can link them.
  var SOURCES = { carglass: "https://www.carglass.de/steinschlag-reparatur" };
  // Advice taken from those published criteria — as opposed to the
  // status-driven advice below, which is our own and gets no citation.
  var SOURCED_KEYS = ["recRepairable", "recReplaceFov", "recReplaceEdge", "recReplaceCrack"];

  // Repair recommendation from current status + geometry + size, following the
  // criteria glass shops use (Carglass): outside the driver's field of view,
  // smaller than a 2-euro coin, and more than 10 cm from the edge.
  // Returns { key, level, source? } — key is an i18n key, level ∈ ok|warn|danger
  // drives color, source is a SOURCES id when the rule is someone else's.
  function recommend(chip, opts) {
    var rec = advise(chip, opts);
    if (SOURCED_KEYS.indexOf(rec.key) !== -1) rec.source = "carglass";
    return rec;
  }

  // `opts.inMargin` / `opts.inFov` are the caller's geometry checks (shapes.js)
  // — geometry lives there, so it's passed in rather than imported here. Both
  // are derived from the chip's position, never user-set flags.
  function advise(chip, opts) {
    var status = currentStatus(chip);
    if (status === "repaired") return { key: "recWatchRepair", level: "ok" };
    if (status === "irreparable") return { key: "recIrreparable", level: "danger" };
    if (status === "repair_planned") return { key: "recPlanned", level: "warn" };

    // new / observing: decide reparability from position + size.
    if (opts && opts.inMargin) return { key: "recReplaceEdge", level: "danger" };
    if (opts && opts.inFov) return { key: "recReplaceFov", level: "danger" };
    // Any crack means replacement, regardless of length — shops don't repair
    // cracks at all, so the crack sizes only grade the marker, not the advice.
    if (isCrack(chip.size)) return { key: "recReplaceCrack", level: "danger" };
    return { key: "recRepairable", level: "ok" }; // chip up to a 2-euro coin, outside FOV, off the rim
  }

  function uid(prefix) {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return prefix + crypto.randomUUID().slice(0, 8);
    return prefix + Math.random().toString(36).slice(2, 10);
  }

  function makeEvent(type, date, extra) {
    var ev = { id: uid("e_"), type: type, date: date };
    if (extra && extra.note) ev.note = extra.note;
    if (extra && extra.where) ev.where = extra.where;
    return ev;
  }

  // Migrate a legacy v1 chip (flat status/found/repaired*/insurance*/note)
  // into the event-timeline shape. Idempotent: a chip that already has
  // `events` is returned untouched.
  function migrateChip(chip) {
    if (chip.events && Array.isArray(chip.events)) return chip;
    var events = [];
    var found = chip.found || (chip.up ? String(chip.up).slice(0, 10) : "");
    events.push(makeEvent("new", found));
    if (chip.insurance) events.push(makeEvent("insurance_reported", chip.insuranceAt || found));
    if (chip.status === "repaired") {
      events.push(makeEvent("repaired", chip.repairedAt || found, { where: chip.repairedBy || "" }));
    }
    if (chip.note) events.push(makeEvent("note", found, { note: chip.note }));
    // No fov here: it used to be a stored flag, but it's derived from the
    // position now (shapes.inFov), so a legacy value is simply dropped.
    return {
      id: chip.id, x: chip.x, y: chip.y,
      size: chip.size || "c10",
      events: events, up: chip.up || "",
    };
  }

  return {
    STATUS_TYPES: STATUS_TYPES, NEUTRAL_TYPES: NEUTRAL_TYPES, ALL_TYPES: ALL_TYPES,
    STATUS_SYMBOL: STATUS_SYMBOL, SIZES: SIZES, SOURCES: SOURCES,
    isCrack: isCrack, currentStatus: currentStatus, timeline: timeline,
    lastEventOfType: lastEventOfType, insuranceReported: insuranceReported,
    recommend: recommend, makeEvent: makeEvent, migrateChip: migrateChip, uid: uid,
  };
});
