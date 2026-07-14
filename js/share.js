/* shieldchipiii — share tokens: #i:<base64url(gzip(json))>, fallback #j:<base64url(json)>.
 * Same wire format as the CLI (node:zlib gzip is interoperable with CompressionStream). */
(function () {
  "use strict";

  function bytesToB64url(bytes) {
    var bin = "";
    for (var i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function b64urlToBytes(s) {
    var b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  async function pipe(bytes, stream) {
    var out = new Response(new Blob([bytes]).stream().pipeThrough(stream));
    return new Uint8Array(await out.arrayBuffer());
  }

  // -> "i:<token>" or "j:<token>" (prefix included)
  async function encodeState(state) {
    var json = JSON.stringify({ v: 1, cars: state.cars });
    var raw = new TextEncoder().encode(json);
    if (typeof CompressionStream !== "undefined") {
      var gz = await pipe(raw, new CompressionStream("gzip"));
      return "i:" + bytesToB64url(gz);
    }
    return "j:" + bytesToB64url(raw);
  }

  var MAX_TOKEN = 512 * 1024, MAX_JSON = 2 * 1024 * 1024;

  // Accepts "i:…"/"j:…" with or without leading "#". Returns sanitized state or throws.
  async function decodeToken(token) {
    token = token.replace(/^#/, "");
    var kind = token.slice(0, 2), body = token.slice(2);
    if ((kind !== "i:" && kind !== "j:") || !body) throw new Error("not a share token");
    if (body.length > MAX_TOKEN) throw new Error("token too large");
    var bytes = b64urlToBytes(body);
    if (kind === "i:") {
      if (typeof DecompressionStream === "undefined") throw new Error("no gzip support in this browser");
      bytes = await pipe(bytes, new DecompressionStream("gzip"));
    }
    if (bytes.length > MAX_JSON) throw new Error("payload too large");
    var state = window.SC.store.sanitize(JSON.parse(new TextDecoder().decode(bytes)));
    if (!state) throw new Error("not a shieldchipiii payload");
    return state;
  }

  function baseUrl() {
    return location.origin === "null" || location.protocol === "file:"
      ? location.pathname.split("/").pop()
      : location.origin + location.pathname;
  }

  async function shareUrl(state) {
    return baseUrl() + "#" + (await encodeState(state));
  }

  window.SC = window.SC || {};
  window.SC.share = { encodeState: encodeState, decodeToken: decodeToken, shareUrl: shareUrl };
})();
