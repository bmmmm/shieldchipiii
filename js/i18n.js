/* shieldchipiii — tiny DE/EN dictionary. */
(function () {
  "use strict";
  var DICT = {
    tagline: { de: "Steinschlag-Logbuch für deine Windschutzscheibe", en: "Stone chip logbook for your windshield" },
    hintClick: { de: "Klick auf die Scheibe = neuer Eintrag · Marker klicken = Details · ziehen = verschieben", en: "Click the glass to add an entry · click a marker for details · drag to move" },
    carName: { de: "Fahrzeug", en: "Vehicle" },
    carNamePh: { de: "z. B. Golf 7", en: "e.g. Golf Mk7" },
    addCar: { de: "+ Fahrzeug", en: "+ vehicle" },
    deleteCar: { de: "Fahrzeug löschen", en: "Delete vehicle" },
    confirmDeleteCar: { de: "Dieses Fahrzeug samt allen Einträgen löschen?", en: "Delete this vehicle and all its entries?" },
    glassSwap: { de: "Scheibe getauscht", en: "Windshield replaced" },
    confirmGlassSwap: { de: "Ganze Windschutzscheibe getauscht? Alle {count} Einträge dieses Fahrzeugs werden entfernt — frische Scheibe. Vorher ggf. exportieren.", en: "Whole windshield replaced? All {count} entries for this vehicle will be removed — fresh glass. Export first if you want to keep them." },
    shape: { de: "Form", en: "Shape" },
    shapeCompact: { de: "Kompakt", en: "Compact" },
    shapeSedan: { de: "Limousine", en: "Sedan" },
    shapeSuv: { de: "SUV", en: "SUV" },
    shapeVan: { de: "Van/Bus", en: "Van/bus" },
    shapeSport: { de: "Sport", en: "Sports" },
    adjust: { de: "Form nachziehen", en: "Tweak shape" },
    adjTop: { de: "Oberkante", en: "Top edge" },
    adjBottom: { de: "Unterkante", en: "Bottom edge" },
    adjHeight: { de: "Höhe", en: "Height" },
    adjRound: { de: "Rundung", en: "Corner rounding" },
    adjBow: { de: "Wölbung", en: "Edge bow" },
    adjWidthCm: { de: "Breite real", en: "Real width" },
    adjWheelCm: { de: "Lenkrad ⌀", en: "Wheel ⌀" },
    adjReset: { de: "zurücksetzen", en: "reset" },
    proposeShape: { de: "Als Auto-Modell vorschlagen ↗", en: "Propose as car model ↗" },
    wheel: { de: "Lenkrad", en: "Steering wheel" },
    wheelLeft: { de: "links", en: "left" },
    wheelRight: { de: "rechts", en: "right" },
    legendNoRepair: { de: "Rot = verbotener Bereich, Reparatur unwahrscheinlich:", en: "Red = no-go zone, repair unlikely:" },
    legendFov: { de: "Sichtfeld Fahrer:in, 29 cm", en: "driver's field of view, 29 cm" },
    legendMargin: { de: "Randzone, {cm} cm", en: "edge zone, {cm} cm" },
    country: { de: "Land", en: "Country" },
    chips: { de: "Einträge", en: "Entries" },
    noChips: { de: "Noch keine Einträge — klick auf die Scheibe.", en: "No entries yet — click the glass." },

    // sizes
    size: { de: "Größe", en: "Size" },
    sizeC10: { de: "< 10-Cent-Münze", en: "< 10-cent coin" },
    sizeC50: { de: "< 50-Cent-Münze", en: "< 50-cent coin" },
    // The repair threshold, named after the coin the local shop measures with
    // (sources.js). Kept apart from the "< …" label because the rule text names
    // the coin in a sentence.
    coinE2: { de: "2-Euro-Münze", en: "2-euro coin" },
    coinChf2: { de: "CHF-2-Münze", en: "CHF 2 coin" },
    coinDkk2: { de: "2-Kronen-Münze", en: "2-krone coin" },
    sizeCrackS: { de: "Riss klein (~2 cm)", en: "crack, small (~2 cm)" },
    sizeCrackM: { de: "Riss mittel (~5 cm)", en: "crack, medium (~5 cm)" },
    sizeCrackL: { de: "Riss groß (> 5 cm)", en: "crack, large (> 5 cm)" },

    // statuses (current state of a marker)
    statusNew: { de: "offen", en: "open" },
    statusObserving: { de: "beobachten", en: "observing" },
    statusRepairPlanned: { de: "Reparatur geplant", en: "repair planned" },
    statusRepaired: { de: "repariert", en: "repaired" },
    statusIrreparable: { de: "irreparabel", en: "irreparable" },

    // timeline event types (verbs / log lines)
    evNew: { de: "entdeckt", en: "found" },
    evObserving: { de: "beobachtet", en: "observed" },
    evRepairPlanned: { de: "Reparatur geplant", en: "repair planned" },
    evRepaired: { de: "repariert", en: "repaired" },
    evIrreparable: { de: "als irreparabel markiert", en: "marked irreparable" },
    evInsuranceReported: { de: "Versicherung gemeldet", en: "reported to insurance" },
    evNote: { de: "Notiz", en: "note" },

    // recommendations
    recommendation: { de: "Empfehlung", en: "Recommendation" },
    recSource: { de: "Kriterien laut Carglass {country} — Quelle öffnen", en: "Criteria per Carglass {country} — open the source" },
    recRepairable: { de: "Wahrscheinlich reparierbar. Teilkasko übernimmt die Reparatur oft ohne Selbstbeteiligung — zeitnah machen lassen, bevor der Chip reißt.", en: "Likely repairable. Comprehensive insurance often covers the repair with no deductible — get it done soon, before it cracks." },
    recReplaceFov: { de: "Steinschlag im verbotenen Bereich: im direkten Sichtfeld der Fahrer:in (eine Reparaturspur würde die Sicht stören). Reparatur unwahrscheinlich — bitte Dienstleister kontaktieren und klären.", en: "Chip in the no-go zone: in the driver's direct field of view (a repair mark would blur the view). A repair is unlikely — contact a glass service to check." },
    recReplaceEdge: { de: "Steinschlag im verbotenen Bereich: weniger als {cm} cm vom Scheibenrand (dort sitzt die Spannung im Glas). Reparatur unwahrscheinlich — bitte Dienstleister kontaktieren und klären.", en: "Chip in the no-go zone: less than {cm} cm from the edge (that's where the glass is under stress). A repair is unlikely — contact a glass service to check." },
    recReplaceCrack: { de: "Risse werden aus Sicherheitsgründen in der Regel nicht repariert, sondern die Scheibe wird getauscht — unabhängig von der Länge. Bitte Dienstleister kontaktieren und klären.", en: "Cracks generally aren't repaired for safety reasons — the glass gets replaced instead, whatever the length. Contact a glass service to check." },
    recPlanned: { de: "Reparatur geplant — Termin wahrnehmen, die Stelle bis dahin schonen (starke Temperaturwechsel und Waschanlage meiden).", en: "Repair planned — keep the appointment; until then avoid temperature shocks and car washes." },
    recWatchRepair: { de: "Repariert. Beobachten, ob die Stelle hält — reißt sie weiter, ist ein Scheibentausch fällig.", en: "Repaired. Keep an eye on it — if it keeps cracking, a replacement is due." },
    recIrreparable: { de: "Als irreparabel markiert — Scheibentausch veranlassen und mit der Versicherung klären.", en: "Marked irreparable — arrange a glass replacement and clear it with your insurer." },

    // marker popup
    fov: { de: "Im Sichtfeld", en: "In field of view" },
    edgeDistance: { de: "Randabstand", en: "Edge distance" },
    yes: { de: "ja", en: "yes" },
    no: { de: "nein", en: "no" },
    timeline: { de: "Verlauf", en: "Timeline" },
    eventType: { de: "Was", en: "What" },
    eventDate: { de: "Wann", en: "When" },
    eventWherePh: { de: "z. B. Carglass Bonn", en: "e.g. Safelite" },
    eventNote: { de: "Notiz", en: "Note" },
    saveEvent: { de: "Eintragen", en: "Add" },
    deleteEvent: { de: "Ereignis löschen", en: "Delete event" },
    deleteChip: { de: "Marker löschen", en: "Delete marker" },
    confirmDeleteChip: { de: "Diesen Marker samt Verlauf löschen?", en: "Delete this marker and its timeline?" },
    close: { de: "Schließen", en: "Close" },

    // share
    share: { de: "Teilen & Sichern", en: "Share & backup" },
    copyLink: { de: "Share-Link kopieren", en: "Copy share link" },
    copied: { de: "kopiert ✓", en: "copied ✓" },
    copyAscii: { de: "ASCII kopieren", en: "Copy ASCII" },
    exportJson: { de: "JSON exportieren", en: "Export JSON" },
    importJson: { de: "JSON importieren", en: "Import JSON" },
    shareNote: { de: "Alle Daten bleiben in diesem Browser (localStorage). Der Share-Link enthält alle Fahrzeuge und Einträge — nur an eigene Geräte weitergeben.", en: "All data stays in this browser (localStorage). The share link contains all vehicles and entries — only share with your own devices." },
    terminalNote: { de: "Terminal: cli/shieldchipiii.js show '<Share-Link>'", en: "Terminal: cli/shieldchipiii.js show '<share link>'" },
    importTitle: { de: "Daten aus Link importieren?", en: "Import data from link?" },
    importSummary: { de: "{cars} Fahrzeug(e), {chips} Eintrag/Einträge", en: "{cars} vehicle(s), {chips} entry/entries" },
    importMerge: { de: "Zusammenführen", en: "Merge" },
    importReplace: { de: "Ersetzen", en: "Replace" },
    importCancel: { de: "Abbrechen", en: "Cancel" },
    importBroken: { de: "Link konnte nicht gelesen werden (beschädigt oder unvollständig kopiert).", en: "Could not read the link (corrupted or copied incompletely)." },
    importFileBroken: { de: "Datei konnte nicht gelesen werden — ist es ein shieldchipiii-JSON-Export?", en: "Could not read the file — is it a shieldchipiii JSON export?" },

    ruleTitle: { de: "Faustregel Reparatur", en: "Repair rule of thumb" },
    ruleBody: { de: "Reparatur statt Tausch geht in der Regel nur, wenn alle drei Punkte stimmen: der Schaden ist kleiner als eine {coin}, er liegt außerhalb des Sichtfelds (29 cm breiter Bereich — eine DIN-A4-Seite quer — über dem Lenkrad), und er ist mehr als {cm} cm vom Scheibenrand entfernt. Trifft einer nicht zu, ist eine Reparatur unwahrscheinlich — dann hilft nur, den Dienstleister zu kontaktieren und es klären zu lassen. Die Teilkasko übernimmt die Reparatur oft ohne Selbstbeteiligung. Angaben ohne Gewähr — entschieden wird in der Werkstatt.", en: "A repair instead of a replacement usually needs all three to hold: the damage is smaller than a {coin}, it sits outside the field of view (a 29 cm band — a DIN A4 sheet on its side — above the wheel), and it is more than {cm} cm from the edge. If one fails, a repair is unlikely — contact a glass service and have them check. Comprehensive insurance often covers the repair fully. No guarantee — the shop decides." },
    footerLocal: { de: "kein Server · kein Tracking · alles lokal", en: "no server · no tracking · all local" },
  };

  var KEY = "shieldchipiii.lang";
  var lang = null;

  function detect() {
    try {
      var stored = localStorage.getItem(KEY);
      if (stored === "de" || stored === "en") return stored;
    } catch (e) { /* private mode */ }
    return (navigator.language || "en").slice(0, 2) === "de" ? "de" : "en";
  }

  function get() { return lang || (lang = detect()); }
  function set(l) {
    lang = l === "de" ? "de" : "en";
    try { localStorage.setItem(KEY, lang); } catch (e) { /* private mode */ }
  }
  function t(key, vars) {
    var entry = DICT[key];
    var s = entry ? (entry[get()] || entry.en) : key;
    if (vars) Object.keys(vars).forEach(function (k) { s = s.replace("{" + k + "}", vars[k]); });
    return s;
  }

  window.SC = window.SC || {};
  // DICT is exposed so the test can tell a missing translation from a present
  // one: t() falls back to English, which is what the UI wants and exactly what
  // would hide an untranslated string from an assertion.
  window.SC.i18n = { t: t, get: get, set: set, DICT: DICT, LANGS: ["de", "en"] };
})();
