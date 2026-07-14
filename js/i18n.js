/* shieldchipiii — tiny DE/EN dictionary. */
(function () {
  "use strict";
  var DICT = {
    tagline: { de: "Steinschlag-Logbuch für deine Windschutzscheibe", en: "Stone chip logbook for your windshield" },
    hintClick: { de: "Klick auf die Scheibe = neuer Eintrag · Marker ziehen = verschieben", en: "Click the glass to add an entry · drag a marker to move it" },
    carName: { de: "Fahrzeug", en: "Vehicle" },
    carNamePh: { de: "z. B. Golf 7", en: "e.g. Golf Mk7" },
    addCar: { de: "+ Fahrzeug", en: "+ vehicle" },
    deleteCar: { de: "Fahrzeug löschen", en: "Delete vehicle" },
    confirmDeleteCar: { de: "Dieses Fahrzeug samt allen Einträgen löschen?", en: "Delete this vehicle and all its entries?" },
    shape: { de: "Form", en: "Shape" },
    shapeCompact: { de: "Kompakt", en: "Compact" },
    shapeSedan: { de: "Limousine", en: "Sedan" },
    shapeSuv: { de: "SUV", en: "SUV" },
    shapeVan: { de: "Van/Bus", en: "Van/bus" },
    shapeSport: { de: "Sport", en: "Sports" },
    adjust: { de: "Trapez nachziehen", en: "Tweak trapezoid" },
    adjTop: { de: "Oberkante", en: "Top edge" },
    adjHeight: { de: "Höhe", en: "Height" },
    adjRound: { de: "Rundung", en: "Corner rounding" },
    adjReset: { de: "zurücksetzen", en: "reset" },
    wheel: { de: "Lenkrad", en: "Steering wheel" },
    wheelLeft: { de: "links", en: "left" },
    wheelRight: { de: "rechts", en: "right" },
    legendNew: { de: "neu", en: "new" },
    legendRepaired: { de: "repariert", en: "repaired" },
    legendCrack: { de: "Riss", en: "crack" },
    legendFov: { de: "Sichtfeld Fahrer:in", en: "driver's field of view" },
    chips: { de: "Einträge", en: "Entries" },
    noChips: { de: "Noch keine Einträge — klick auf die Scheibe.", en: "No entries yet — click the glass." },
    status: { de: "Status", en: "Status" },
    statusNew: { de: "neu", en: "new" },
    statusRepaired: { de: "repariert", en: "repaired" },
    size: { de: "Größe", en: "Size" },
    sizeC10: { de: "< 10-Cent-Münze", en: "< 10-cent coin" },
    sizeC50: { de: "< 50-Cent-Münze", en: "< 50-cent coin" },
    sizeE2: { de: "< 2-Euro-Münze", en: "< 2-euro coin" },
    sizeCrackS: { de: "Riss klein (~2 cm)", en: "crack, small (~2 cm)" },
    sizeCrackM: { de: "Riss mittel (~5 cm)", en: "crack, medium (~5 cm)" },
    sizeCrackL: { de: "Riss groß (> 5 cm)", en: "crack, large (> 5 cm)" },
    fov: { de: "Im Sichtfeld Fahrer:in", en: "In driver's field of view" },
    found: { de: "Entdeckt am", en: "Found on" },
    repairedAt: { de: "Repariert am", en: "Repaired on" },
    repairedBy: { de: "Repariert bei", en: "Repaired at" },
    repairedByPh: { de: "z. B. Carglass Bonn", en: "e.g. Safelite" },
    insurance: { de: "Versicherung gemeldet", en: "Reported to insurance" },
    insuranceAt: { de: "Gemeldet am", en: "Reported on" },
    note: { de: "Notiz", en: "Note" },
    deleteChip: { de: "Eintrag löschen", en: "Delete entry" },
    confirmDeleteChip: { de: "Diesen Eintrag löschen?", en: "Delete this entry?" },
    close: { de: "Schließen", en: "Close" },
    position: { de: "Position", en: "Position" },
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
    ruleBody: { de: "Kleiner als eine 2-Euro-Münze und außerhalb des Fahrer-Sichtfelds → meist reparierbar statt Scheibentausch; Teilkasko übernimmt die Reparatur oft ohne Selbstbeteiligung. Im Sichtfeld oder größer → Werkstatt fragen, Scheibe muss ggf. getauscht werden.", en: "Smaller than a 2-euro coin (~1 inch) and outside the driver's field of view → usually repairable instead of replacing the glass; comprehensive insurance often covers the repair fully. In the field of view or larger → ask a shop, the glass may need replacing." },
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
  window.SC.i18n = { t: t, get: get, set: set };
})();
