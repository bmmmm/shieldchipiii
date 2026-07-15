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

["shapes", "sources", "logic", "ascii", "i18n", "store", "share", "render", "qr"].forEach((m) => {
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
  // logic.js only marks it as sourced; which page backs it depends on the
  // car's country, so the caller resolves that through sources.js.
  assert.strictEqual(SC.logic.recommend(c10out, { inFov: true }).sourced, true);
  assert.strictEqual(SC.logic.recommend(repaired).sourced, undefined,
    "status-driven advice is ours and stays uncited");
  assert.ok(SC.sources.criteriaFor("de").url, "a country's criteria resolve to a page");

  // --- too many open chips for the shop to repair ---
  // Only some countries publish a cap; where they don't, there's no hint to
  // give and chipLoad must stay quiet rather than invent one.
  const loadCar = (n, status) => ({
    chips: Array.from({ length: n }, (_, i) => ({
      id: "k" + i, x: 0.5, y: 0.5, size: "c10",
      events: [SC.logic.makeEvent("new", "2026-01-01")]
        .concat(status ? [SC.logic.makeEvent(status, "2026-02-01")] : []),
    })),
  });
  assert.strictEqual(SC.logic.chipLoad(loadCar(9), null), null, "no published cap, no warning");
  assert.strictEqual(SC.logic.chipLoad(loadCar(2), 3), null, "under the cap, nothing to say");
  assert.strictEqual(SC.logic.chipLoad(loadCar(3), 3).level, "warn", "at the cap: still repairable, but that's the lot");
  assert.strictEqual(SC.logic.chipLoad(loadCar(4), 3).level, "danger", "over the cap");
  assert.strictEqual(SC.logic.chipLoad(loadCar(4), 3).count, 4);
  // Repaired chips don't count against the cap — the shop repairs what's open.
  assert.strictEqual(SC.logic.chipLoad(loadCar(5, "repaired"), 3), null,
    "repaired chips are not a load on the pane");
  assert.strictEqual(SC.logic.chipLoad(loadCar(5, "observing"), 3).count, 5,
    "an observed chip is still an open one");

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

  // --- edge margin in real centimetres, not picture fractions ---
  // The threshold is the country's, passed in — shapes.js has no constant for
  // it any more, because 10 cm is Germany's number and not everyone's.
  const sedan = sh.paramsFor({ shape: "sedan" });
  const DE_CM = SC.sources.marginCmFor("de");
  assert.strictEqual(DE_CM, 10, "Germany is the 10 cm rule the presets were built around");
  assert.ok(sedan.widthCm > 100 && sedan.heightCm > 50, "preset carries a real size");
  // centre of the pane is far from every edge
  const centre = { x: 0.5, y: 0.5 };
  assert.ok(sh.edgeDistanceCm(sedan, centre) > 20, "centre is clear of the rim");
  assert.strictEqual(sh.inMargin(sedan, centre, DE_CM), false);
  // hard against the left edge -> in the margin
  const atLeft = { x: 0.01, y: 0.5 };
  assert.ok(sh.edgeDistanceCm(sedan, atLeft) < 10, "chip at the rim is within 10 cm");
  assert.strictEqual(sh.inMargin(sedan, atLeft, DE_CM), true);
  // near the bottom edge: vertical cm are foreshortened, so a chip that looks
  // equally close vertically must still be judged in real cm
  assert.strictEqual(sh.inMargin(sedan, { x: 0.5, y: 0.995 }, DE_CM), true, "chip at the bottom rim");
  assert.strictEqual(sh.inMargin(sedan, { x: 0.5, y: 0.75 }, DE_CM), false, "well above the bottom rim");
  // the same fraction is a different real distance on a narrower pane —
  // this is the "10 cm is more on some panes, less on others" case
  const wide = sh.paramsFor({ shape: "sedan", adjust: { widthCm: 190 } });
  const narrowPane = sh.paramsFor({ shape: "sedan", adjust: { widthCm: 110 } });
  const probe = { x: 0.08, y: 0.5 };
  assert.ok(sh.edgeDistanceCm(wide, probe) > sh.edgeDistanceCm(narrowPane, probe),
    "same relative spot is further from the edge on a wider pane");
  // the verdict follows the country: a chip Spain repairs, Germany replaces
  const inBetween = { x: 0.043, y: 0.5 };
  const cm = sh.edgeDistanceCm(sedan, inBetween);
  assert.ok(cm > SC.sources.marginCmFor("es") && cm < DE_CM,
    "probe sits between the Spanish and German thresholds (" + cm.toFixed(1) + " cm)");
  assert.strictEqual(sh.inMargin(sedan, inBetween, DE_CM), true, "Germany: too close to the rim");
  assert.strictEqual(sh.inMargin(sedan, inBetween, SC.sources.marginCmFor("es")), false,
    "Spain: the same chip is clear — this is the whole point of per-country criteria");
  // margin inset stays inside the glass
  sh.marginInset(sedan, DE_CM).forEach(function (q) {
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

  // --- QR encoder is pure data: no DOM, byte mode, throws past capacity ---
  // qr.js loads in this headless sandbox for the same reason the app can build a
  // code without a DOM — it touches none. Guards the script-order assumption
  // (qr.js before app.js) from the data side.
  const url600 = "https://example.com/index.html#i:" + "A".repeat(567); // a ~600-char share URL
  const svg600 = SC.qr.svg(url600);
  assert.ok(svg600.startsWith("<svg") && svg600.includes('fill="#fff"') && svg600.includes('fill="#000"'),
    "qr.svg builds a white-background, black-module SVG string");
  const qrEnc = SC.qr.encode("hello");
  assert.ok(qrEnc.size > 0 && Array.isArray(qrEnc.modules) && qrEnc.modules.length === qrEnc.size,
    "qr.encode returns a square module matrix");
  assert.throws(() => SC.qr.svg("A".repeat(3000)), /too long/,
    "a payload past the version-40 byte capacity throws");

  // --- share encode/decode + interop with zlib (CLI) ---
  const token = await SC.share.encodeState(state);
  assert.ok(token.startsWith("i:"));
  const dec = await SC.share.decodeToken("#" + token);
  assert.strictEqual(dec.cars[0].chips[0].events.length, 4);
  const viaZlib = JSON.parse(zlib.gunzipSync(Buffer.from(token.slice(2), "base64url")).toString("utf8"));
  assert.strictEqual(viaZlib.cars[0].chips[0].events.length, 4);
  const cliToken = "i:" + zlib.gzipSync(Buffer.from(JSON.stringify({ v: 1, cars: state.cars }))).toString("base64url");
  assert.strictEqual((await SC.share.decodeToken(cliToken)).cars[0].name, "Golf 7");

  // --- merge unions events by id, never loses history; returns { state, stats } ---
  const remote = JSON.parse(JSON.stringify({ v: 1, cars: state.cars }));
  remote.cars[0].chips[0].events.push(SC.logic.makeEvent("irreparable", "2026-08-01"));
  remote.cars[0].chips[0].up = "2999-01-01T00:00:00.000Z";
  const mergeRes = SC.store.merge(JSON.parse(JSON.stringify(reloaded)), remote);
  const merged = mergeRes.state;
  assert.strictEqual(merged.cars[0].chips[0].events.length, 5, "event unioned in");
  assert.strictEqual(SC.logic.currentStatus(merged.cars[0].chips[0]), "irreparable");
  assert.strictEqual(mergeRes.stats.events, 1, "the one appended event is counted");
  assert.strictEqual(mergeRes.stats.updated, 1, "the field-refreshed chip is counted");

  // --- a merge that appends an OLDER event must not rewind the status ---
  // Regression: merge pushes remote events onto the end, so insertion order
  // made whatever the other device sent last win regardless of its date.
  const stale = JSON.parse(JSON.stringify({ v: 1, cars: merged.cars }));
  stale.cars[0].chips[0].events.push(SC.logic.makeEvent("observing", "2026-01-05"));
  const merged3 = SC.store.merge(JSON.parse(JSON.stringify(merged)), stale).state;
  assert.strictEqual(SC.logic.currentStatus(merged3.cars[0].chips[0]), "irreparable",
    "an older event merged in last must not become the current status");

  // --- merge adds unknown chip ---
  const remote2 = JSON.parse(JSON.stringify({ v: 1, cars: state.cars }));
  remote2.cars[0].chips.push({ id: "k_new", x: 0.1, y: 0.1, size: "c10", fov: false, events: [SC.logic.makeEvent("new", "2026-01-01")], up: "2026-01-01" });
  const merged2Res = SC.store.merge(JSON.parse(JSON.stringify(merged)), remote2);
  assert.strictEqual(merged2Res.state.cars[0].chips.length, 2);
  assert.strictEqual(merged2Res.stats.added, 1, "the new chip is counted as added");

  // --- tombstone-based deletion survives a merge of an older remote ---
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const T1 = "2026-01-01T00:00:00.000Z"; // oldest
  const T2 = "2026-06-01T00:00:00.000Z";
  const T3 = "2026-12-01T00:00:00.000Z"; // newest
  const mkChip = (id, up) => ({ id, x: 0.5, y: 0.5, size: "c10", up, events: [SC.logic.makeEvent("new", "2026-01-01")] });
  const mkCar = (id, chips, gone, up) => ({ id, name: id, shape: "sedan", adjust: null, wheel: "left", country: "de", chips, gone: gone || {}, up: up || T2 });

  // a chip deleted locally is not resurrected by an older remote copy of it
  const localDel = { v: 1, activeCar: "cA", gone: {}, cars: [mkCar("cA", [], { kX: T3 })] };
  const remoteOld = { v: 1, activeCar: "cA", gone: {}, cars: [mkCar("cA", [mkChip("kX", T1)], {})] };
  const rDel = SC.store.merge(clone(localDel), clone(remoteOld));
  assert.strictEqual(rDel.state.cars[0].chips.length, 0, "a locally deleted chip stays deleted against an older remote");
  assert.strictEqual(rDel.stats.blocked, 1, "the blocked chip is counted");

  // a glass swap tombstones every chip on the pane, and they stay gone
  const swapped = { v: 1, activeCar: "cB", gone: {}, cars: [mkCar("cB", [], { kX: T3, kY: T3 })] };
  const remoteSwap = { v: 1, activeCar: "cB", gone: {}, cars: [mkCar("cB", [mkChip("kX", T1), mkChip("kY", T2)], {})] };
  const rSwap = SC.store.merge(clone(swapped), clone(remoteSwap));
  assert.strictEqual(rSwap.state.cars[0].chips.length, 0, "chips cleared by a glass swap stay gone against an older share");
  assert.strictEqual(rSwap.stats.blocked, 2);

  // a deleted car (state.gone) is not resurrected by an older remote copy
  const carDel = { v: 1, activeCar: "cB", gone: { cA: T3 }, cars: [mkCar("cB", [], {})] };
  const remoteHasA = { v: 1, activeCar: "cA", gone: {}, cars: [mkCar("cA", [mkChip("kX", T1)], {}, T1), mkCar("cB", [], {})] };
  const rCarDel = SC.store.merge(clone(carDel), clone(remoteHasA));
  assert.ok(!rCarDel.state.cars.some((c) => c.id === "cA"), "a deleted car stays deleted against an older remote");
  assert.strictEqual(rCarDel.stats.blocked, 1, "the blocked car is counted");

  // a remote tombstone newer than the last local car buries it, yet the state
  // is never left car-less — a fresh empty car takes its place and is active
  const lastCar = { v: 1, activeCar: "cA", gone: {}, cars: [mkCar("cA", [], {}, T1)] };
  const remoteKills = { v: 1, activeCar: "cA", gone: { cA: T3 }, cars: [] };
  const rLast = SC.store.merge(clone(lastCar), clone(remoteKills));
  assert.strictEqual(rLast.state.cars.length, 1, "removing the last car leaves a fresh one");
  assert.strictEqual(rLast.state.cars[0].chips.length, 0, "the replacement car is empty");
  assert.notStrictEqual(rLast.state.cars[0].id, "cA", "and it is a new car, not the buried one");
  assert.strictEqual(rLast.state.activeCar, rLast.state.cars[0].id, "activeCar points at the surviving car");
  assert.strictEqual(rLast.stats.removed, 1, "the removed car is counted");

  // when the active car is buried but others remain, active moves to a survivor
  const twoCars = { v: 1, activeCar: "cA", gone: {}, cars: [mkCar("cA", [], {}, T1), mkCar("cB", [], {}, T1)] };
  const killA = { v: 1, activeCar: "cA", gone: { cA: T3 }, cars: [] };
  const rTwo = SC.store.merge(clone(twoCars), clone(killA));
  assert.strictEqual(rTwo.state.cars.length, 1, "only the buried car is removed");
  assert.strictEqual(rTwo.state.cars[0].id, "cB", "the other car remains");
  assert.strictEqual(rTwo.state.activeCar, "cB", "active moves to the surviving car");
  assert.strictEqual(rTwo.stats.removed, 1);

  // a chip re-edited AFTER a tombstone elsewhere (up newer than the stamp)
  // survives, and the outlived tombstone is healed away so it can't linger
  const localFresh = { v: 1, activeCar: "cA", gone: {}, cars: [mkCar("cA", [mkChip("kX", T3)], {})] };
  const remoteTomb = { v: 1, activeCar: "cA", gone: {}, cars: [mkCar("cA", [], { kX: T1 })] };
  const rHeal = SC.store.merge(clone(localFresh), clone(remoteTomb));
  assert.strictEqual(rHeal.state.cars[0].chips.length, 1, "a chip re-edited after its deletion survives");
  assert.strictEqual(rHeal.state.cars[0].chips[0].id, "kX");
  assert.ok(!("kX" in rHeal.state.cars[0].gone), "and the outlived chip tombstone is healed away");
  assert.strictEqual(rHeal.stats.removed, 0);

  // the same healing applies to a car-level tombstone the car has outlived
  const carHeal = { v: 1, activeCar: "cA", gone: { cA: T1 }, cars: [mkCar("cA", [], {}, T3)] };
  const rCarHeal = SC.store.merge(clone(carHeal), { v: 1, activeCar: "cA", gone: {}, cars: [] });
  assert.ok(rCarHeal.state.cars.some((c) => c.id === "cA"), "a car re-edited after its deletion survives");
  assert.ok(!("cA" in rCarHeal.state.gone), "and its outlived car tombstone is healed");

  // stats count exactly what happened across one representative merge
  const ev = (type, date, id) => { const e = SC.logic.makeEvent(type, date); if (id) e.id = id; return e; };
  const gLocal = {
    v: 1, activeCar: "cA", gone: {},
    cars: [{
      id: "cA", name: "A", shape: "sedan", adjust: null, wheel: "left", country: "de", up: T2,
      gone: { kBlk: T3 }, // blocks an older remote kBlk from reappearing
      chips: [
        { id: "k1", x: 0.2, y: 0.2, size: "c10", up: T2, events: [ev("new", "2026-01-01", "e_k1")] },
        { id: "k2", x: 0.3, y: 0.3, size: "c10", up: T2, events: [ev("new", "2026-01-01", "e_k2")] },
        { id: "k3", x: 0.4, y: 0.4, size: "c10", up: T2, events: [ev("new", "2026-01-01", "e_k3")] },
      ],
    }],
  };
  const gRemote = clone(gLocal);
  gRemote.cars.push({ id: "cNew", name: "N", shape: "sedan", adjust: null, wheel: "left", country: "de", up: T2, gone: {}, chips: [] }); // +1 car
  gRemote.cars[0].chips[0].up = T3; gRemote.cars[0].chips[0].x = 0.9; // k1 field-refreshed -> updated
  gRemote.cars[0].chips[1].events.push(ev("observing", "2026-02-01", "e_k2b")); // k2 +1 event
  gRemote.cars[0].chips.splice(2, 1); // drop k3 from remote's chips...
  gRemote.cars[0].gone = { k3: T3 }; // ...and bury it -> removed locally
  gRemote.cars[0].chips.push({ id: "k4", x: 0.5, y: 0.5, size: "c10", up: T2, events: [ev("new", "2026-01-01", "e_k4")] }); // +1 chip
  gRemote.cars[0].chips.push({ id: "kBlk", x: 0.6, y: 0.6, size: "c10", up: T1, events: [ev("new", "2026-01-01", "e_kBlk")] }); // blocked
  const rStats = SC.store.merge(clone(gLocal), gRemote).stats;
  // Field by field, not deepStrictEqual: the stats object is built inside the
  // module sandbox, so its prototype differs from a literal here — a whole-object
  // compare would trip on that alone. Same reason keys are checked via Object.keys.
  assert.strictEqual(rStats.cars, 1, "one new car added");
  assert.strictEqual(rStats.added, 1, "one new chip added to an existing car");
  assert.strictEqual(rStats.updated, 1, "one chip's fields refreshed");
  assert.strictEqual(rStats.events, 1, "one event appended to an existing chip");
  assert.strictEqual(rStats.blocked, 1, "one remote entity blocked by a local tombstone");
  assert.strictEqual(rStats.removed, 1, "one local entity removed by a remote tombstone");

  // --- a deleted event stays deleted across a merge (#4) ---
  // The x on a timeline row tombstones the event id (chip.gone); the union used
  // to treat "deleted here" and "never seen" as the same thing and push it back.
  const evChip = (id, events, gone) => ({ id, x: 0.5, y: 0.5, size: "c10", up: T2, gone: gone || {}, events });
  const evLocal = { v: 1, activeCar: "cA", gone: {}, cars: [mkCar("cA", [evChip("kE", [ev("new", "2026-01-01", "e1")], { e2: T3 })])] };
  const evRemote = { v: 1, activeCar: "cA", gone: {}, cars: [mkCar("cA", [evChip("kE", [ev("new", "2026-01-01", "e1"), ev("note", "2026-02-01", "e2")])])] };
  const rEvDel = SC.store.merge(clone(evLocal), clone(evRemote));
  assert.strictEqual(rEvDel.state.cars[0].chips[0].events.length, 1, "a locally deleted event stays deleted against an older remote");
  assert.strictEqual(rEvDel.state.cars[0].chips[0].events[0].id, "e1");
  assert.strictEqual(rEvDel.stats.blocked, 1, "the blocked event is counted");

  // the other direction: a remote tombstone buries the local copy of the event
  const rEvBury = SC.store.merge(clone(evRemote), clone(evLocal));
  assert.strictEqual(rEvBury.state.cars[0].chips[0].events.length, 1, "a remote event tombstone buries the local copy");
  assert.strictEqual(rEvBury.state.cars[0].chips[0].events[0].id, "e1");
  assert.strictEqual(rEvBury.stats.removed, 1, "the buried event is counted");

  // two devices each deleted the other's remaining event: the merge may not
  // leave an empty timeline — normalizeChip's guarantee, held through a merge
  const evA = { v: 1, activeCar: "cA", gone: {}, cars: [mkCar("cA", [evChip("kE", [ev("new", "2026-01-01", "e1")], { e2: T3 })])] };
  const evB = { v: 1, activeCar: "cA", gone: {}, cars: [mkCar("cA", [evChip("kE", [ev("note", "2026-02-01", "e2")], { e1: T3 })])] };
  const rEvBoth = SC.store.merge(clone(evA), clone(evB));
  const evLeft = rEvBoth.state.cars[0].chips[0].events;
  assert.strictEqual(evLeft.length, 1, "crossed event deletions leave a fresh timeline, never an empty one");
  assert.strictEqual(evLeft[0].type, "new", "the replacement is a fresh find event");
  assert.ok(!["e1", "e2"].includes(evLeft[0].id), "and not one of the buried events");

  // chip.gone is vetted and carried by normalizeChip
  const bigEvKey = { ok: T1, bad: 7 }; bigEvKey["e_" + "x".repeat(60)] = T1;
  const vetted = SC.logic.normalizeCars([{ id: "cV", chips: [{ x: 0.1, y: 0.1, gone: bigEvKey }] }])[0].chips[0];
  assert.deepStrictEqual(Object.keys(vetted.gone), ["ok"], "chip.gone keeps clean entries and drops junk");

  // --- gone survives every serialization path (share round-trip + CLI zlib) ---
  const goneState = SC.store.defaultState();
  goneState.gone = { deadCar: T2 };
  goneState.cars[0].gone = { deadChip: T3 };
  goneState.cars[0].chips.push({ id: "kQ", x: 0.5, y: 0.5, size: "c10", up: T2, gone: { deadEvent: T3 }, events: [ev("new", "2026-01-01", "eQ")] });
  const goneTok = await SC.share.encodeState(goneState);
  const goneDec = await SC.share.decodeToken("#" + goneTok);
  assert.strictEqual(goneDec.gone.deadCar, T2, "state-level tombstone survives the share round-trip");
  assert.strictEqual(goneDec.cars[0].gone.deadChip, T3, "per-car tombstone survives too");
  assert.strictEqual(goneDec.cars[0].chips[0].gone.deadEvent, T3, "per-chip event tombstone survives too");
  const viaZlibGone = JSON.parse(zlib.gunzipSync(Buffer.from(goneTok.slice(2), "base64url")).toString("utf8"));
  assert.strictEqual(viaZlibGone.gone.deadCar, T2, "the CLI zlib decode path sees the state tombstone");
  assert.strictEqual(viaZlibGone.cars[0].gone.deadChip, T3, "and the per-car tombstone");

  // --- sanitize / normalizeCar drop junk gone entries ---
  const dirty = SC.store.sanitize({
    v: 1, activeCar: "c1",
    gone: { goodCar: T1, badNum: 12345, badLong: "x".repeat(40) },
    cars: [{ id: "c1", chips: [], gone: { goodChip: T2, badVal: {} } }],
  });
  assert.strictEqual(dirty.gone.goodCar, T1, "a valid state tombstone is kept");
  assert.ok(!("badNum" in dirty.gone), "a non-string stamp is dropped");
  assert.ok(!("badLong" in dirty.gone), "an over-length stamp is dropped");
  assert.strictEqual(dirty.cars[0].gone.goodChip, T2, "a valid car tombstone is kept");
  assert.ok(!("badVal" in dirty.cars[0].gone), "a non-string car stamp is dropped");
  const bigKey = {}; bigKey["k_" + "x".repeat(60)] = T1;
  assert.deepStrictEqual(Object.keys(SC.store.sanitize({ v: 1, activeCar: "c1", gone: bigKey, cars: [{ id: "c1", chips: [] }] }).gone), [],
    "an over-length id is dropped");
  assert.deepStrictEqual(Object.keys(SC.store.sanitize({ v: 1, activeCar: "c1", gone: "nope", cars: [{ id: "c1", chips: [] }] }).gone), [],
    "a non-object gone defaults to empty");
  assert.deepStrictEqual(Object.keys(SC.store.sanitize({ v: 1, activeCar: "c1", gone: ["a"], cars: [{ id: "c1", chips: [] }] }).gone), [],
    "an array is not a tombstone map");
  assert.deepStrictEqual(Object.keys(SC.logic.normalizeCars([{ id: "c", chips: [] }])[0].gone), [], "a car with no gone gets an empty map");
  const carJunk = SC.logic.normalizeCars([{ id: "c", chips: [], gone: { ok: T1, bad: 7 } }])[0].gone;
  assert.deepStrictEqual(Object.keys(carJunk), ["ok"], "normalizeCar drops junk car tombstones and keeps valid ones");
  assert.strictEqual(carJunk.ok, T1, "the valid car tombstone keeps its stamp");

  // --- tapping a marker on a phone ---
  // The reason this exists: the drawn hit circles are viewBox units and the SVG
  // scales to the viewport, so the target that measures ~43px on a desktop is
  // ~19px on a phone — and a miss doesn't do nothing, it adds a second chip on
  // top of the one you were aiming at. markerAt() picks by distance in real
  // pixels instead, so a fake element with a phone's measurements is enough to
  // hold it honest without a DOM.
  // Read from render.js rather than restated here: a copy of the number would
  // stay green while the real one shrank.
  const PICK_PX = SC.render.PICK_PX;
  assert.ok(PICK_PX * 2 >= 44, "the pick target is at least a 44px finger");
  const phoneSvg = (h) => ({
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 361, height: h }), // iPhone 15, minus body padding
    viewBox: { baseVal: { width: 1000, height: 1000 * (h / 361) } },
  });
  const tapCar = {
    shape: "sedan", wheel: "left", country: "de",
    chips: [
      { id: "k_left", x: 0.25, y: 0.4, size: "c10", events: [SC.logic.makeEvent("new", "2026-01-01")] },
      // ~20px from k_left on a phone: close enough that one tap is inside both,
      // which is the only arrangement where "nearest" and "whichever came
      // first" give different answers.
      { id: "k_near", x: 0.31, y: 0.4, size: "c10", events: [SC.logic.makeEvent("new", "2026-01-01")] },
      { id: "k_right", x: 0.75, y: 0.4, size: "c10", events: [SC.logic.makeEvent("new", "2026-01-01")] },
    ],
  };
  const svgEl = phoneSvg(200);
  const at = (chip) => SC.render.markerElementPos(svgEl, tapCar, chip);
  const tap = (x, y) => SC.render.markerAt(svgEl, tapCar, x, y, PICK_PX);

  // Reach, measured on the isolated marker so no neighbour can answer for it.
  const rightPos = at(tapCar.chips[2]);
  assert.strictEqual(tap(rightPos.x, rightPos.y).id, "k_right", "dead on hits");
  assert.strictEqual(tap(rightPos.x + 20, rightPos.y).id, "k_right",
    "a tap 20px off still selects — on a phone the old ~9px radius missed this");
  assert.strictEqual(tap(rightPos.x, rightPos.y - 20).id, "k_right", "and in the other axis");
  assert.strictEqual(tap(rightPos.x + PICK_PX + 1, rightPos.y), null, "the limit is the limit");
  assert.strictEqual(tap(rightPos.x + 40, rightPos.y), null, "well past it is empty glass — that's what adds a chip");
  assert.strictEqual(SC.render.markerAt(svgEl, { chips: [] }, 10, 10, PICK_PX), null, "no chips, no pick");

  // Nearest, measured on the close pair: a radius wide enough for a thumb
  // overlaps its neighbours, and a hit test would then answer with whichever
  // marker is drawn on top rather than the one aimed at.
  const leftPos = at(tapCar.chips[0]), nearPos = at(tapCar.chips[1]);
  const gap = nearPos.x - leftPos.x;
  assert.ok(gap > 0 && gap < 2 * PICK_PX,
    "the pair really does sit inside one tap (" + gap.toFixed(1) + "px), or the two asserts below prove nothing");
  const between = (leftPos.x + nearPos.x) / 2;
  assert.strictEqual(tap(between + 2, leftPos.y).id, "k_near", "just past the midpoint: the nearer one");
  assert.strictEqual(tap(between - 2, leftPos.y).id, "k_left", "just short of it: the other one");

  // The target must not shrink with the screen — that was the whole defect.
  // Measured against the isolated marker again, at every width that matters.
  [343, 361, 380, 828].forEach((w) => {
    const el = {
      getBoundingClientRect: () => ({ left: 0, top: 0, width: w, height: 200 }),
      viewBox: { baseVal: { width: 1000, height: 1000 * (200 / w) } },
    };
    const p = SC.render.markerElementPos(el, tapCar, tapCar.chips[2]);
    assert.ok(SC.render.markerAt(el, tapCar, p.x + 20, p.y, PICK_PX),
      "a 20px-off tap lands on every screen width, including " + w + "px");
  });

  // --- the UI's wiring matches the page it wires up ---
  // app.js talks to the DOM by id and to i18n by key, and both fail quietly:
  // a wrong id throws deep in a handler, a missing key renders as the key.
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  const appSrc = fs.readFileSync(path.join(root, "js/app.js"), "utf8");
  const htmlIds = new Set(Array.from(html.matchAll(/\sid="([^"]+)"/g)).map((m) => m[1]));
  Array.from(appSrc.matchAll(/\$\("([^"]+)"\)/g)).map((m) => m[1]).forEach((id) => {
    assert.ok(htmlIds.has(id), "app.js reaches for #" + id + ", which index.html doesn't have");
  });

  // --- every local asset carries the same cache stamp ---
  // A deploy that mixes cached old modules with fresh ones crashes for real
  // (GitHub Pages caches for 10 minutes); scripts/stamp-assets.sh writes one
  // ?v= stamp everywhere, and a half-stamped index.html must fail here.
  const assetUrls = Array.from(html.matchAll(/(?:src|href)="((?!https?:)[^"]*\.(?:js|css)[^"]*)"/g)).map((m) => m[1]);
  const scriptTags = (html.match(/<script src="/g) || []).length;
  assert.strictEqual(assetUrls.length, scriptTags + 1,
    "the asset scan must see every script tag plus the stylesheet, got " + assetUrls.length + " of " + (scriptTags + 1));
  const stamps = new Set(assetUrls.map((u) => (u.match(/\?v=([^"&?]+)$/) || [])[1]));
  assert.ok(!stamps.has(undefined) && stamps.size === 1,
    "local assets carry " + JSON.stringify(Array.from(stamps)) + " as cache stamps — run scripts/stamp-assets.sh");

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
  SC.shapes.PRESET_ORDER.forEach((s) => wanted.add("shape" + pascal(s)));
  // e2 is the odd one out: it's the repair threshold, so it's labelled with
  // whatever coin the country gauges by, not a fixed size key.
  SC.logic.SIZES.filter((s) => s !== "e2").forEach((s) => wanted.add("size" + pascal(s)));
  SC.sources.CODES.forEach((c) => wanted.add(SC.sources.coinKeyFor(c)));

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

  // Same for the chip-load warning: its keys live in logic.js, so a scan of
  // app.js literals can't see them either.
  [0, 3, 4].forEach((n) => {
    const load = SC.logic.chipLoad(loadCar(n), 3);
    if (load) wanted.add(load.key);
  });

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
