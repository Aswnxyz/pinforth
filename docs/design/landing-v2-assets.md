# Landing Page V2 — Asset Manifest

Imagery decision (approved): **hybrid Option 2 + 3** — properly licensed photography for the
raster slots; original CSS/SVG for overlays, annotations, lighting, ornaments, and backgrounds.
Optimization target: ≤ 250 KB per asset.

## Raster assets

| Path | Slot | Source | License | Dimensions | Size |
| --- | --- | --- | --- | --- | --- |
| `apps/web/public/landing/hero-site-dusk.webp` | `hero-site` — staging-site visual inside the hero browser mock (LCP image) | <https://unsplash.com/photos/modern-house-exterior-glows-with-lights-4vioYQ9Nn9Y> by Arthur BAUDRY (Unsplash; fetched at `w=1920`, converted at 1600 px wide) | Unsplash License (free to use commercially, no permission/attribution required) | 1600 × 1200 | 81 KB (82,838 B) |
| `apps/web/public/landing/ridge-horizon.webp` | `ridge-horizon` — closing-CTA atmosphere band | <https://unsplash.com/photos/3ytjETpQMNY> by Carmine De Fazio (downloaded via Lorem Picsum `picsum.photos/id/876`) | Unsplash License (free to use commercially, no permission/attribution required) | 1920 × 1283 | 74 KB (75,736 B) |

Both files are WebP, converted with `sharp` (quality 78 / 75, effort 5), both under the 250 KB
target. Sources were selected from visual contact sheets of the licensed catalogs (StockSnap
CC0, Picsum/Unsplash); Unsplash and Pexels direct search were unreachable from this
environment.

## Non-raster art (original CSS/SVG — Option 3)

| Element | Slot | Medium |
| --- | --- | --- |
| Browser-mock chrome, pins, annotation box, comment card, cursor | `hero-site` overlays | Original SVG/CSS (Task 4, `art/icons.tsx` + `hero-stage.tsx`) |
| Workflow icons, problem chips, ornaments, glows, grain, background gradients | Page-wide overlays and atmosphere | Original SVG/CSS (`.landing` block in `globals.css`) |
| Corner foliage | Hero top-left foliage overlay | Original SVG (no raster alpha asset sourced; recorded here per the plan's optional `foliage` slot) |

## Notes / deviations

- `hero-site` was replaced during the Milestone 1 review round: the original
  StockSnap pool-residence shot (960 px ceiling) was swapped for a
  higher-resolution (1600 px) contemporary architectural photograph at dusk
  with warm interior illumination, matching the approved reference's art
  direction. The previous asset and this replacement were both selected from
  visual contact sheets of licensed catalogs.
- The selection annotation inside the mock ("Can we reduce the roof shadow
  here?") is anchored on the roof-overhang shadow visible in the photo, so
  the demo feedback stays contextually accurate.
- `ridge-horizon` renders as a darkened, green-graded background band via CSS overlays; the
  file itself is unmodified photography.
