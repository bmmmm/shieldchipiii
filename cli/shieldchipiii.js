#!/usr/bin/env node
/* shieldchipiii CLI — view and edit shieldchipiii data in the terminal.
 * Zero dependencies; shares shapes.js + ascii.js with the web app.
 * Wire format is identical to the browser (#i: = gzip+base64url, #j: = base64url). */
"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const shapes = require(path.join(__dirname, "..", "js", "shapes.js"));
const ascii = require(path.join(__dirname, "..", "js", "ascii.js"));

const SIZE_LABEL = {
  c10: "< 10-cent coin", c50: "< 50-cent coin", e2: "< 2-euro coin",
  crackS: "crack ~2cm", crackM: "crack ~5cm", crackL: "crack >5cm",
};
const SIZES = Object.keys(SIZE_LABEL);

function die(msg) {
  console.error("Error: " + msg);
  process.exit(1);
}

// ---------- token <-> state ----------

function decodeToken(token) {
  token = token.replace(/^#/, "");
  const kind = token.slice(0, 2);
  const body = token.slice(2);
  if ((kind !== "i:" && kind !== "j:") || !body) throw new Error("not a share token");
  let bytes = Buffer.from(body, "base64url");
  if (kind === "i:") bytes = zlib.gunzipSync(bytes);
  return JSON.parse(bytes.toString("utf8"));
}

function encodeToken(state) {
  const json = JSON.stringify({ v: 1, cars: state.cars });
  return "i:" + zlib.gzipSync(Buffer.from(json, "utf8"), { level: 9 }).toString("base64url");
}

// src = JSON file path, full share URL, or bare token
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
  if (!state || state.v !== 1 || !Array.isArray(state.cars) || !state.cars.length) {
    throw new Error("not a shieldchipiii payload");
  }
  return state;
}

// ---------- output ----------

function chipLine(k, i) {
  const cols = [
    String(i + 1).padStart(2),
    ascii.markerChar(k),
    (SIZE_LABEL[k.size] || k.size).padEnd(15),
    (k.status || "new").padEnd(9),
    (k.found || "").padEnd(10),
    k.fov ? "FOV" : "   ",
    k.insurance ? ("ins:" + (k.insuranceAt || "yes")).padEnd(14) : " ".repeat(14),
    k.status === "repaired" ? [k.repairedBy, k.repairedAt].filter(Boolean).join(" ") : "",
    k.note ? "// " + k.note : "",
  ];
  return "  " + cols.join(" ").replace(/\s+$/, "");
}

function printCar(car, opts) {
  console.log("");
  console.log("== " + (car.name || "(unnamed vehicle)") + " ==  [" + (car.shape || "sedan") + ", wheel " + (car.wheel || "left") + "]");
  console.log("");
  console.log(ascii.renderAscii(car, { width: opts.width }).replace(/^/gm, "   "));
  console.log("");
  if (!car.chips.length) {
    console.log("  (no entries)");
    return;
  }
  console.log("   # sym size            status    found      fov insurance      repair");
  car.chips.forEach((k, i) => console.log(chipLine(k, i)));
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
  const base = flags.base || process.env.SHIELDCHIPII_BASE;
  if (flags.out) {
    fs.writeFileSync(flags.out, JSON.stringify({ v: 1, cars: state.cars }, null, 2) + "\n");
    console.log("wrote " + flags.out);
  }
  console.log(base ? String(base).replace(/#.*$/, "") + "#" + token : "#" + token);
  if (!base) console.log("(open as <app-url>#" + token.slice(0, 12) + "…, or pass --base <app-url>)");
}

const USAGE = `shieldchipiii — windshield stone chip logbook (terminal client)

Usage:
  shieldchipiii.js show <src> [--car <name|nr>] [--width N]
  shieldchipiii.js list <src> [--car <name|nr>]
  shieldchipiii.js add <src> --x <0..1> --y <0..1> [--car <name|nr>]
                  [--size ${SIZES.join("|")}] [--status new|repaired]
                  [--fov] [--found YYYY-MM-DD] [--note "..."]
                  [--out file.json] [--base <app-url>]
  shieldchipiii.js decode <src>                     print JSON to stdout
  shieldchipiii.js encode <file.json> [--base url]  print share token/URL

<src> is a JSON export file, a full share URL, or a bare i:/j: token.
x/y are fractions: x = 0 (left edge) .. 1 (right edge, at the chip's height),
y = 0 (top) .. 1 (bottom). Example: --x 0.3 --y 0.6`;

// ---------- main ----------

function main() {
  const { flags, pos } = parseArgs(process.argv.slice(2));
  const cmd = pos[0];

  if (!cmd || cmd === "help" || flags.help) {
    console.log(USAGE);
    return;
  }

  const state = loadState(pos[1]);

  switch (cmd) {
    case "show": {
      const cars = flags.car ? [findCar(state, flags.car)] : state.cars;
      const width = Math.max(30, Math.min(120, parseInt(flags.width, 10) || 58));
      cars.forEach((c) => printCar(c, { width }));
      console.log("\n  o=chip x=crack *=repaired [=]=mirror (O)=steering wheel");
      break;
    }
    case "list": {
      const cars = flags.car ? [findCar(state, flags.car)] : state.cars;
      cars.forEach((c) => {
        console.log("== " + (c.name || "(unnamed vehicle)") + " ==");
        if (!c.chips.length) console.log("  (no entries)");
        c.chips.forEach((k, i) => console.log(chipLine(k, i)));
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
      if (!["new", "repaired"].includes(status)) die("--status must be new or repaired");
      const now = new Date().toISOString();
      car.chips.push({
        id: "k_" + Math.random().toString(36).slice(2, 10),
        x, y, size, status,
        fov: !!flags.fov,
        found: typeof flags.found === "string" ? flags.found : now.slice(0, 10),
        repairedAt: "", repairedBy: "", insurance: false, insuranceAt: "",
        note: typeof flags.note === "string" ? flags.note : "",
        up: now,
      });
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
    default:
      die("unknown command '" + cmd + "' — run 'shieldchipiii.js help'");
  }
}

try {
  main();
} catch (e) {
  die(e.message);
}
