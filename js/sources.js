/* shieldchipiii — the repair criteria the app reasons with, per country.
 * Shared by browser and CLI (UMD-ish). No DOM, no i18n: country names come
 * from Intl at render time, all text from i18n.js / the CLI.
 *
 * Carglass publishes its own numbers per market and they differ — the edge
 * margin ranges from 10 cm (DE/AT) down to 3 cm (NO/SE). So the country
 * decides both the threshold the app reasons with and the page it cites:
 * citing carglass.es under a 10 cm claim would link a page that contradicts it.
 *
 * Every entry below was read off that country's own site (July 2026). Countries
 * whose criteria could not be verified are absent rather than guessed — an
 * unlisted country falls back to DEFAULT and is cited as such.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else { root.SC = root.SC || {}; root.SC.sources = factory(); }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // marginCm — the published minimum distance from the edge for a repair.
  // coin     — i18n key for the size gauge that country measures with, where it
  //            isn't the 2-euro one. The scale itself (c10/c50/e2) stays
  //            euro-based on purpose: every market allows at least a
  //            2-euro-sized chip (Norway even 6 cm), so what the app calls
  //            repairable is repairable everywhere — the scale errs strict, and
  //            only the threshold's name changes where the shop uses another coin.
  var COIN = "coinE2";
  var COUNTRIES = {
    at: { marginCm: 10, url: "https://www.carglass.at/reparatur-austausch/windschutzscheibe/reparatur-windschutzscheibe" },
    be: { marginCm: 6, url: "https://www.carglass.be/nl/autoruitschade/sterretje-voorruit-herstellen" },
    ch: { marginCm: 6, url: "https://www.carglass.ch/de/einen-steinschlag-auf-ihrer-windschutzscheibe-reparieren", coin: "coinChf2" },
    cz: { marginCm: 6, url: "https://carglass.cz/oprava-celniho-skla/" },
    de: { marginCm: 10, url: "https://www.carglass.de/steinschlag-reparatur" },
    dk: { marginCm: 5, url: "https://www.carglass.dk/reparation-af-stenslag", coin: "coinDkk2" },
    es: { marginCm: 2.5, url: "https://www.carglass.es/reparacion-lunas/reparacion-de-parabrisas" },
    fr: { marginCm: 5, url: "https://www.carglass.fr/nos-services/pare-brise/reparation-d-impact-sur-votre-pare-brise" },
    it: { marginCm: 6, url: "https://www.carglass.it/vetri/danni-ai-vetri/riparazione-parabrezza-scheggiato" },
    lu: { marginCm: 6, url: "https://www.carglass.lu/bris-de-glace/reparer-eclat-pare-brise" },
    no: { marginCm: 3, url: "https://www.carglass.no/" },
    pt: { marginCm: 5, url: "https://www.carglass.pt/vidro-partido" },
    se: { marginCm: 3, url: "https://www.carglass.se/laga-stenskott" },
  };
  var DEFAULT = "de";
  var CODES = Object.keys(COUNTRIES);

  function has(code) { return Object.prototype.hasOwnProperty.call(COUNTRIES, code); }
  function normalize(code) { return has(code) ? code : DEFAULT; }
  function criteriaFor(code) { return COUNTRIES[normalize(code)]; }
  function marginCmFor(code) { return criteriaFor(code).marginCm; }
  function coinKeyFor(code) { return criteriaFor(code).coin || COIN; }

  // Endonym-free country names, in the UI's language — beats carrying 13×2
  // hand-written labels that would drift. Falls back to the bare code where
  // Intl.DisplayNames is missing (older Safari), which still identifies it.
  function nameFor(code, lang) {
    try {
      var dn = new Intl.DisplayNames([lang || "en"], { type: "region" });
      return dn.of(code.toUpperCase()) || code.toUpperCase();
    } catch (e) {
      return code.toUpperCase();
    }
  }

  // Codes sorted by their name in `lang` — the order only makes sense once the
  // names are known, so it can't be a constant.
  function codesByName(lang) {
    return CODES.slice().sort(function (a, b) {
      return nameFor(a, lang).localeCompare(nameFor(b, lang), lang || "en");
    });
  }

  return {
    DEFAULT: DEFAULT, CODES: CODES,
    has: has, normalize: normalize, criteriaFor: criteriaFor,
    marginCmFor: marginCmFor, coinKeyFor: coinKeyFor,
    nameFor: nameFor, codesByName: codesByName,
  };
});
