/* shieldchipiii — QR Code encoder. Byte mode only, versions 1-40 auto-selected
 * (smallest that fits), error correction boosted from LOW up to the highest level
 * that still fits the chosen version. Pure data: no DOM, SVG output is a string.
 *
 * Based on QR Code generator library by Project Nayuki (MIT),
 * https://www.nayuki.io/page/qr-code-generator-library
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *   The above copyright notice and this permission notice shall be included in all
 *   copies or substantial portions of the Software.
 *   The Software is provided "as is", without warranty of any kind, express or
 *   implied, including but not limited to the warranties of merchantability, fitness
 *   for a particular purpose and noninfringement. In no event shall the authors or
 *   copyright holders be liable for any claim, damages or other liability, whether
 *   in an action of contract, tort or otherwise, arising from, out of or in
 *   connection with the Software or the use or other dealings in the Software.
 *
 * This project as a whole is GPL-3.0-or-later; this MIT-derived file is embedded
 * with its attribution and permission notice intact, which MIT allows. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.qr = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // Error correction levels: ordinal indexes the codeword tables, formatBits
  // goes into the drawn format information.
  var ECC = {
    LOW:      { ordinal: 0, formatBits: 1 },
    MEDIUM:   { ordinal: 1, formatBits: 0 },
    QUARTILE: { ordinal: 2, formatBits: 3 },
    HIGH:     { ordinal: 3, formatBits: 2 },
  };

  var PENALTY_N1 = 3, PENALTY_N2 = 3, PENALTY_N3 = 40, PENALTY_N4 = 10;

  // ECC codewords per block, indexed [level.ordinal][version]; index 0 is an
  // unused placeholder so versions map to their own number.
  var ECC_CODEWORDS_PER_BLOCK = [
    [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
    [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
    [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  ];

  var NUM_ERROR_CORRECTION_BLOCKS = [
    [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
    [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
    [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
    [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
  ];

  // ---------- bit helpers ----------

  function appendBits(val, len, bb) {
    for (var i = len - 1; i >= 0; i--) bb.push((val >>> i) & 1);
  }

  function getBit(x, i) { return ((x >>> i) & 1) !== 0; }

  // UTF-8 encode to an array of byte values. Kept host-independent (no
  // TextEncoder) so the encoder core touches nothing beyond plain arrays.
  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      // Fold a surrogate pair into one code point before encoding.
      if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var lo = str.charCodeAt(i + 1);
        if (lo >= 0xDC00 && lo <= 0xDFFF) { c = 0x10000 + ((c - 0xD800) << 10) + (lo - 0xDC00); i++; }
      }
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 0x3F), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
    }
    return out;
  }

  // ---------- capacity math ----------

  // Byte-mode character-count field width: 8 bits for v1-9, else 16.
  function numCharCountBits(ver) { return [8, 16, 16][Math.floor((ver + 7) / 17)]; }

  function getNumRawDataModules(ver) {
    var result = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var numAlign = Math.floor(ver / 7) + 2;
      result -= (25 * numAlign - 10) * numAlign - 55;
      if (ver >= 7) result -= 36;
    }
    return result;
  }

  function getNumDataCodewords(ver, ecl) {
    return Math.floor(getNumRawDataModules(ver) / 8)
      - ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver] * NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
  }

  // ---------- Reed-Solomon (GF(2^8), primitive polynomial 0x11D) ----------

  function reedSolomonMultiply(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }

  function reedSolomonComputeDivisor(degree) {
    var result = [], i;
    for (i = 0; i < degree - 1; i++) result.push(0);
    result.push(1);
    var root = 1;
    for (i = 0; i < degree; i++) {
      for (var j = 0; j < result.length; j++) {
        result[j] = reedSolomonMultiply(result[j], root);
        if (j + 1 < result.length) result[j] ^= result[j + 1];
      }
      root = reedSolomonMultiply(root, 0x02);
    }
    return result;
  }

  function reedSolomonComputeRemainder(data, divisor) {
    var result = [], i;
    for (i = 0; i < divisor.length; i++) result.push(0);
    for (i = 0; i < data.length; i++) {
      var factor = data[i] ^ result.shift();
      result.push(0);
      for (var j = 0; j < divisor.length; j++) result[j] ^= reedSolomonMultiply(divisor[j], factor);
    }
    return result;
  }

  // ---------- matrix drawing ----------

  function newRow(size) {
    var row = [];
    for (var i = 0; i < size; i++) row.push(false);
    return row;
  }

  function setFunctionModule(qr, x, y, isDark) {
    qr.modules[y][x] = isDark;
    qr.isFunction[y][x] = true;
  }

  function getAlignmentPatternPositions(qr) {
    var ver = qr.version;
    if (ver === 1) return [];
    var numAlign = Math.floor(ver / 7) + 2;
    var step = ver === 32 ? 26 : Math.ceil((ver * 4 + 4) / (numAlign * 2 - 2)) * 2;
    var result = [6];
    for (var pos = qr.size - 7; result.length < numAlign; pos -= step) result.splice(1, 0, pos);
    return result;
  }

  function drawFinderPattern(qr, x, y) {
    for (var dy = -4; dy <= 4; dy++) {
      for (var dx = -4; dx <= 4; dx++) {
        var dist = Math.max(Math.abs(dx), Math.abs(dy)); // Chebyshev distance
        var xx = x + dx, yy = y + dy;
        if (xx >= 0 && xx < qr.size && yy >= 0 && yy < qr.size)
          setFunctionModule(qr, xx, yy, dist !== 2 && dist !== 4);
      }
    }
  }

  function drawAlignmentPattern(qr, x, y) {
    for (var dy = -2; dy <= 2; dy++)
      for (var dx = -2; dx <= 2; dx++)
        setFunctionModule(qr, x + dx, y + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  function drawFormatBits(qr, mask) {
    var data = (qr.ecl.formatBits << 3) | mask;
    var rem = data, i;
    for (i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
    var bits = ((data << 10) | rem) ^ 0x5412; // 15-bit BCH, masked to a fixed pattern
    for (i = 0; i <= 5; i++) setFunctionModule(qr, 8, i, getBit(bits, i));
    setFunctionModule(qr, 8, 7, getBit(bits, 6));
    setFunctionModule(qr, 8, 8, getBit(bits, 7));
    setFunctionModule(qr, 7, 8, getBit(bits, 8));
    for (i = 9; i < 15; i++) setFunctionModule(qr, 14 - i, 8, getBit(bits, i));
    var size = qr.size;
    for (i = 0; i < 8; i++) setFunctionModule(qr, size - 1 - i, 8, getBit(bits, i));
    for (i = 8; i < 15; i++) setFunctionModule(qr, 8, size - 15 + i, getBit(bits, i));
    setFunctionModule(qr, 8, size - 8, true); // always dark
  }

  function drawVersion(qr) {
    if (qr.version < 7) return;
    var rem = qr.version, i;
    for (i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
    var bits = (qr.version << 12) | rem; // 18-bit BCH
    for (i = 0; i < 18; i++) {
      var color = getBit(bits, i);
      var a = qr.size - 11 + i % 3, b = Math.floor(i / 3);
      setFunctionModule(qr, a, b, color);
      setFunctionModule(qr, b, a, color);
    }
  }

  function drawFunctionPatterns(qr) {
    var size = qr.size, i;
    for (i = 0; i < size; i++) {
      setFunctionModule(qr, 6, i, i % 2 === 0);
      setFunctionModule(qr, i, 6, i % 2 === 0);
    }
    drawFinderPattern(qr, 3, 3);
    drawFinderPattern(qr, size - 4, 3);
    drawFinderPattern(qr, 3, size - 4);

    var pos = getAlignmentPatternPositions(qr), n = pos.length;
    for (var a = 0; a < n; a++) {
      for (var b = 0; b < n; b++) {
        // The three finder corners already occupy these slots.
        if (!(a === 0 && b === 0 || a === 0 && b === n - 1 || a === n - 1 && b === 0))
          drawAlignmentPattern(qr, pos[a], pos[b]);
      }
    }
    drawFormatBits(qr, 0); // dummy mask; the real one is drawn after masking
    drawVersion(qr);
  }

  // Split data into blocks, append per-block Reed-Solomon ECC, then interleave.
  function addEccAndInterleave(qr, data) {
    var ver = qr.version, ecl = qr.ecl;
    var numBlocks = NUM_ERROR_CORRECTION_BLOCKS[ecl.ordinal][ver];
    var blockEccLen = ECC_CODEWORDS_PER_BLOCK[ecl.ordinal][ver];
    var rawCodewords = Math.floor(getNumRawDataModules(ver) / 8);
    var numShortBlocks = numBlocks - rawCodewords % numBlocks;
    var shortBlockLen = Math.floor(rawCodewords / numBlocks);

    var blocks = [], rsDiv = reedSolomonComputeDivisor(blockEccLen);
    for (var i = 0, k = 0; i < numBlocks; i++) {
      var datLen = shortBlockLen - blockEccLen + (i < numShortBlocks ? 0 : 1);
      var dat = data.slice(k, k + datLen);
      k += dat.length;
      var ecc = reedSolomonComputeRemainder(dat, rsDiv);
      if (i < numShortBlocks) dat.push(0); // pad short blocks to full width for interleaving
      blocks.push(dat.concat(ecc));
    }

    var result = [];
    for (i = 0; i < blocks[0].length; i++) {
      for (var j = 0; j < blocks.length; j++) {
        // Skip the padding byte that only short blocks carry.
        if (i !== shortBlockLen - blockEccLen || j >= numShortBlocks) result.push(blocks[j][i]);
      }
    }
    return result;
  }

  function drawCodewords(qr, data) {
    var size = qr.size, i = 0;
    // Zigzag up/down through pairs of columns, skipping the vertical timing line.
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) {
        for (var j = 0; j < 2; j++) {
          var x = right - j;
          var upward = ((right + 1) & 2) === 0;
          var y = upward ? size - 1 - vert : vert;
          if (!qr.isFunction[y][x] && i < data.length * 8) {
            qr.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7));
            i++;
          }
        }
      }
    }
  }

  // XOR the data region with mask pattern `mask`; applying twice undoes it.
  function applyMask(qr, mask) {
    var size = qr.size;
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        var invert;
        switch (mask) {
          case 0: invert = (x + y) % 2 === 0; break;
          case 1: invert = y % 2 === 0; break;
          case 2: invert = x % 3 === 0; break;
          case 3: invert = (x + y) % 3 === 0; break;
          case 4: invert = (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; break;
          case 5: invert = (x * y) % 2 + (x * y) % 3 === 0; break;
          case 6: invert = ((x * y) % 2 + (x * y) % 3) % 2 === 0; break;
          case 7: invert = ((x + y) % 2 + (x * y) % 3) % 2 === 0; break;
        }
        if (!qr.isFunction[y][x] && invert) qr.modules[y][x] = !qr.modules[y][x];
      }
    }
  }

  function finderPenaltyCountPatterns(rh) {
    var n = rh[1];
    var core = n > 0 && rh[2] === n && rh[3] === n * 3 && rh[4] === n && rh[5] === n;
    return (core && rh[0] >= n * 4 && rh[6] >= n ? 1 : 0)
         + (core && rh[6] >= n * 4 && rh[0] >= n ? 1 : 0);
  }

  function finderPenaltyAddHistory(qr, runLen, rh) {
    if (rh[0] === 0) runLen += qr.size; // light border before the first run
    rh.pop();
    rh.unshift(runLen);
  }

  function finderPenaltyTerminateAndCount(qr, runColor, runLen, rh) {
    if (runColor) { finderPenaltyAddHistory(qr, runLen, rh); runLen = 0; }
    runLen += qr.size; // light border after the last run
    finderPenaltyAddHistory(qr, runLen, rh);
    return finderPenaltyCountPatterns(rh);
  }

  function getPenaltyScore(qr) {
    var size = qr.size, modules = qr.modules, result = 0;
    var x, y, runColor, runLen, rh;

    for (y = 0; y < size; y++) {
      runColor = false; runLen = 0; rh = [0, 0, 0, 0, 0, 0, 0];
      for (x = 0; x < size; x++) {
        if (modules[y][x] === runColor) {
          runLen++;
          if (runLen === 5) result += PENALTY_N1;
          else if (runLen > 5) result++;
        } else {
          finderPenaltyAddHistory(qr, runLen, rh);
          if (!runColor) result += finderPenaltyCountPatterns(rh) * PENALTY_N3;
          runColor = modules[y][x]; runLen = 1;
        }
      }
      result += finderPenaltyTerminateAndCount(qr, runColor, runLen, rh) * PENALTY_N3;
    }
    for (x = 0; x < size; x++) {
      runColor = false; runLen = 0; rh = [0, 0, 0, 0, 0, 0, 0];
      for (y = 0; y < size; y++) {
        if (modules[y][x] === runColor) {
          runLen++;
          if (runLen === 5) result += PENALTY_N1;
          else if (runLen > 5) result++;
        } else {
          finderPenaltyAddHistory(qr, runLen, rh);
          if (!runColor) result += finderPenaltyCountPatterns(rh) * PENALTY_N3;
          runColor = modules[y][x]; runLen = 1;
        }
      }
      result += finderPenaltyTerminateAndCount(qr, runColor, runLen, rh) * PENALTY_N3;
    }
    for (y = 0; y < size - 1; y++) {
      for (x = 0; x < size - 1; x++) {
        var color = modules[y][x];
        if (color === modules[y][x + 1] && color === modules[y + 1][x] && color === modules[y + 1][x + 1])
          result += PENALTY_N2;
      }
    }
    var dark = 0;
    for (y = 0; y < size; y++) for (x = 0; x < size; x++) if (modules[y][x]) dark++;
    var total = size * size;
    // Smallest k with (45-5k)% <= dark/total <= (55+5k)%.
    var k = Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1;
    return result + k * PENALTY_N4;
  }

  function buildMatrix(version, ecl, dataCodewords) {
    var size = version * 4 + 17;
    var modules = [], isFunction = [];
    for (var i = 0; i < size; i++) { modules.push(newRow(size)); isFunction.push(newRow(size)); }
    var qr = { version: version, ecl: ecl, size: size, modules: modules, isFunction: isFunction };

    drawFunctionPatterns(qr);
    drawCodewords(qr, addEccAndInterleave(qr, dataCodewords));

    // Pick the mask with the lowest penalty; format bits count toward the score.
    var mask = 0, minPenalty = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(qr, m);
      drawFormatBits(qr, m);
      var penalty = getPenaltyScore(qr);
      if (penalty < minPenalty) { mask = m; minPenalty = penalty; }
      applyMask(qr, m); // XOR again to revert
    }
    applyMask(qr, mask);
    drawFormatBits(qr, mask);
    return qr;
  }

  // ---------- public encode ----------

  function encodeBytes(dataBytes) {
    var ecl = ECC.LOW;

    // Byte-mode bit length for a version, or Infinity if the length field is too narrow.
    function usedBits(ver) {
      var ccbits = numCharCountBits(ver);
      if (dataBytes.length >= (1 << ccbits)) return Infinity;
      return 4 + ccbits + dataBytes.length * 8;
    }

    var version, dataUsedBits;
    for (version = 1; ; version++) {
      var capacityBits = getNumDataCodewords(version, ecl) * 8;
      var ub = usedBits(version);
      if (ub <= capacityBits) { dataUsedBits = ub; break; }
      if (version >= 40) throw new Error("too long");
    }

    // Boost ECC to the highest level the data still fits in this same version.
    [ECC.MEDIUM, ECC.QUARTILE, ECC.HIGH].forEach(function (newEcl) {
      if (dataUsedBits <= getNumDataCodewords(version, newEcl) * 8) ecl = newEcl;
    });

    var bb = [];
    appendBits(0x4, 4, bb); // byte-mode indicator
    appendBits(dataBytes.length, numCharCountBits(version), bb);
    for (var i = 0; i < dataBytes.length; i++) appendBits(dataBytes[i], 8, bb);

    var capBits = getNumDataCodewords(version, ecl) * 8;
    appendBits(0, Math.min(4, capBits - bb.length), bb);   // terminator
    appendBits(0, (8 - bb.length % 8) % 8, bb);            // pad to a byte boundary
    for (var pad = 0xEC; bb.length < capBits; pad ^= 0xEC ^ 0x11) appendBits(pad, 8, bb);

    var dataCodewords = [];
    for (var j = 0; j < bb.length; j++) {
      if ((j & 7) === 0) dataCodewords.push(0);
      dataCodewords[j >>> 3] |= bb[j] << (7 - (j & 7));
    }

    return buildMatrix(version, ecl, dataCodewords);
  }

  function encode(text) {
    var qr = encodeBytes(utf8Bytes(text));
    return { size: qr.size, modules: qr.modules };
  }

  // A complete <svg>: white quiet zone + one black path, fixed colors so any
  // scanner sees the dark-on-light it expects regardless of app theme.
  function svg(text, border) {
    if (border === undefined) border = 4;
    if (border < 0) throw new Error("border out of range");
    var qr = encodeBytes(utf8Bytes(text));
    var size = qr.size, dim = size + border * 2;
    var path = [];
    for (var y = 0; y < size; y++) {
      for (var x = 0; x < size; x++) {
        if (qr.modules[y][x]) path.push("M" + (x + border) + "," + (y + border) + "h1v1h-1z");
      }
    }
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + dim + " " + dim +
      '" shape-rendering="crispEdges">' +
      '<rect width="100%" height="100%" fill="#fff"/>' +
      '<path d="' + path.join(" ") + '" fill="#000"/>' +
      "</svg>";
  }

  return { encode: encode, svg: svg };
});
