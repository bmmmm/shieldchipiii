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

  // The status is the chronologically latest status event — the same order the
  // timeline shows. Reading insertion order instead would let a backdated event
  // added last override a newer one, and a merge (which appends remote events)
  // would silently reinstate whatever the other device happened to send last.
  function currentStatus(chip) {
    var events = timeline(chip);
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

  // When the chip was found — the "new" event's date, not merely the earliest
  // one: a note backdated below the find must not rewrite the find date.
  function foundDate(chip) {
    var ev = lastEventOfType(chip, "new");
    return (ev && ev.date) || "";
  }

  // Advice taken from the shop's published criteria — as opposed to the
  // status-driven advice below, which is our own and gets no citation. The URL
  // itself lives in sources.js, keyed by country: the caller resolves it, so
  // this module stays free of both the country and the link.
  var SOURCED_KEYS = ["recRepairable", "recReplaceFov", "recReplaceEdge", "recReplaceCrack"];

  // Chips whose repair-or-replace question is still open. A repaired one has
  // answered it, and an irreparable one already forces a replacement by itself
  // — counting either against the cap would double-report a settled case.
  var PENDING = ["new", "observing", "repair_planned"];

  function pendingCount(car) {
    return ((car && car.chips) || []).filter(function (k) {
      return PENDING.indexOf(currentStatus(k)) !== -1;
    }).length;
  }

  // The pane against the country's published cap on how many chips it still
  // repairs. null when that country publishes no number, or we're under it —
  // the count only becomes worth saying once it can change the outcome.
  // maxChips comes from the caller (sources.js) for the same reason the edge
  // margin does: this module doesn't know about countries.
  function chipLoad(car, maxChips) {
    if (!maxChips) return null;
    var count = pendingCount(car);
    if (count < maxChips) return null;
    return {
      key: count > maxChips ? "loadOver" : "loadAt",
      level: count > maxChips ? "danger" : "warn",
      count: count, max: maxChips, sourced: true,
    };
  }

  // Repair recommendation from current status + geometry + size, following the
  // criteria glass shops use (Carglass): outside the driver's field of view,
  // smaller than a 2-euro coin, and clear of the edge by the country's margin.
  // Returns { key, level, sourced } — key is an i18n key, level ∈ ok|warn|danger
  // drives color, sourced marks advice that a shop's page backs.
  function recommend(chip, opts) {
    var rec = advise(chip, opts);
    if (SOURCED_KEYS.indexOf(rec.key) !== -1) rec.sourced = true;
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

  // ---------- untrusted input ----------
  // A share link, a JSON import and a hand-edited file are all just someone
  // else's JSON. Everything below is the one gate it passes through, so the
  // browser and the CLI agree on what a chip may contain. Renderers escape on
  // top of this; keeping junk out of the model is what stops it reaching them.

  var DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  // Field caps match the input maxlengths in the UI.
  var MAX = { id: 40, name: 40, note: 200, where: 60, up: 30, shape: 20, country: 2 };

  function cleanText(s, max) {
    if (typeof s !== "string") return "";
    // Control characters break the CLI's table and can smuggle terminal escapes.
    return s.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max);
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  // Drop what we can't vouch for: unknown types and junk dates. A missing id
  // gets a fresh one rather than dropping the event with it.
  function cleanEvent(ev) {
    if (!ev || typeof ev !== "object" || ALL_TYPES.indexOf(ev.type) === -1) return null;
    var out = {
      id: cleanText(ev.id, MAX.id) || uid("e_"),
      type: ev.type,
      date: DATE_RE.test(ev.date) ? ev.date : "",
    };
    var note = cleanText(ev.note, MAX.note);
    var where = cleanText(ev.where, MAX.where);
    if (note) out.note = note;
    if (where) out.where = where;
    return out;
  }

  // A legacy v1 chip stored its history in flat fields — unfold them into events.
  function legacyEvents(chip) {
    var found = cleanText(chip.found, 10) || cleanText(chip.up, 10);
    var events = [makeEvent("new", found)];
    if (chip.insurance) events.push(makeEvent("insurance_reported", chip.insuranceAt || found));
    if (chip.status === "repaired") {
      events.push(makeEvent("repaired", chip.repairedAt || found, { where: chip.repairedBy || "" }));
    }
    if (chip.note) events.push(makeEvent("note", found, { note: chip.note }));
    return events;
  }

  // Any chip — legacy v1, current, or straight off a share link — into the
  // canonical shape. Returns null for a chip with no usable position: that one
  // can't be drawn or measured, so there is nothing to keep.
  // No fov: it used to be a stored flag but is derived from the position now
  // (shapes.inFov), so a legacy value is simply dropped.
  function normalizeChip(chip) {
    if (!chip || typeof chip !== "object") return null;
    if (!isFinite(chip.x) || !isFinite(chip.y)) return null;
    var raw = Array.isArray(chip.events) ? chip.events : legacyEvents(chip);
    var events = raw.map(cleanEvent).filter(Boolean);
    if (!events.length) events = [makeEvent("new", today())];
    return {
      id: cleanText(chip.id, MAX.id) || uid("k_"),
      x: clamp01(chip.x), y: clamp01(chip.y),
      size: SIZES.indexOf(chip.size) !== -1 ? chip.size : "c10",
      events: events,
      gone: cleanGone(chip.gone),
      up: cleanText(chip.up, MAX.up),
    };
  }

  function clamp01(v) { return Math.min(1, Math.max(0, Number(v))); }

  // A tombstone map — chip id or car id -> ISO deletion time — is as untrusted
  // as everything else off a share link. Keep only string ids and string stamps
  // within the same caps the fields use, and drop the rest outright: a truncated
  // id would match no entity and haunt every future merge. Always a plain map.
  function cleanGone(gone) {
    if (!gone || typeof gone !== "object" || Array.isArray(gone)) return {};
    var out = {};
    Object.keys(gone).forEach(function (id) {
      var ts = gone[id];
      if (id.length <= MAX.id && typeof ts === "string" && ts.length <= MAX.up) out[id] = ts;
    });
    return out;
  }

  // Shape/adjust aren't checked here — geometry belongs to shapes.js, and
  // paramsFor() clamps every value it takes from `adjust` anyway. Country is
  // the same deal: sources.normalize() decides what's a country we have
  // criteria for, so an unknown code survives the trip and falls back on read.
  function normalizeCar(car) {
    if (!car || typeof car !== "object" || !car.id) return null;
    return {
      id: cleanText(car.id, MAX.id),
      name: cleanText(car.name, MAX.name),
      shape: cleanText(car.shape, MAX.shape) || "sedan",
      adjust: car.adjust && typeof car.adjust === "object" ? car.adjust : null,
      wheel: car.wheel === "right" ? "right" : "left",
      country: cleanText(car.country, MAX.country).toLowerCase(),
      chips: (Array.isArray(car.chips) ? car.chips : []).map(normalizeChip).filter(Boolean),
      gone: cleanGone(car.gone),
      up: cleanText(car.up, MAX.up),
    };
  }

  function normalizeCars(cars) {
    return (Array.isArray(cars) ? cars : []).map(normalizeCar).filter(Boolean);
  }

  return {
    STATUS_TYPES: STATUS_TYPES, NEUTRAL_TYPES: NEUTRAL_TYPES, ALL_TYPES: ALL_TYPES,
    STATUS_SYMBOL: STATUS_SYMBOL, SIZES: SIZES,
    isCrack: isCrack, currentStatus: currentStatus, timeline: timeline,
    lastEventOfType: lastEventOfType, insuranceReported: insuranceReported,
    foundDate: foundDate, recommend: recommend, makeEvent: makeEvent, uid: uid,
    pendingCount: pendingCount, chipLoad: chipLoad,
    normalizeChip: normalizeChip, normalizeCars: normalizeCars, cleanGone: cleanGone,
  };
});
