# Garden stage art

Placeholder SVGs. Swap the files, keep the names and viewBox.

## Tree stages

| File | Stage |
|------|--------|
| `stage-0-seed.svg` | Seed |
| `stage-1-sprout.svg` | Sprout |
| `stage-2-small-plant.svg` | Small Plant |
| `stage-3-medium-plant.svg` | Medium Plant |
| `stage-4-large-tree.svg` | Large Tree |
| `stage-5-fully-grown.svg` | Fully Grown Tree |

## Ambient scene (swap these for final art)

| File | Use |
|------|-----|
| `ambient-cloud.svg` | Soft drifting clouds (always in the scene) |
| `ambient-sun.svg` | Sunshine (always on the current tree) |
| `ambient-rainbow.svg` | Rainbow flash after Water; stays at Fully Grown |
| `ambient-butterfly.svg` | Butterflies from Small Plant onward |
| `ambient-bee.svg` | Bees from Medium Plant onward |
| `ambient-bird.svg` | Birds from Large Tree onward |
| `ambient-blossom.svg` | Extra fruit/blossoms at Fully Grown |

The watering / fertilizer character uses the student's profile photo, or `/images/remo-green.png` if they have none.

Per-stage counts live in `server/garden/garden.config.js` (`STAGES[].ambient`).
