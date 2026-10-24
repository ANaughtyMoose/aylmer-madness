# assets/look

Measured look data for the visual wave. Task V0-05, 6 Oct 2026.

## palette.json

One entry per material. Fields you will use:

| Field | Meaning |
|---|---|
| `srgbTarget` | On-screen colour at noon, clear, after the grade. This is the number to hit in a capture. |
| `srgbMeasured` | What the 2009 Street View crops actually give (median of per-ref medians). Equals `srgbTarget` unless `targetSource` says the roadmap hex was retained. |
| `roadmapHex` | The ROADMAP 2.5 starting value, kept for comparison. |
| `lightnessBand` | For lit surfaces where Street View is much lighter than the roadmap (asphalt, concrete, shingle, pavers). Keep the measured hue and chroma; lightness may sit anywhere between the two L* values. Street View exposes high, so hit the middle first and let Tom judge. |
| `linearAlbedo` | Seed albedo for the linear pipeline (0.03 to 0.80, white vinyl 0.75 or less). Derived from `srgbTarget` divided by an assumed noon illuminance (1.05 horizontal, 0.90 vertical). V1-01 should tune it so the captured pixel lands inside `tolerance`. `null` for sky and lights. |
| `tolerance` | Plus or minus per channel for the capture check. |
| `samples` | Each sample: crop file, its place folder, pixel rect, image size, colour read. |
| `sampleShortfall` | Present where the reference set has fewer than 3 usable views. |

`hudAndMenu` holds the HUD and menu tokens, matched to the opening CSS.

## How it was sampled

For each rect, keep pixels that pass a colour mask (green for foliage, red for brick, and so on), keep the luminance percentile band that matches the surface (lit 60 to 90, mid 40 to 60, deep shade 15 to 45), and take the per-channel median. The target is the median across refs. Rects are pixel boxes in the original crop size.

## Privacy

The crops live in `aylmer-madness/references/places/<slug>/` (gitignored, `CMP_REF_ROOT`). Nothing from them is committed: only these numbers and the file names. Sample file names are relative to `references/places/`. Only the 2009 `60b6f207_*` and `gi-streetview_*` crops, and Tom's marina photos, were used; the 2026 `claudechat_*` screenshots were not.

## Caveats

- Three tiles (`strip_02`, `strip_05`, `street_corridor`) carry 2021 to 2024 imagery watermarks. They are used only for Principale pavers, brick and road, which have not changed.
- Street View frames top out near 40 degrees elevation, so the sky entries are not the true zenith.
- Not sampled (no reference exists): golden sun, sodium lamp, night fill, Ranger white. Roadmap values retained.
