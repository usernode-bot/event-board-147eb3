# Event Board brand icons

The app icon is a **calendar page with one day circled**: a bold black calendar
page with a solid header, two binder rings on top and a small grid of days,
with the bottom-right day circled in brand Yellow. Flat, no text.

## Files

| File | What |
| --- | --- |
| `render-icons.js` | Generator. Defines the mark once as a shape list on a 1024 grid and writes everything below. No dependencies (`node:zlib`, `node:fs`). |
| `icon.svg` | Vector source of the app icon, for redrawing. Not referenced by `dapp.json` (the platform accepts PNG/JPEG/WebP/GIF only). |
| `icon.png` | App icon, 1024×1024, referenced by `dapp.json` as `icon.image`. Opaque, full bleed, square corners: Homeroom applies the rounded corners. |
| `featured-light.png` | 1600×900 featured illustration, black mark on Cream, for the Homeroom directory. |
| `featured-dark.png` | 1600×900 featured illustration, cream mark on Black, for the Homeroom directory. |

Regenerate with `node brand/render-icons.js`. `ICON_CHECK=1` also writes 32×32
readability checks into a temp directory.

## Colours

Only Homeroom brand palette colours appear as solid fills:

- Cream `#FFFEEA` — tile background (light versions)
- Black `#000000` — the mark, and the tile background (dark versions)
- Yellow `#FFEE6F` — the circled day, in both versions

Pairings used: Cream + Black (light) and Black + Yellow (the accent);
the dark versions are Black + Cream with the same Yellow accent.
Antialiased edge pixels are blends of neighbouring palette colours.

## Geometry notes

- The mark spans x 232–792, y 212–812 on the 1024 grid, leaving over 200 px
  margin so the platform's corner rounding never clips it.
- The day rows sit at y 532 and 676 (16 px higher than the first draft of the
  design) so the ring around the circled day keeps 16 px clear of the page
  outline and the neighbouring days.
- The featured images draw the same shape list unscaled, translated by
  (+288, −62) to centre the mark on 1600×900. Nothing else is added.

## Not wired up yet

The platform conventions define no `dapp.json` field for featured artwork, so
`featured-light.png` and `featured-dark.png` are not shown anywhere yet. They
are committed here ready to be connected when such a setting exists. The app
icon itself is live: `dapp.json` sets `icon.image` to `brand/icon.png` and
keeps the 📅 emoji as the fallback.
