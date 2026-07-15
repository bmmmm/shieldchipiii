#!/usr/bin/env node
/* shieldchipiii CLI — view and edit shieldchipiii data in the terminal.
 * Zero dependencies; shares shapes.js + ascii.js + logic.js with the web app.
 * Wire format is identical to the browser (#i: = gzip+base64url, #j: = base64url). */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const shapes = require(path.join(__dirname, "..", "js", "shapes.js"));
const logic = require(path.join(__dirname, "..", "js", "logic.js"));
const ascii = require(path.join(__dirname, "..", "js", "ascii.js"));
const sources = require(path.join(__dirname, "..", "js", "sources.js"));

const COIN_LABEL = { coinE2: "2-euro coin", coinChf2: "CHF 2 coin", coinDkk2: "2-krone coin" };
const SIZE_LABEL = {
  c10: "< 10-cent coin", c50: "< 50-cent coin",
  crackS: "crack ~2cm", crackM: "crack ~5cm", crackL: "crack >5cm",
};
// e2 is the repair threshold and gets named after the coin the car's country
// measures with, so it can't live in the table above.
function sizeLabel(size, country) {
  if (size === "e2") return "< " + COIN_LABEL[sources.coinKeyFor(country)];
  return SIZE_LABEL[size] || size;
}
const SIZES = logic.SIZES;
const STATUS_LABEL = {
  new: "open", observing: "observing", repair_planned: "repair planned",
  repaired: "repaired", irreparable: "irreparable",
};
const EVENT_LABEL = {
  new: "found", observing: "observed", repair_planned: "repair planned",
  repaired: "repaired", irreparable: "irreparable",
  insurance_reported: "insurance reported", note: "note",
};
const LOAD_LABEL = {
  loadAt: "{count} open chips — more than {max} usually aren't repaired, the glass gets replaced instead",
  loadOver: "{count} open chips — usually at most {max} get repaired; a replacement is likely",
};
const REC_LABEL = {
  recRepairable: "repairable — insurance often covers it, do it soon",
  recReplaceFov: "no-go zone (driver's view) — repair unlikely, ask a glass service",
  recReplaceEdge: "no-go zone (< {cm} cm from the edge) — repair unlikely, ask a glass service",
  recReplaceCrack: "crack — not repaired as a rule, ask a glass service",
  recPlanned: "repair planned — keep the appointment, avoid temp shocks",
  recWatchRepair: "repaired — watch that it holds",
  recIrreparable: "irreparable — arrange a glass replacement",
};
const ADDABLE = ["observing", "repair_planned", "repaired", "irreparable", "insurance_reported", "note"];
const WHERE_TYPES = { repaired: 1, repair_planned: 1 };

function die(msg) {
  console.error("Error: " + msg);
  process.exit(1);
}

// Dates are validated here rather than left to the model, which would quietly
// blank an unparseable one — from the outside that looks like a lost entry.
function askDate(flag, value, fallback) {
  if (typeof value !== "string") return fallback;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) die("--" + flag + " must be a date as YYYY-MM-DD, got '" + value + "'");
  return value;
}

// ---------- token <-> state ----------

// Same caps as the browser (js/share.js): a share link is untrusted input here
// too, and a small gzip token can otherwise inflate to hundreds of megabytes.
const MAX_TOKEN = 512 * 1024, MAX_JSON = 2 * 1024 * 1024;

function decodeToken(token) {
  token = token.replace(/^#/, "");
  const kind = token.slice(0, 2);
  const body = token.slice(2);
  if ((kind !== "i:" && kind !== "j:") || !body) throw new Error("not a share token");
  if (body.length > MAX_TOKEN) throw new Error("share token too large");
  let bytes = Buffer.from(body, "base64url");
  if (kind === "i:") {
    try {
      bytes = zlib.gunzipSync(bytes, { maxOutputLength: MAX_JSON });
    } catch (e) {
      throw new Error("could not unpack the share link (corrupted, or larger than " + MAX_JSON / 1024 + " KB of data)");
    }
  }
  if (bytes.length > MAX_JSON) throw new Error("share payload too large");
  return JSON.parse(bytes.toString("utf8"));
}

function encodeToken(state) {
  const json = JSON.stringify({ v: 1, cars: state.cars });
  return "i:" + zlib.gzipSync(Buffer.from(json, "utf8"), { level: 9 }).toString("base64url");
}

// src = JSON file path, full share URL, or bare token. Legacy chips are
// migrated and every field vetted on load, same as the browser — a share link
// off the internet is exactly as untrusted here as it is there.
function loadState(src) {
  if (!src) throw new Error("missing <src> (JSON file, share URL, or token)");
  let state;
  if (fs.existsSync(src)) {
    state = JSON.parse(fs.readFileSync(src, "utf8"));
  } else {
    const hashIdx = src.indexOf("#");
    const token = hashIdx >= 0 ? src.slice(hashIdx + 1) : src;
    state = decodeToken(token);
  }
  if (!state || state.v !== 1) throw new Error("not a shieldchipiii payload");
  const cars = logic.normalizeCars(state.cars);
  if (!cars.length) throw new Error("no usable vehicle in the payload");
  return { v: 1, cars };
}

// ---------- output ----------

function chipLine(k, i, params, wheel, country) {
  const status = logic.currentStatus(k);
  const found = logic.foundDate(k);
  const edgeCm = params ? Math.round(shapes.edgeDistanceCm(params, k)) : null;
  const fov = params ? shapes.inFov(params, k, wheel) : false;
  const cols = [
    String(i + 1).padStart(2),
    ascii.markerChar(k),
    sizeLabel(k.size, country).padEnd(15),
    (STATUS_LABEL[status] || status).padEnd(15),
    found.padEnd(10),
    fov ? "FOV" : "   ",
    edgeCm != null ? (edgeCm + "cm").padStart(5) : "     ",
    logic.insuranceReported(k) ? "ins" : "   ",
  ];
  return "  " + cols.join(" ").replace(/\s+$/, "");
}

function timelineLines(k) {
  return logic.timeline(k).map((e) => {
    let s = "     " + (e.date || "").padEnd(11) + (EVENT_LABEL[e.type] || e.type);
    if (e.where) s += " @ " + e.where;
    if (e.note) s += " // " + e.note;
    return s;
  });
}

function printCar(car, opts) {
  const country = sources.normalize(opts.country || car.country);
  const marginCm = sources.marginCmFor(country);
  console.log("");
  console.log("== " + (car.name || "(unnamed vehicle)") + " ==  [" + (car.shape || "sedan") +
    ", wheel " + (car.wheel || "left") + ", " + country.toUpperCase() + "]");
  console.log("");
  console.log(ascii.renderAscii(car, { width: opts.width }).replace(/^/gm, "   "));
  console.log("");
  if (!car.chips.length) { console.log("  (no entries)"); return; }
  const params = shapes.paramsFor(car);
  console.log("   # sym size            status          found      fov  edge ins");
  let cited = false;
  car.chips.forEach((k, i) => {
    console.log(chipLine(k, i, params, car.wheel, country));
    const rec = logic.recommend(k, {
      inMargin: shapes.inMargin(params, k, marginCm),
      inFov: shapes.inFov(params, k, car.wheel),
    });
    const label = (REC_LABEL[rec.key] || rec.key).replace("{cm}", String(marginCm));
    console.log("     -> " + label);
    cited = cited || !!rec.sourced;
  });

  // A whole-pane verdict, so it goes under the table, not on a chip's line.
  const load = logic.chipLoad(car, sources.maxChipsFor(country));
  if (load) {
    console.log("\n   !! " + LOAD_LABEL[load.key]
      .replace("{count}", String(load.count)).replace("{max}", String(load.max)));
    cited = true;
  }

  // Cited once at the bottom rather than per line — same source every time.
  if (cited) console.log("\n   repair criteria (" + country.toUpperCase() + "): " + sources.criteriaFor(country).url);
}

function findCar(state, sel) {
  if (!sel) {
    if (state.cars.length === 1) return state.cars[0];
    throw new Error("multiple vehicles — pick one with --car <name|number>");
  }
  const byIdx = state.cars[parseInt(sel, 10) - 1];
  if (/^\d+$/.test(sel) && byIdx) return byIdx;
  const byName = state.cars.find((c) => (c.name || "").toLowerCase().includes(sel.toLowerCase()));
  if (!byName) throw new Error("no vehicle matching '" + sel + "'");
  return byName;
}

// ---------- args ----------

function parseArgs(argv) {
  const flags = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) flags[key] = true;
      else { flags[key] = next; i++; }
    } else {
      pos.push(a);
    }
  }
  return { flags, pos };
}

function emit(state, flags) {
  const token = encodeToken(state);
  const base = flags.base || process.env.SHIELDCHIPIII_BASE;
  if (flags.out) {
    fs.writeFileSync(flags.out, JSON.stringify({ v: 1, cars: state.cars }, null, 2) + "\n");
    console.log("wrote " + flags.out);
  }
  console.log(base ? String(base).replace(/#.*$/, "") + "#" + token : "#" + token);
  if (!base) console.log("(open as <app-url>#" + token.slice(0, 12) + "…, or pass --base <app-url>)");
}

const USAGE = `shieldchipiii — windshield stone chip logbook (terminal client)

Usage:
  shieldchipiii.js show  <src> [--car <name|nr>] [--width N] [--country XX]
  shieldchipiii.js list  <src> [--car <name|nr>] [--country XX]  table + timeline
  shieldchipiii.js add   <src> --x <0..1> --y <0..1> [--car <name|nr>]
                   [--size ${SIZES.join("|")}]
                   [--status ${logic.STATUS_TYPES.join("|")}]
                   [--found YYYY-MM-DD] [--where "..."] [--note "..."]
                   [--out file.json] [--base <app-url>]
  shieldchipiii.js event <src> --marker <nr> --type <${ADDABLE.join("|")}>
                   [--car <name|nr>] [--date YYYY-MM-DD] [--where "..."] [--note "..."]
                   [--out file.json] [--base <app-url>]
  shieldchipiii.js decode <src>                     print JSON to stdout
  shieldchipiii.js encode <file.json> [--base url]  print share token/URL

<src> is a JSON export file, a full share URL, or a bare i:/j: token.
x/y are fractions: x = 0 (left edge) .. 1 (right edge at the chip's height),
y = 0 (top) .. 1 (bottom). Example: --x 0.3 --y 0.6
Marker symbols: o=open ?=observing @=planned *=repaired X=irreparable
The edge column is the distance to the nearest edge. How close is too close is
the shop's call and differs per country — the vehicle carries its own, and
--country XX judges it by another one instead. A glass service decides in the end.
Countries with known criteria: ${sources.CODES.join(" ")}`;

// ---------- main ----------

const COMMANDS = ["show", "list", "add", "event", "decode", "encode"];

function main() {
  const { flags, pos } = parseArgs(process.argv.slice(2));
  const cmd = pos[0];

  if (!cmd || cmd === "help" || flags.help) { console.log(USAGE); return; }
  // Check the command before the payload: mistyping one used to report the
  // missing <src> instead, which sends you looking in the wrong place.
  if (!COMMANDS.includes(cmd)) {
    die("unknown command '" + cmd + "' — expected one of: " + COMMANDS.join(", ") + " (run 'help')");
  }

  const state = loadState(pos[1]);
  // An unknown code would silently fall back to the default and quietly judge
  // by the wrong rule — say so instead.
  const override = flags.country ? String(flags.country).toLowerCase() : null;
  if (override && !sources.has(override)) {
    die("--country '" + flags.country + "' has no known repair criteria — one of: " + sources.CODES.join(", "));
  }

  switch (cmd) {
    case "show": {
      const cars = flags.car ? [findCar(state, flags.car)] : state.cars;
      const width = Math.max(30, Math.min(120, parseInt(flags.width, 10) || 58));
      cars.forEach((c) => printCar(c, { width, country: override }));
      console.log("\n  o=open ?=observing @=planned *=repaired X=irreparable · [=]=mirror (O)=wheel");
      break;
    }
    case "list": {
      const cars = flags.car ? [findCar(state, flags.car)] : state.cars;
      cars.forEach((c) => {
        const country = sources.normalize(override || c.country);
        console.log("== " + (c.name || "(unnamed vehicle)") + " ==  [" + country.toUpperCase() + "]");
        if (!c.chips.length) console.log("  (no entries)");
        const params = shapes.paramsFor(c);
        c.chips.forEach((k, i) => {
          console.log(chipLine(k, i, params, c.wheel, country));
          timelineLines(k).forEach((l) => console.log(l));
        });
      });
      break;
    }
    case "add": {
      const car = findCar(state, flags.car);
      const x = parseFloat(flags.x), y = parseFloat(flags.y);
      if (isNaN(x) || isNaN(y) || x < 0 || x > 1 || y < 0 || y > 1) {
        die("--x and --y are required, as fractions 0..1 (see 'help')");
      }
      const size = flags.size || "c10";
      if (!SIZES.includes(size)) die("--size must be one of: " + SIZES.join(", "));
      const status = flags.status || "new";
      if (!logic.STATUS_TYPES.includes(status)) die("--status must be one of: " + logic.STATUS_TYPES.join(", "));
      const now = new Date().toISOString();
      const found = askDate("found", flags.found, now.slice(0, 10));
      const events = [logic.makeEvent("new", found)];
      if (status !== "new") {
        const extra = {};
        if (typeof flags.where === "string" && WHERE_TYPES[status]) extra.where = flags.where;
        if (typeof flags.note === "string") extra.note = flags.note;
        events.push(logic.makeEvent(status, found, extra));
      } else if (typeof flags.note === "string") {
        events.push(logic.makeEvent("note", found, { note: flags.note }));
      }
      car.chips.push({ id: logic.uid("k_"), x, y, size, events, up: now });
      printCar(car, { width: 58 });
      console.log("");
      emit(state, flags);
      break;
    }
    case "event": {
      const car = findCar(state, flags.car);
      const nr = parseInt(flags.marker, 10);
      const chip = car.chips[nr - 1];
      if (!chip) die("--marker <nr> required (1.." + car.chips.length + ")");
      const type = flags.type;
      if (!ADDABLE.includes(type)) die("--type must be one of: " + ADDABLE.join(", "));
      const date = askDate("date", flags.date, new Date().toISOString().slice(0, 10));
      const extra = {};
      if (typeof flags.where === "string" && WHERE_TYPES[type]) extra.where = flags.where;
      if (typeof flags.note === "string") extra.note = flags.note;
      chip.events.push(logic.makeEvent(type, date, extra));
      chip.up = new Date().toISOString();
      printCar(car, { width: 58 });
      console.log("");
      emit(state, flags);
      break;
    }
    case "decode":
      console.log(JSON.stringify({ v: 1, cars: state.cars }, null, 2));
      break;
    case "encode":
      emit(state, flags);
      break;
  }
}

try {
  main();
} catch (e) {
  die(e.message);
}
