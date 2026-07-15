/* Headless smoke test: loads the browser modules with stubbed window/localStorage,
 * exercises the event-timeline model, status/recommendation logic, migration,
 * untrusted-input handling, share interop (CompressionStream <-> zlib) and merge.
 *
 * Run: node test/smoke.js     (no deps, no build — same as the app) */
"use strict";
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const zlib = require("zlib");
const assert = require("assert");

const root = path.join(__dirname, "..");

const sandbox = {
  console, TextEncoder, TextDecoder, CompressionStream, DecompressionStream,
  Response, Blob, btoa: (s) => Buffer.from(s, "binary").toString("base64"),
  atob: (s) => Buffer.from(s, "base64").toString("binary"),
  navigator: { language: "de-DE" },
  location: { origin: "http://x", pathname: "/index.html", protocol: "http:" },
  crypto: require("crypto"),
  localStorage: { _d: {}, getItem(k) { return this._d[k] || null; }, setItem(k, v) { this._d[k] = String(v); } },
  setTimeout, clearTimeout,
};
sandbox.window = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);

["shapes", "logic", "ascii", "i18n", "store", "share"].forEach((m) => {
  vm.runInContext(fs.readFileSync(path.join(root, "js", m + ".js"), "utf8"), sandbox, { filename: m + ".js" });
});
const SC = sandbox.SC;

// The escaper the SVG/popup renderers use. render.js needs a DOM, so the test
// mirrors its one pure function to assert on what reaches innerHTML.
const esc = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// Checked by code point rather than a regex literal, so no control character
// has to survive being typed into this file to make the assertion meaningful.
const hasCtrl = (s) => Array.from(String(s))
  .some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127);

(async () => {
  // --- new chip starts with a "new" event ---
  const state = SC.store.defaultState();
  const car = SC.store.activeCar(state);
  car.name = "Golf 7";
  const chip = SC.store.newChip({ x: 0.3, y: 0.5 });
  chip.events[0].date = "2026-07-01"; // pin found date so timeline order is deterministic
  car.chips.push(chip);
  assert.strictEqual(chip.events.length, 1);
  assert.strictEqual(chip.events[0].type, "new");
  assert.strictEqual(SC.logic.currentStatus(chip), "new");

  // --- status follows the latest status event ---
  chip.events.push(SC.logic.makeEvent("observing", "2026-07-10", { note: "growing" }));
  assert.strictEqual(SC.logic.currentStatus(chip), "observing");
  chip.events.push(SC.logic.makeEvent("repaired", "2026-07-20", { where: "Carglass" }));
  assert.strictEqual(SC.logic.currentStatus(chip), "repaired");
  assert.strictEqual(SC.logic.timeline(chip).length, 3);
  assert.strictEqual(SC.logic.timeline(chip)[0].type, "new"); // chronological

  // --- "latest" means by date, not by insertion ---
  // Regression: reading insertion order let an event added last but dated
  // earlier win, so the status contradicted the timeline shown next to it.
  const backdated = { size: "c10", events: [
    { id: "e1", type: "new", date: "2026-07-01" },
    { id: "e2", type: "repaired", date: "2026-07-15" },
    { id: "e3", type: "observing", date: "2026-07-10" }, // entered last, dated earlier
  ] };
  assert.strictEqual(SC.logic.currentStatus(backdated), "repaired",
    "a backdated event must not override a newer one");

  // --- the find date is the "new" event's, not merely the earliest ---
  const backNote = { size: "c10", events: [
    { id: "e1", type: "new", date: "2026-07-01" },
    { id: "e2", type: "note", date: "2026-06-01", note: "backdated" },
  ] };
  assert.strictEqual(SC.logic.foundDate(backNote), "2026-07-01",
    "a note dated before the find must not rewrite the find date");

  // --- neutral event doesn't change status ---
  chip.events.push(SC.logic.makeEvent("insurance_reported", "2026-07-21"));
  assert.strictEqual(SC.logic.currentStatus(chip), "repaired");
  assert.ok(SC.logic.insuranceReported(chip));

  // --- recommendation by status/size/zone (zones come from opts, not the chip) ---
  const c10out = { size: "c10", events: [SC.logic.makeEvent("new", "2026-01-01")] };
  assert.strictEqual(SC.logic.recommend(c10out, { inFov: false }).key, "recRepairable");
  assert.strictEqual(SC.logic.recommend(c10out, { inFov: true }).key, "recReplaceFov");
  // a stale stored fov flag must NOT influence the verdict any more
  assert.strictEqual(SC.logic.recommend({ size: "c10", fov: true, events: c10out.events }, { inFov: false }).key,
    "recRepairable", "stored fov flag is ignored — geometry decides");
  const bigCrack = { size: "crackL", events: [SC.logic.makeEvent("new", "2026-01-01")] };
  assert.strictEqual(SC.logic.recommend(bigCrack).key, "recReplaceCrack");
  const smallCrack = { size: "crackS", events: [SC.logic.makeEvent("new", "2026-01-01")] };
  assert.strictEqual(SC.logic.recommend(smallCrack).key, "recReplaceCrack",
    "every crack goes to replacement, whatever the length");
  const repaired = { size: "c10", events: [SC.logic.makeEvent("new", "2026-01-01"), SC.logic.makeEvent("repaired", "2026-02-01")] };
  assert.strictEqual(SC.logic.recommend(repaired).level, "ok");

  // --- advice we took from a shop carries its source; our own doesn't ---
  assert.strictEqual(SC.logic.recommend(c10out, { inFov: true }).source, "carglass");
  assert.ok(SC.logic.SOURCES.carglass, "the source id resolves to a URL");
  assert.strictEqual(SC.logic.recommend(repaired).source, undefined,
    "status-driven advice is ours and stays uncited");

  // --- untrusted input: a share link is just someone else's JSON ---
  // Regression: a hostile payload reached the popup's innerHTML unescaped.
  const CTRL = String.fromCharCode(27) + "[2J" + String.fromCharCode(0);
  const hostile = SC.logic.normalizeChip({
    id: "k_evil", x: 0.5, y: 0.5, size: "c10",
    events: [
      { id: "e_1", type: "note", date: '<img src=x onerror="alert(1)">' },
      { id: "e_2", type: 'note" onmouseover="alert(1)', date: "2026-07-01" },
      { id: "e_3", type: "note", date: "2026-07-01", note: "clean" + CTRL + "junk" },
      "not an object",
      null,
    ],
  });
  assert.strictEqual(hostile.events.length, 2, "unknown event types are dropped, junk entries too");
  assert.strictEqual(hostile.events[0].date, "", "a date that isn't a date is dropped");
  assert.ok(!hostile.events.some((e) => /[<>"]/.test(e.type)), "no markup survives in a type");
  assert.ok(!hasCtrl(hostile.events[1].note), "control characters are stripped");
  // and what does reach a renderer is escaped on the way out
  assert.ok(!esc('<img src=x onerror="alert(1)">').includes("<img"), "renderer escaping holds");

  assert.strictEqual(SC.logic.normalizeChip({ id: "k", size: "c10" }), null, "a chip with no position is dropped");
  assert.strictEqual(SC.logic.normalizeChip({ id: "k", x: "left", y: 0.5 }), null, "x must be a number");
  assert.strictEqual(SC.logic.normalizeChip({ id: "k", x: 0.5, y: 0.5, size: "xxl" }).size, "c10",
    "an unknown size falls back rather than reaching the renderer");
  assert.strictEqual(SC.logic.normalizeChip({ id: "k", x: 5, y: -3, size: "c10" }).x, 1, "position is clamped");
  assert.ok(SC.logic.normalizeChip({ id: "k", x: 0.5, y: 0.5, size: "c10", events: [] }).events.length === 1,
    "a chip with no usable events still gets a find event");

  const cars = SC.logic.normalizeCars([
    { id: "c1", name: "Golf" + CTRL + "7", wheel: "sideways", chips: [] },
    { name: "no id" },
    null,
  ]);
  assert.strictEqual(cars.length, 1, "vehicles without an id are dropped");
  assert.ok(!hasCtrl(cars[0].name), "control characters are stripped from a name");
  assert.strictEqual(cars[0].wheel, "left", "an unknown wheel side falls back to left");
  // hyphens and spaces are ordinary text and must survive
  assert.strictEqual(SC.logic.normalizeCars([{ id: "c", name: "Golf-7 GTI", chips: [] }])[0].name, "Golf-7 GTI");

  // --- bottom-edge param: narrower bottom keeps chip<->box roundtrip stable ---
  const sh = SC.shapes;
  const narrow = { top: 0.6, bottom: 0.6, aspect: 0.36, round: 0.1, bow: 0.07 };
  const full = { top: 0.6, bottom: 1.0, aspect: 0.36, round: 0.1, bow: 0.07 };
  // near the bottom edge the glass is narrower when bottom < 1
  const eN = sh.edgesAt(narrow, 0.85), eF = sh.edgesAt(full, 0.85);
  assert.ok((eN.right - eN.left) < (eF.right - eF.left), "bottom<1 narrows the lower glass");
  // a row-relative chip roundtrips through box space under the narrow shape
  const rc = { x: 0.4, y: 0.8 };
  const box = sh.chipToBox(narrow, rc);
  const back = sh.boxToChip(narrow, box.x, box.y);
  assert.ok(Math.abs(back.x - rc.x) < 1e-9 && Math.abs(back.y - rc.y) < 1e-9, "chip<->box roundtrip (narrow bottom)");
  // default bottom (unset) behaves like 1.0 — unchanged from before
  const eDefault = sh.edgesAt({ top: 0.6, aspect: 0.36, round: 0.1, bow: 0.07 }, 0.85);
  assert.ok(Math.abs((eDefault.right - eDefault.left) - (eF.right - eF.left)) < 1e-9, "unset bottom == 1.0");

  // --- adjust values off a share link can't poison the geometry ---
  const poisoned = sh.paramsFor({ shape: "sedan", adjust: { top: "wide", aspect: null, widthCm: {}, bow: NaN } });
  Object.keys(poisoned).forEach((k) => {
    assert.ok(isFinite(poisoned[k]), k + " stays a real number despite junk in adjust");
  });

  // --- presets read as seen from the driver's seat, not from outside ---
  // The top edge is the NEAR one (roof line, nearly overhead), the bottom edge
  // the FAR one (end of the bonnet) — so perspective widens the top. Panes look
  // close to rectangular from inside, never strongly bottom-heavy.
  sh.PRESET_ORDER.forEach(function (key) {
    const q = sh.paramsFor({ shape: key });
    const ratio = q.top / q.bottom;
    assert.ok(ratio > 0.9 && ratio < 1.35, key + " is near-rectangular (ratio " + ratio.toFixed(2) + ")");
  });
  const sportR = (p2 => p2.top / p2.bottom)(sh.paramsFor({ shape: "sport" }));
  const vanR = (p2 => p2.top / p2.bottom)(sh.paramsFor({ shape: "van" }));
  assert.ok(sportR > vanR, "flatter screen (sport) leans wider at the top than the steep van");
  assert.ok(sh.paramsFor({ shape: "sedan" }).top >= sh.paramsFor({ shape: "sedan" }).bottom,
    "sedan is not bottom-heavy — that was the inverted-perspective bug");

  // --- 10 cm edge margin (real centimetres, not picture fractions) ---
  const sedan = sh.paramsFor({ shape: "sedan" });
  assert.strictEqual(sh.MARGIN_CM, 10);
  assert.ok(sedan.widthCm > 100 && sedan.heightCm > 50, "preset carries a real size");
  // centre of the pane is far from every edge
  const centre = { x: 0.5, y: 0.5 };
  assert.ok(sh.edgeDistanceCm(sedan, centre) > 20, "centre is clear of the rim");
  assert.strictEqual(sh.inMargin(sedan, centre), false);
  // hard against the left edge -> in the margin
  const atLeft = { x: 0.01, y: 0.5 };
  assert.ok(sh.edgeDistanceCm(sedan, atLeft) < 10, "chip at the rim is within 10 cm");
  assert.strictEqual(sh.inMargin(sedan, atLeft), true);
  // near the bottom edge: vertical cm are foreshortened, so a chip that looks
  // equally close vertically must still be judged in real cm
  assert.strictEqual(sh.inMargin(sedan, { x: 0.5, y: 0.995 }), true, "chip at the bottom rim");
  assert.strictEqual(sh.inMargin(sedan, { x: 0.5, y: 0.75 }), false, "well above the bottom rim");
  // the same fraction is a different real distance on a narrower pane —
  // this is the "10 cm is more on some panes, less on others" case
  const wide = sh.paramsFor({ shape: "sedan", adjust: { widthCm: 190 } });
  const narrowPane = sh.paramsFor({ shape: "sedan", adjust: { widthCm: 110 } });
  const probe = { x: 0.08, y: 0.5 };
  assert.ok(sh.edgeDistanceCm(wide, probe) > sh.edgeDistanceCm(narrowPane, probe),
    "same relative spot is further from the edge on a wider pane");
  // margin inset stays inside the glass
  sh.marginInset(sedan).forEach(function (q) {
    assert.ok(q[0] > -0.5 && q[0] < 1.5 && q[1] > -0.5 && q[1] < 1.5, "inset point sane");
  });

  // --- 29 cm field of view scales with the real width ---
  assert.strictEqual(sh.FOV_CM, 29);
  const bandS = sh.fovBand(sedan, "left");
  const bandCm = (bandS.to - bandS.from) * sedan.widthCm;
  assert.ok(Math.abs(bandCm - 29) < 0.01, "FOV band is 29 real cm");
  const bandNarrow = sh.fovBand(narrowPane, "left");
  assert.ok((bandNarrow.to - bandNarrow.from) > (bandS.to - bandS.from),
    "29 cm covers a larger fraction of a narrow pane");
  // band is centred on the wheel
  assert.ok(Math.abs((bandS.from + bandS.to) / 2 - sh.wheelX("left")) < 1e-9);

  // --- steering wheel is a real diameter, absolute (not a share of the pane) ---
  assert.ok(sedan.wheelCm >= 32 && sedan.wheelCm <= 42, "sedan wheel in the real range");
  assert.strictEqual(sh.paramsFor({ shape: "sport" }).wheelCm, 34, "sports preset gets a small wheel");
  assert.strictEqual(sh.paramsFor({ shape: "van" }).wheelCm, 40, "van gets a comfort wheel");
  // a wider pane must NOT enlarge the wheel — it's an absolute size
  assert.strictEqual(sh.paramsFor({ shape: "sedan", adjust: { widthCm: 190 } }).wheelCm, sedan.wheelCm);
  // clamped to the real-world range
  assert.strictEqual(sh.paramsFor({ shape: "sedan", adjust: { wheelCm: 99 } }).wheelCm, 42);
  assert.strictEqual(sh.paramsFor({ shape: "sedan", adjust: { wheelCm: 5 } }).wheelCm, 32);
  // the wheel spans a plausible share of the pane: ~38 of 142 cm
  assert.ok(sedan.wheelCm / sedan.widthCm > 0.2 && sedan.wheelCm / sedan.widthCm < 0.35);

  // --- field of view is derived from the position, never claimable ---
  // The reported bug: a chip on the far right of a left-hand-drive car could be
  // ticked "in field of view" even though the wheel is on the left.
  const farRight = { x: 0.97, y: 0.5 };
  assert.strictEqual(sh.inFov(sedan, farRight, "left"), false, "far right is not in a left-hand driver's view");
  assert.strictEqual(sh.inFov(sedan, { x: 0.03, y: 0.5 }, "right"), false, "far left is not in a right-hand driver's view");
  // a chip right over the wheel is in view, and follows the wheel side
  const wheelSpotL = sh.boxToChip(sedan, sh.wheelX("left"), 0.5);
  const wheelSpotR = sh.boxToChip(sedan, sh.wheelX("right"), 0.5);
  assert.strictEqual(sh.inFov(sedan, wheelSpotL, "left"), true, "over the left wheel is in view");
  assert.strictEqual(sh.inFov(sedan, wheelSpotL, "right"), false, "same spot is not in view once the wheel moves right");
  assert.strictEqual(sh.inFov(sedan, wheelSpotR, "right"), true, "over the right wheel is in view");

  // --- recommendation: edge beats size, honours status ---
  const smallChip = { size: "c10", fov: false, events: [SC.logic.makeEvent("new", "2026-01-01")] };
  assert.strictEqual(SC.logic.recommend(smallChip, { inMargin: true }).key, "recReplaceEdge");
  assert.strictEqual(SC.logic.recommend(smallChip, { inMargin: false }).key, "recRepairable");
  assert.strictEqual(SC.logic.recommend(smallChip).key, "recRepairable", "no opts = no edge check");
  const repairedEdge = { size: "c10", fov: false, events: [SC.logic.makeEvent("new", "2026-01-01"), SC.logic.makeEvent("repaired", "2026-02-01")] };
  assert.strictEqual(SC.logic.recommend(repairedEdge, { inMargin: true }).key, "recWatchRepair", "status wins over edge");

  // --- migration of a legacy v1 chip ---
  const legacy = { id: "k_old", x: 0.7, y: 0.6, size: "crackM", status: "repaired", fov: false,
    found: "2026-05-12", repairedAt: "2026-05-20", repairedBy: "Carglass Bonn",
    insurance: true, insuranceAt: "2026-05-13", note: "upper right", up: "2026-06-01" };
  const migrated = SC.logic.normalizeChip(legacy);
  assert.ok(Array.isArray(migrated.events));
  assert.strictEqual(SC.logic.currentStatus(migrated), "repaired");
  assert.ok(SC.logic.insuranceReported(migrated));
  assert.strictEqual(SC.logic.foundDate(migrated), "2026-05-12");
  assert.strictEqual(SC.logic.lastEventOfType(migrated, "repaired").where, "Carglass Bonn");
  // idempotent: normalizing an already-normal chip changes nothing
  assert.deepStrictEqual(SC.logic.normalizeChip(migrated), migrated);

  // --- sanitize migrates legacy chips inside a state ---
  const legacyState = SC.store.sanitize({ v: 1, cars: [{ id: "c1", chips: [legacy] }] });
  assert.ok(Array.isArray(legacyState.cars[0].chips[0].events));

  // --- persistence roundtrip ---
  SC.store.save(state);
  const reloaded = SC.store.load();
  assert.strictEqual(reloaded.cars[0].chips[0].events.length, 4);

  // --- ascii marker char reflects status ---
  assert.strictEqual(SC.ascii.markerChar(chip), "*"); // repaired
  assert.strictEqual(SC.ascii.markerChar(c10out), "o"); // new
  const art = SC.ascii.renderAscii(car, { width: 58 });
  assert.ok(art.includes("[=]") && art.includes("(O)"));

  // --- ascii draws the real shape, bottom edge included ---
  // Regression: the art hard-coded a full-width bottom and the old, inverted
  // perspective, so it drew a rectangle no matter what the pane looked like.
  const draw = (adjust) => SC.ascii.renderAscii({ shape: "sedan", adjust, chips: [], wheel: "left" }, { width: 40 });
  const tapered = draw({ top: 1.0, bottom: 0.5 });
  const rect = draw({ top: 1.0, bottom: 1.0 });
  assert.notStrictEqual(tapered, rect, "the bottom edge changes the art — it used to be ignored");
  assert.ok(!rect.includes("\\") && !rect.includes("/"), "a rectangular pane has straight sides");
  const firstGlassRow = tapered.split("\n")[1];
  assert.ok(/^\s*\\/.test(firstGlassRow),
    "the left side leans in going down: the top edge is the near, wide one");
  assert.ok(/\/\s*$/.test(firstGlassRow), "and the right side mirrors it");
  // an inverted pane (narrow top) still draws the other way round
  assert.ok(/^\s*\//.test(draw({ top: 0.5, bottom: 1.0 }).split("\n")[1]), "a narrow top slants the other way");
  // markers stay off the border rows
  const withMarks = SC.ascii.renderAscii({ shape: "sedan", wheel: "left", chips: [
    { id: "a", x: 0.5, y: 0.0, size: "c10", events: [{ id: "e", type: "new", date: "2026-01-01" }] },
    { id: "b", x: 0.5, y: 1.0, size: "c10", events: [{ id: "e", type: "new", date: "2026-01-01" }] },
  ] }, { width: 40 }).split("\n");
  assert.ok(!withMarks[0].includes("o"), "no marker on the top border");
  assert.ok(!withMarks[withMarks.length - 2].includes("o"), "no marker on the bottom border");

  // --- i18n covers the new keys ---
  SC.i18n.set("de");
  assert.ok(SC.i18n.t("statusObserving").length > 0);
  assert.ok(SC.i18n.t("recReplaceFov").includes("Sichtfeld"));
  SC.i18n.set("en");
  assert.ok(SC.i18n.t("evRepaired").length > 0);
  assert.ok(SC.i18n.t("recReplaceCrack").length > 0, "every recommendation key has text");

  // --- share encode/decode + interop with zlib (CLI) ---
  const token = await SC.share.encodeState(state);
  assert.ok(token.startsWith("i:"));
  const dec = await SC.share.decodeToken("#" + token);
  assert.strictEqual(dec.cars[0].chips[0].events.length, 4);
  const viaZlib = JSON.parse(zlib.gunzipSync(Buffer.from(token.slice(2), "base64url")).toString("utf8"));
  assert.strictEqual(viaZlib.cars[0].chips[0].events.length, 4);
  const cliToken = "i:" + zlib.gzipSync(Buffer.from(JSON.stringify({ v: 1, cars: state.cars }))).toString("base64url");
  assert.strictEqual((await SC.share.decodeToken(cliToken)).cars[0].name, "Golf 7");

  // --- merge unions events by id, never loses history ---
  const remote = JSON.parse(JSON.stringify({ v: 1, cars: state.cars }));
  remote.cars[0].chips[0].events.push(SC.logic.makeEvent("irreparable", "2026-08-01"));
  remote.cars[0].chips[0].up = "2999-01-01T00:00:00.000Z";
  const merged = SC.store.merge(JSON.parse(JSON.stringify(reloaded)), remote);
  assert.strictEqual(merged.cars[0].chips[0].events.length, 5, "event unioned in");
  assert.strictEqual(SC.logic.currentStatus(merged.cars[0].chips[0]), "irreparable");

  // --- a merge that appends an OLDER event must not rewind the status ---
  // Regression: merge pushes remote events onto the end, so insertion order
  // made whatever the other device sent last win regardless of its date.
  const stale = JSON.parse(JSON.stringify({ v: 1, cars: merged.cars }));
  stale.cars[0].chips[0].events.push(SC.logic.makeEvent("observing", "2026-01-05"));
  const merged3 = SC.store.merge(JSON.parse(JSON.stringify(merged)), stale);
  assert.strictEqual(SC.logic.currentStatus(merged3.cars[0].chips[0]), "irreparable",
    "an older event merged in last must not become the current status");

  // --- merge adds unknown chip ---
  const remote2 = JSON.parse(JSON.stringify({ v: 1, cars: state.cars }));
  remote2.cars[0].chips.push({ id: "k_new", x: 0.1, y: 0.1, size: "c10", fov: false, events: [SC.logic.makeEvent("new", "2026-01-01")], up: "2026-01-01" });
  const merged2 = SC.store.merge(JSON.parse(JSON.stringify(merged)), remote2);
  assert.strictEqual(merged2.cars[0].chips.length, 2);

  // --- the UI's wiring matches the page it wires up ---
  // app.js talks to the DOM by id and to i18n by key, and both fail quietly:
  // a wrong id throws deep in a handler, a missing key renders as the key.
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const appSrc = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  const htmlIds = new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g)).map((m) => m[1]));
  Array.from(appSrc.matchAll(/\$\("([^"]+)"\)/g)).map((m) => m[1]).forEach((id) => {
    assert.ok(htmlIds.has(id), "app.js reaches for #" + id + ", which index.html doesn't have");
  });

  // --- every translation key the UI asks for has text in both languages ---
  const wanted = new Set();
  Array.from(html.matchAll(/data-i18n(?:-ph)?="([^"]+)"/g)).forEach((m) => wanted.add(m[1]));
  // Any string literal naming a dictionary key counts as a use: keys reach t()
  // through arrays, ternaries and helpers (flash(btn, "copied")) as often as
  // directly, and missing one of those would fail the wrong way — claiming a
  // live key is dead.
  Array.from(appSrc.matchAll(/"([A-Za-z]\w*)"/g)).forEach((m) => {
    if (SC.i18n.DICT[m[1]]) wanted.add(m[1]);
  });
  // Labels reached through a lookup table rather than a literal, by convention:
  // status -> statusNew, event -> evNew, size -> sizeC10.
  const pascal = (s) => s.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join("");
  SC.logic.STATUS_TYPES.forEach((ty) => wanted.add("status" + pascal(ty)));
  SC.logic.ALL_TYPES.forEach((ty) => wanted.add("ev" + pascal(ty)));
  SC.logic.SIZES.forEach((s) => wanted.add("size" + pascal(s)));
  SC.shapes.PRESET_ORDER.forEach((s) => wanted.add("shape" + pascal(s)));

  // Every verdict recommend() can actually reach, by walking the real tree
  // rather than trusting a hand-kept list — the crack rename got out of sync
  // exactly because the list was kept by hand.
  const verdicts = new Set();
  SC.logic.STATUS_TYPES.forEach((st) => SC.logic.SIZES.forEach((size) => {
    [true, false].forEach((inMargin) => [true, false].forEach((inFov) => {
      const c = { size, events: [SC.logic.makeEvent("new", "2026-01-01"), SC.logic.makeEvent(st, "2026-02-01")] };
      verdicts.add(SC.logic.recommend(c, { inMargin, inFov }).key);
    }));
  }));
  verdicts.forEach((k) => wanted.add(k));

  // Asserted against the dictionary, not through t(): t() falls back to English
  // for a missing German string, so a German gap would read as a pass.
  SC.i18n.LANGS.forEach((lang) => {
    wanted.forEach((k) => {
      assert.ok(SC.i18n.DICT[k] && SC.i18n.DICT[k][lang], 'i18n key "' + k + '" has no ' + lang + " text");
    });
  });

  // Keys nobody asks for are dead weight in a file that is all strings.
  const unused = Object.keys(SC.i18n.DICT).filter((k) => !wanted.has(k));
  assert.deepStrictEqual(unused, [], "i18n keys defined but never used: " + unused.join(", "));

  // The CLI keeps its own label table for the same verdicts.
  const cliSrc = fs.readFileSync(path.join(root, "cli/shieldchipiii.js"), "utf8");
  verdicts.forEach((k) => assert.ok(cliSrc.includes(k + ":"), "the CLI has no label for " + k));

  // --- the car-model issue form asks for everything a preset needs ---
  // The form is the only way a community model arrives, and GitHub ignores a
  // prefill param that names no field — silently. `bottom`, `widthCm` and
  // `wheelCm` were all added to the shape and never reached the form.
  const formSrc = fs.readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/car-model.yml"), "utf8");
  const formIds = Array.from(formSrc.matchAll(/^\s{4}id:\s*(\S+)/gm)).map((m) => m[1]);
  const snake = (k) => k.replace(/([A-Z])/g, (c) => "_" + c.toLowerCase());
  Object.keys(SC.shapes.PRESETS.sedan)
    .filter((k) => k !== "heightCm") // derived from widthCm — not the proposer's to set
    .forEach((k) => {
      assert.ok(formIds.includes(snake(k)),
        "the car-model form asks for '" + snake(k) + "' — a preset can't be built without it");
    });

  // --- sanitize rejects garbage ---
  assert.strictEqual(SC.store.sanitize({ foo: 1 }), null);
  assert.strictEqual(SC.store.sanitize({ v: 1, cars: [] }), null);
  assert.strictEqual(SC.store.sanitize({ v: 2, cars: [{ id: "c", chips: [] }] }), null, "a future version is not ours to read");

  console.log("smoke: all assertions passed");
})().catch((e) => { console.error("smoke FAILED:", e.stack || e.message); process.exit(1); });
