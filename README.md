# shieldchipiii 🚗🪨

> Stone chip logbook for your windshield — **no server, no tracking, all local**.
>
> Steinschlag-Logbuch für die Windschutzscheibe — läuft komplett im Browser.

**→ [Live demo](https://bmmmm.github.io/shieldchipiii/)** · no framework · no build · no npm

Want it pre-filled? **[Open the demo data set](https://bmmmm.github.io/shieldchipiii/#i:H4sIAAAAAAAAE62TUY7TMBCGrxLNE0juKnYS28krSDwgXlZ9AqHKscdN2NSJnLSlVJU4BEfgDHuB3oSToFSbJrDVVlS8xWP_mv_7Z7KHDWSUgFa-hezTHkoDGegF52kYMaGAgFMrhAze1ZUNRPDqLa7q10CgLVTT13W9apTugIAyX9ZtB5lbVxWBbYFYQQYV2v5S12vX-R1kYLA_FmUzafiwQImGCymAwFfIwjvOCOz6j5gRaMtvfStkQAA36LqJFBeUWbQq10Cg2508OdwCAaO6_sBCxmehmNEYDp8JLGuHkO0PBNbN9JbPQ5nFaRamd3Eaf4QDOXujkjKZGDp4iwdvXJ69aRpeNIdW5ppa86I5PqN8bIgLgwJRJBNRnbfoN6VbPucK-1Rcfaptjz910XaBK3XRBb--_whyrHOliw7drfTMSmbDXA30YoC_OhhG00hESl0bDJ2yWxsZmRs2ijw2qvSLplLOobmgl2MAc_Sr0gU0zqJ-HtsCfV9-o_yyUm0bvD8-VjcnkaocaYLnJOSwB9G1JGysuWYqfTGJZEbFNAlM0MgwUX8n8TwDPgvpf6eVNJcWpR1ow-SJViTj1nulHz5cRDY0MhZlcm34yR-LLwXjMhGjqPQ9tFd5hRfEfJz8fdm2QbkK7pUzOXosdXH6AeZq3eoicMfHrlz-WxY3vj38BnefjARVBQAA)** —
one vehicle, five entries across every status (new, observing, repair
planned, repaired, irreparable), imported through the app's own share-link
mechanism: nothing is written until you confirm the dialog. Add
`?splash=impact` (or `shatter`, `wiper`, `radar`) to any app URL to pin one
of the four splash scenes — handy for showing it around.

Document every stone chip on your car's windshield: position on the glass,
size, repair status, insurance reporting. Data lives in `localStorage`;
sharing between devices works via QR code, URL token, JSON export — or the
terminal.

**UI is bilingual (DE/EN)**, auto-detected, toggle in the header.

## Features

- **Windshield diagram** — the view from the driver's seat, where a pane looks
  close to rectangular: the top edge (roof line, nearly overhead) is the near
  one and the bottom edge (end of the bonnet) the far one, so perspective
  widens the top about as much as the body tapers it. Mirror top center, plus
  a schematic cockpit for orientation:
  the steering wheel is drawn to its real diameter (38–40 cm comfort, 36–37
  compact/sporty, 32–35 aftermarket sports — adjustable), foreshortened into
  an ellipse like the glass. 5 shape presets (compact, sedan, SUV, van/bus,
  sports) plus free shape tweaking (top edge, bottom edge, height, corner
  rounding, edge bow, real width, wheel ⌀). Left/right-hand drive.
- **Chips & cracks** — click the glass to add an entry, click a marker for its
  popup, drag to move. Per entry: size (`< 10-cent` / `< 50-cent` / `< 2-euro`
  coin, crack ~2 cm / ~5 cm / > 5 cm), driver's field of view (suggested from
  the position), and an **event timeline** — found, observed, repair planned,
  repaired (where/when), irreparable, reported to insurance, notes. The current
  status is the latest status event, and drives an actionable **repair
  recommendation**.
- **Repairable or not, by the shop's rules** — the diagram marks the two zones
  where a repair is normally refused: the **29 cm field of view** (a DIN A4
  sheet on its side, above the wheel) and the **edge margin**, where the glass
  is under stress. Both are real centimetres: each preset carries the pane's
  real size (`widthCm`/`heightCm`, adjustable), so the margin covers more of a
  small pane than of a large one, and it is drawn thinner top/bottom because the
  view from inside is foreshortened. The popup shows each chip's edge distance
  in cm.
- **Criteria follow the country** — Carglass publishes different numbers per
  market, and the edge margin is where they diverge: 10 cm in Germany and
  Austria, 6 cm in Switzerland, Belgium and Italy, 5 cm in France, Portugal and
  Denmark, 3 cm in Norway and Sweden, 2.5 cm in Spain. Pick the country and the
  drawn zone, the verdicts and the cited page all move with it — the ⓘ next to a
  recommendation opens that country's own criteria page. The size scale stays
  euro-based on purpose: every market allows at least a 2-euro-sized chip, so
  what the app calls repairable is repairable everywhere (only the threshold is
  renamed where the shop measures with another coin — CHF 2, 2-krone).
  Countries whose criteria could not be verified are absent rather than guessed.
- **How many chips the pane can take** — Germany, Austria, France, Norway and
  Sweden cap how many they repair before replacing the glass (3); the other
  countries publish no number and so get no hint. Reach the cap and the entries
  list says so, above the table — it's a statement about the pane, not about one
  marker. Only chips whose repair is still open count: a repaired one has
  settled the question, an irreparable one already forces a replacement on its
  own. Adding more is never blocked — the app records what's on the glass, it
  doesn't ration it.
- **Multiple vehicles** — tabs, each with its own shape and entries. Replacing
  the whole windshield is a vehicle-level action (*Windshield replaced*), not a
  per-chip status — it clears the vehicle's markers for a fresh pane.
- **Device sync** — a two-card sync panel: a large QR code (drawn by the
  dependency-free `js/qr.js`, no CDN), live indicators for vehicles, entries,
  link size and whether the state still fits a QR code, a one-tap copy
  button, and a paste field to receive a link from the other device. QR code
  and share link (`#i:` = gzip + base64url) encode the same complete state.
- **Merging keeps deletions** — importing offers *Merge (recommended)*:
  newest edit wins per entry, event timelines are unioned, and deleting a
  vehicle, a chip or a single event survives the next sync instead of being
  resurrected by the other device (tombstones travel with the data). On a
  pristine device the dialog offers a single *Take over* instead, and a toast
  sums up what a merge did ("1 entry new · 1 deletion kept").
- **Backup** — export/import JSON, or copy the diagram as ASCII art.
- **Works offline** — a service worker precaches the app shell, so once
  visited the app starts with no signal (the place you find chips is a
  parking deck). Install it to the home screen for an app icon and a
  standalone window. Updates arrive one start later — the shell is served
  cache-first; the data itself never needed the network to begin with.
- **A splash of brand** — page loads rotate through four ASCII splash scenes
  (a chip cracks the glass and a squeegee wipes it clean · the shatter runs
  backward into the wordmark · a wiper clears the rain off the brand · a
  radar scan finds the chip and identifies the maker), each landing on the
  CARGLASS ribbon, the slogan and a fan-demo note. The full scene plays once
  a day; later loads get a one-second landing instead. Any click or key skips
  it, `?splash=<id>` pins a scene (and always plays it in full), reduced
  motion gets a still logo — and recording a repair as planned or done plays
  a micro-flourish that dissolves into the marker's own `@` or `*`.
- **Workshop report** — one tap opens a printable sheet for the shop: the
  drawing, the pane's real measurements, the country criteria the verdicts
  came from (source cited), a damage table with edge distances, and each
  entry's full history. Print it or save it as a PDF. Every number on the
  sheet comes from the same functions the app itself judges by.
- **Terminal client** — the same data, rendered as ASCII in your shell.
- **Community car models** — tweaked the shape to match your car? Click
  *Propose as car model* (under shape tweaking) to open a prefilled
  [issue form](https://github.com/bmmmm/shieldchipiii/issues/new?template=car-model.yml).
  Accepted proposals become named presets.

## Quickstart

Open `index.html` in a browser. That's it — no build, no framework, no npm.

Tests: `node test/smoke.js` and `node test/touch-targets.js` — no
dependencies there either. CI runs both on every push.

Releasing: run `scripts/stamp-assets.sh` first — it stamps the asset URLs in
`index.html` and the service worker's cache (`sw.js`) with the current commit
hash, so browsers can't mix cached old modules with a fresh deploy (the smoke
test fails on inconsistent stamps or a precache list that drifts).

## Terminal

```
node cli/shieldchipiii.js show  '<share link>'      ASCII diagram + entry table
node cli/shieldchipiii.js list  export.json         entry table + full timeline
node cli/shieldchipiii.js add   export.json --x 0.3 --y 0.6 --size c50
node cli/shieldchipiii.js event export.json --marker 2 --type repaired \
                               --where "Carglass Bonn"
node cli/shieldchipiii.js qr    export.json --base https://example.com/
                                                    share link as a terminal QR
node cli/shieldchipiii.js decode '<share link>'     JSON to stdout
node cli/shieldchipiii.js encode export.json --base https://example.com/
```

`<src>` is interchangeable: a JSON export file, a full share URL, or a bare
`i:`/`j:` token. `add` and `event` print a fresh share URL you can open in the
browser (merge on import); `--out file.json` also writes the JSON. Whether a
chip is in the field of view or the edge zone follows from `--x`/`--y` — it's
read off the position, never passed in. `decode` prints the full state
including the `gone` tombstones that let deletions survive a merge.

Example output:

```
== Golf 7 ==  [sedan, wheel left]

 _________________[=]________________
\                  |                 /
 \                                  /
 \       o1                         /
 \                    X2            /
  \                                /
  \                                /
  \________________________________/
 ~~~~~~~~(O)~~~~~~~~~~~~~~~~~~~~~~~~~
```

The pane tapers downward because you are looking at it from the driver's seat:
the top edge is the near one.

## Data & privacy

Everything stays in your browser (`localStorage`). The share link — and the
QR code, which encodes the same URL — contains your **complete** data,
unencrypted: treat both like the data itself and only share them with your
own devices.

## Repair rule of thumb (DE)

Eine Reparatur statt Scheibentausch geht in der Regel nur, wenn **alle drei**
Punkte stimmen:

- Der Schaden ist **kleiner als eine 2-Euro-Münze**.
- Er liegt **außerhalb des Sichtfelds** — ein 29 cm breiter Bereich (DIN A4
  quer) über dem Lenkrad.
- Er ist **mehr als 10 cm vom Scheibenrand** entfernt — das ist der deutsche
  Wert; andere Länder sind toleranter (s. `js/sources.js`), die App rechnet mit
  dem Wert des eingestellten Landes.

Dazu: **höchstens 3 Steinschläge** auf der Scheibe, sonst wird getauscht.

Ein **Riss** wird gar nicht repariert, unabhängig von der Länge — dann wird die
Scheibe getauscht.

Trifft einer nicht zu, ist eine Reparatur unwahrscheinlich — dann hilft nur,
den Dienstleister zu kontaktieren und es klären zu lassen. Die Teilkasko
übernimmt die Reparatur oft ohne Selbstbeteiligung. Angaben ohne Gewähr —
entschieden wird in der Werkstatt.

## Trademark & affiliation

This is an unofficial fan demo. CARGLASS® is a registered trademark of
Belron International Ltd.; this project is not affiliated with, endorsed by
or connected to Carglass or Belron. The brand appears as an ASCII-art homage
in the splash animation — the splash itself and the app footer say so out
loud — and the repair criteria cite the shops' own public pages as sources.

## Support

If this is useful to you: [ko-fi.com/bmabma](https://ko-fi.com/bmabma) ☕

## License

[GPL-3.0-or-later](LICENSE)
