/* Every control has to be reachable with a thumb.
 *
 * This app is used standing at a car, so the phone is the primary device — but
 * the CSS was written at a desk, where 33px is a comfortable button and nothing
 * complains. The `pointer: coarse` block exists to raise that to the ~44px a
 * finger needs (Apple HIG; Material asks 48dp), and this checks it actually
 * does, because nothing else can: the suite has no DOM by design.
 *
 * It works out each control's height from style.css the way a browser would —
 * base rule, then class override, then the media block, later rule winning.
 * Only the properties that decide height, which is enough to tell 20px from 44.
 * A simplification like that can be wrong in its own right, so it checks itself
 * against known arithmetic first and refuses to report anything if that fails.
 *
 * Run: node test/touch-targets.js */
"use strict";
const fs = require("fs");
const path = require("path");
const assert = require("assert");

const css = fs.readFileSync(path.join(__dirname, "..", "style.css"), "utf8");

function rules(src) {
  const out = [];
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(clean))) out.push({ sels: m[1].split(",").map((s) => s.trim()), decls: m[2] });
  return out;
}

const coarseSrc = (css.match(/@media \(pointer: coarse\)\s*\{([\s\S]*?)\n\}/) || [, ""])[1];
assert.ok(coarseSrc.trim(), "style.css has a `pointer: coarse` block — without it nothing here is sized for touch");
const BASE = rules(css.replace(/@media[^{]*\{[\s\S]*?\n\}/g, ""));
const COARSE = rules(coarseSrc);

// Rough specificity: ids, then classes/attributes, then elements. Enough for
// this file's flat selectors, and it has to be here — a media query doesn't add
// any, so `.legend-country select` outranks a `select` floor inside the coarse
// block no matter which comes last. Ignoring that would report a target as
// fixed while the browser kept it small.
function specificity(sel) {
  const ids = (sel.match(/#/g) || []).length;
  const classes = (sel.match(/\.[\w-]+|\[[^\]]*\]/g) || []).length;
  const elements = (sel.match(/(?:^|[\s>+~])[a-z]+/gi) || []).length;
  return ids * 10000 + classes * 100 + elements;
}

function decl(ruleset, selectors, prop) {
  let val = null, best = -1;
  ruleset.forEach((r, order) => {
    const hit = r.sels.filter((s) => selectors.includes(s));
    if (!hit.length) return;
    const m = r.decls.match(new RegExp("(?:^|;)\\s*" + prop + "\\s*:\\s*([^;]+)"));
    if (!m) return;
    // strongest selector wins; ties go to whichever is written later
    const rank = Math.max(...hit.map(specificity)) * 1000 + order;
    if (rank >= best) { best = rank; val = m[1].trim(); }
  });
  return val;
}

const BODY_FONT = 14, BODY_LH = 1.5; // body { font-size: 14px; line-height: 1.5 }
const BORDERED = ["button", "select", 'input[type="text"]', 'input[type="date"]', ".filebtn"];

// One cascade, base rules then the media block, so specificity is weighed
// across both rather than the block simply overwriting what came before.
function height(selectors, coarse) {
  const set = coarse ? BASE.concat(COARSE) : BASE;
  let border = selectors.some((s) => BORDERED.includes(s)) ? 2 : 0;
  const font = parseFloat(decl(set, selectors, "font-size")) || BODY_FONT;
  const lhRaw = decl(set, selectors, "line-height");
  const padRaw = decl(set, selectors, "padding");
  const borderRaw = decl(set, selectors, "border");
  const minRaw = decl(set, selectors, "min-height");
  const heightRaw = decl(set, selectors, "height");

  if (borderRaw && /none/.test(borderRaw)) border = 0;
  const padY = padRaw ? parseFloat(padRaw.split(/\s+/)[0]) * 2 : 0;
  const minH = minRaw ? parseFloat(minRaw) : 0;
  const line = lhRaw ? font * parseFloat(lhRaw) : font * BODY_LH;
  const box = heightRaw && !/auto/.test(heightRaw) ? parseFloat(heightRaw) : line + padY + border;
  return Math.max(box, minH);
}

// --- the reader checks itself before it reports on anyone else ---
// If these drift, every number below is fiction and the failures would be too.
const B = "button";
assert.strictEqual(height([B], false), 33,
  "base button should be 14px x 1.5 + 5px padding x2 + 1px border x2 = 33px — the parser is misreading style.css");
assert.strictEqual(height([".tl-del"], false), 21,
  "borderless .tl-del should be 14px x 1.5 + 0 padding = 21px — the parser is misreading style.css");

// Every control a finger has to land on, with the selectors that style it.
// A new button or select is covered by the floor on the shared rule without
// being listed here; anything with its own box needs adding.
const CONTROLS = [
  ["language toggle", [B, "button.ghost", "#langToggle"]],
  ["vehicle tab", [B, ".tab"]],
  ["vehicle name field", ['input[type="text"]']],
  ["wheel left/right", [B, ".seg button"]],
  ["shape preset button", [B, ".shape-btn"]],
  ["country picker", ["select", ".legend-country select"]],
  ["shape slider", ['input[type="range"]']],
  ["reset / propose", [B, "button.ghost"]],
  ["entry table row", ["#chipTable td"]],
  ["popup close (x)", [B, ".pop-x"]],
  ["timeline delete (x)", [".tl-del"]],
  ["size select (popup)", ["select", ".pf select"]],
  ["event date / note field", ['input[type="date"]', ".add-event input", ".add-event select"]],
  ["save event", [B, ".add-event input", ".add-event select"]],
  ["delete marker", [B, "button.ghost", ".pop-del"]],
  ["share / export buttons", [B]],
  ["import file button", [".filebtn"]],
  ["glass swap / delete car", [B, "button.ghost"]],
  ["import dialog buttons", [B]],
  ["source link (i)", [".rec-src"]],
];

const TARGET = 44;
const under = CONTROLS
  .map(([name, sel]) => ({ name, px: height(sel, true) }))
  .filter((c) => c.px < TARGET);
assert.deepStrictEqual(under, [],
  "under " + TARGET + "px on a touch screen: " + under.map((c) => c.name + " (" + c.px.toFixed(0) + "px)").join(", "));

// A size thing rather than a target thing, and it bites harder: iOS zooms the
// page in when a text field under 16px takes focus, and doesn't zoom back out.
[['input[type="text"]'], ['input[type="date"]'], [".add-event input", 'input[type="text"]']].forEach((sel) => {
  const px = parseFloat(decl(BASE.concat(COARSE), sel, "font-size")) || BODY_FONT;
  assert.ok(px >= 16, sel[0] + " is " + px + "px — under 16 iOS zooms the page on focus");
});

// The floor belongs to touch only — a desktop pointer is precise, and 44px
// controls there would be shouting. This is what keys the block on the pointer
// rather than on the viewport width.
assert.ok(height([B], false) < TARGET, "the desktop keeps its compact controls");

console.log("touch-targets: all " + CONTROLS.length + " controls reach " + TARGET + "px on a coarse pointer");
