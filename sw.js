/* shieldchipiii — offline shell. Cache-first over a precache stamped per
 * release: scripts/stamp-assets.sh rewrites STAMP together with index.html's
 * ?v= queries, so this file's bytes change on every release and the browser's
 * background update check installs the new shell on its own. The data never
 * passes through here — it lives in localStorage. */
"use strict";

var STAMP = "c2dbeec"; /* stamp-assets:managed */

// Every file index.html loads with a ?v= stamp. test/smoke.js compares this
// list against index.html, so a module added there and forgotten here fails
// the suite instead of breaking the app offline.
var STAMPED = [
  "style.css",
  "js/sources.js",
  "js/shapes.js",
  "js/logic.js",
  "js/ascii.js",
  "js/i18n.js",
  "js/store.js",
  "js/share.js",
  "js/render.js",
  "js/qr.js",
  "js/report.js",
  "js/anim.js",
  "js/anim-impact.js",
  "js/anim-shatter.js",
  "js/anim-wiper.js",
  "js/anim-radar.js",
  "js/app.js",
];
var PLAIN = ["./", "index.html", "favicon.svg", "manifest.webmanifest"];
var CACHE = "shieldchipiii-" + STAMP;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    return c.addAll(PLAIN.concat(STAMPED.map(function (f) { return f + "?v=" + STAMP; })));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// Cache-first for the precached shell, the network untouched for everything
// else (the criteria pages, the footer links — nothing cross-origin is ever
// cached). Navigations fall back to the cached index.html, so a cold start
// on a parking deck works with no signal at all.
self.addEventListener("fetch", function (e) {
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then(function (hit) {
    if (hit) return hit;
    if (e.request.mode === "navigate") {
      return caches.match("index.html").then(function (shell) { return shell || fetch(e.request); });
    }
    return fetch(e.request);
  }));
});
