# shieldchipiii 🚗🪨

> Stone chip logbook for your windshield — **no server, no tracking, all local**.
>
> Steinschlag-Logbuch für die Windschutzscheibe — läuft komplett im Browser.

**→ [Live demo](https://bmmmm.github.io/shieldchipiii/)** · no framework · no build · no npm

Document every stone chip on your car's windshield: position on the glass,
size, repair status, insurance reporting. Data lives in `localStorage`;
sharing between devices works via URL token, JSON export — or the terminal.

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
  sheet on its side, above the wheel) and the **10 cm edge margin**, where the
  glass is under stress. Both are real centimetres: each preset carries the
  pane's real size (`widthCm`/`heightCm`, adjustable), so 10 cm covers more of
  a small pane than of a large one, and the margin is drawn thinner top/bottom
  because the view from inside is foreshortened. The popup shows each chip's
  edge distance in cm.
- **Multiple vehicles** — tabs, each with its own shape and entries. Replacing
  the whole windshield is a vehicle-level action (*Windshield replaced*), not a
  per-chip status — it clears the vehicle's markers for a fresh pane.
- **Share & backup** — copy a share link (`#i:` = gzip + base64url), export/
  import JSON, copy the diagram as ASCII art. Importing offers merge
  (newest edit wins per entry) or replace.
- **Terminal client** — the same data, rendered as ASCII in your shell.
- **Community car models** — tweaked the shape to match your car? Click
  *Propose as car model* (under shape tweaking) to open a prefilled
  [issue form](https://github.com/bmmmm/shieldchipiii/issues/new?template=car-model.yml).
  Accepted proposals become named presets.

## Quickstart

Open `index.html` in a browser. That's it — no build, no framework, no npm.

## Terminal

```
node cli/shieldchipiii.js show  '<share link>'      ASCII diagram + entry table
node cli/shieldchipiii.js list  export.json         entry table only
node cli/shieldchipiii.js add   export.json --x 0.3 --y 0.6 --size c50 --fov
node cli/shieldchipiii.js decode '<share link>'     JSON to stdout
node cli/shieldchipiii.js encode export.json --base https://example.com/
```

`<src>` is interchangeable: a JSON export file, a full share URL, or a bare
`i:`/`j:` token. `add` prints a fresh share URL you can open in the browser
(merge on import); `--out file.json` also writes the JSON.

Example output:

```
== Golf 7 ==  [sedan, wheel left]

              ____________[=]___________
             /             |            \
            /    o1                      \
           /                    x2        \
          /                                \
         /__________________________________\
        ~~~~~~~~~~~~~(O)~~~~~~~~~~~~~~~~~~~~~~
```

## Data & privacy

Everything stays in your browser (`localStorage`). The share link contains
your **complete** data, unencrypted — treat it like the data itself and only
share it with your own devices.

## Repair rule of thumb (DE)

Eine Reparatur statt Scheibentausch geht in der Regel nur, wenn **alle drei**
Punkte stimmen:

- Der Schaden ist **kleiner als eine 2-Euro-Münze**.
- Er liegt **außerhalb des Sichtfelds** — ein 29 cm breiter Bereich (DIN A4
  quer) über dem Lenkrad.
- Er ist **mehr als 10 cm vom Scheibenrand** entfernt.

Trifft einer nicht zu, ist eine Reparatur unwahrscheinlich — dann hilft nur,
den Dienstleister zu kontaktieren und es klären zu lassen. Die Teilkasko
übernimmt die Reparatur oft ohne Selbstbeteiligung. Angaben ohne Gewähr —
entschieden wird in der Werkstatt.

## Support

If this is useful to you: [ko-fi.com/bmabma](https://ko-fi.com/bmabma) ☕

## License

[GPL-3.0-or-later](LICENSE)
