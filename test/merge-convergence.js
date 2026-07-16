/* Two devices edit the same logbook offline and then trade share links.
 * The hand-written merge scenarios in smoke.js check known shapes; this one
 * checks the property those shapes stand for: after both devices have pulled
 * from each other, they hold the same data (convergence), pulling again
 * changes nothing (idempotence), and a deleted event never comes back on
 * either side (deleted-is-final). Random operations, deterministic seeds —
 * a failure prints its seed and replays forever.
 *
 * activeCar is excluded from the comparison on purpose: it is UI state, and
 * merge() only touches it to keep it pointing at a car that still exists.
 *
 * Run: node test/merge-convergence.js */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const root = path.join(__dirname, "..");
const sandbox = {
  console,
  navigator: { language: "de-DE" },
  crypto: require("crypto"),
  localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); } },
};
sandbox.window = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
["shapes", "logic", "store"].forEach((m) => {
  vm.runInContext(fs.readFileSync(path.join(root, "js", m + ".js"), "utf8"), sandbox, { filename: m + ".js" });
});
const SC = sandbox.SC;

// xorshift32 — deterministic, dependency-free. Math.random would make a red
// run unreproducible, which is worse than no run at all.
function prng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 0x100000000;
  };
}
const pick = (rnd, arr) => arr[Math.floor(rnd() * arr.length)];

// Unique, strictly ordered timestamps; the two sides never collide, so no
// merge decision ever rides on the local-wins tiebreak — convergence must hold.
let tick = 0;
const ts = (side) => "2026-03-01T00:00:" + String(10 + tick++).padStart(2, "0") + "." + (side === "A" ? "100" : "200") + "Z";
const day = (rnd) => "2026-02-" + String(1 + Math.floor(rnd() * 27)).padStart(2, "0");

let uidN = 0;
const uid = (p) => p + "f" + (uidN++).toString(36);

function baseState() {
  const mkEvent = (id, type, date) => ({ id, type, date });
  const mkChip = (id) => ({
    id, x: 0.4, y: 0.5, size: "c50", up: "2026-01-01T00:00:00.000Z", gone: {},
    events: [mkEvent(id + "e0", "new", "2026-01-05")],
  });
  return {
    v: 1, activeCar: "car0",
    cars: [{
      id: "car0", name: "Golf", shape: "sedan", adjust: null, wheel: "left", country: "de",
      chips: [mkChip("k0"), mkChip("k1")], gone: {}, up: "2026-01-01T00:00:00.000Z",
    }],
    gone: {},
  };
}

// One random edit, the way the app makes them: tombstone before filter,
// up bumped on content changes, the app's own guards respected (an event
// timeline never empties itself, the last car stays).
function mutate(state, rnd, side) {
  const car = pick(rnd, state.cars);
  const op = pick(rnd, ["addChip", "addChip", "addEvent", "addEvent", "editChip", "delEvent", "delChip", "addCar", "delCar"]);
  if (op === "addChip") {
    const id = uid("k");
    car.chips.push({ id, x: rnd(), y: rnd(), size: pick(rnd, SC.logic.SIZES), up: ts(side), gone: {},
      events: [{ id: id + "e0", type: "new", date: day(rnd) }] });
  } else if (op === "addEvent" && car.chips.length) {
    const chip = pick(rnd, car.chips);
    chip.events.push({ id: uid("e"), type: pick(rnd, SC.logic.ALL_TYPES), date: day(rnd) });
    chip.up = ts(side);
  } else if (op === "editChip" && car.chips.length) {
    const chip = pick(rnd, car.chips);
    chip.size = pick(rnd, SC.logic.SIZES);
    chip.up = ts(side);
  } else if (op === "delEvent" && car.chips.length) {
    const chip = pick(rnd, car.chips);
    if (chip.events.length > 1) {
      const ev = pick(rnd, chip.events);
      chip.gone[ev.id] = ts(side);
      chip.events = chip.events.filter((e) => e.id !== ev.id);
    }
  } else if (op === "delChip" && car.chips.length) {
    const chip = pick(rnd, car.chips);
    car.gone[chip.id] = ts(side);
    car.chips = car.chips.filter((k) => k.id !== chip.id);
  } else if (op === "addCar") {
    const id = uid("c");
    state.cars.push({ id, name: "Car " + id, shape: "suv", adjust: null, wheel: "left", country: "de",
      chips: [], gone: {}, up: ts(side) });
  } else if (op === "delCar" && state.cars.length > 1) {
    const victim = pick(rnd, state.cars);
    state.gone[victim.id] = ts(side);
    state.cars = state.cars.filter((c) => c.id !== victim.id);
    if (state.activeCar === victim.id) state.activeCar = state.cars[0].id;
  }
}

const clone = (v) => JSON.parse(JSON.stringify(v));

// Order-free, key-sorted serialization: merge appends in arrival order, and
// arrival order is the one thing the two directions legitimately disagree on.
function canon(v) {
  if (Array.isArray(v)) {
    const items = v.map(canon);
    return "[" + (v.length && v[0] && typeof v[0] === "object" && "id" in v[0] ? items.sort() : items).join(",") + "]";
  }
  if (v && typeof v === "object") {
    return "{" + Object.keys(v).sort().map((k) => JSON.stringify(k) + ":" + canon(v[k])).join(",") + "}";
  }
  return JSON.stringify(v);
}
function fingerprint(state) {
  const s = clone(state);
  delete s.activeCar;
  return canon(s);
}

for (let seed = 1; seed <= 40; seed++) {
  const rnd = prng(seed * 2654435761);
  tick = 0; uidN = seed * 1000;
  const A = baseState(), B = clone(baseState());

  // Which chip an event died on, and where. Event tombstones live inside the
  // chip (chip.gone), so the promise "deleted is final" holds exactly as long
  // as the deleting side still carries that chip into the merge. If it later
  // deletes the whole chip, the tombstones go with it — and a newer edit on
  // the other side revives the chip in *that* side's fassung, event included.
  // That is "newest edit wins per entry" doing its job, not a resurrection bug.
  const deletedEvents = new Map();
  for (let i = 0; i < 18; i++) {
    const side = rnd() < 0.5 ? "A" : "B";
    const st = side === "A" ? A : B;
    const owner = {};
    st.cars.forEach((c) => c.chips.forEach((k) => k.events.forEach((e) => { owner[e.id] = k.id; })));
    const before = new Set(Object.keys(owner));
    mutate(st, rnd, side);
    const after = new Set(st.cars.flatMap((c) => c.chips.flatMap((k) => k.events.map((e) => e.id))));
    before.forEach((id) => { if (!after.has(id)) deletedEvents.set(id, { chip: owner[id], side }); });
  }
  // Keep only deletions whose chip survived on the deleting side — those are
  // the ones whose tombstone actually rides into the merge.
  const chipsLeft = { A: new Set(A.cars.flatMap((c) => c.chips.map((k) => k.id))),
                      B: new Set(B.cars.flatMap((c) => c.chips.map((k) => k.id))) };
  deletedEvents.forEach((v, id) => { if (!chipsLeft[v.side].has(v.chip)) deletedEvents.delete(id); });

  const mergedA = SC.store.merge(clone(A), clone(B)).state;
  const mergedB = SC.store.merge(clone(B), clone(A)).state;

  assert.strictEqual(fingerprint(mergedA), fingerprint(mergedB),
    "seed " + seed + ": after trading both ways the two devices disagree");

  const again = SC.store.merge(clone(mergedA), clone(mergedB)).state;
  assert.strictEqual(fingerprint(again), fingerprint(mergedA),
    "seed " + seed + ": merging the same data twice changed it");

  const survivors = new Set([mergedA, mergedB].flatMap((s) =>
    s.cars.flatMap((c) => c.chips.flatMap((k) => k.events.map((e) => e.id)))));
  deletedEvents.forEach((v, id) => {
    assert.ok(!survivors.has(id), "seed " + seed + ": deleted event " + id + " came back — deleted is final");
  });
}

console.log("merge-convergence: 40 seeds × 18 random edits converge, idempotent, deletions final");
