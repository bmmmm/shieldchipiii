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

- **Windshield diagram** — view from the inside (top edge shorter, trapezoid
  distortion), mirror top center, dashboard + steering wheel for orientation.
  5 shape presets (compact, sedan, SUV, van/bus, sports) plus free shape
  tweaking (top edge, height, corner rounding, edge bow). Left/right-hand
  drive.
- **Chips & cracks** — click the glass to add an entry, drag markers to move.
  Per entry: size (`< 10-cent` / `< 50-cent` / `< 2-euro` coin, crack
  ~2 cm / ~5 cm / > 5 cm), status (new/repaired), found date, repaired
  where/when, reported to insurance (and when), driver's field of view
  (suggested automatically from the position), free note.
- **Multiple vehicles** — tabs, each with its own shape and entries.
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

Kleiner als eine 2-Euro-Münze und außerhalb des Fahrer-Sichtfelds → meist
reparierbar statt Scheibentausch; die Teilkasko übernimmt die Reparatur oft
ohne Selbstbeteiligung. Im Sichtfeld oder größer → Werkstatt fragen.

## Support

If this is useful to you: [ko-fi.com/bmabma](https://ko-fi.com/bmabma) ☕

## License

[GPL-3.0-or-later](LICENSE)
