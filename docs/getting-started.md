# Getting started

Henkan converts osu!mania (`.osu` and `.osz`) maps and Etterna/StepMania
(`.sm`) files in either direction.

1. Open Henkan.
2. Choose the direction in the header.
3. Drop a map, browse for one, or open a pack folder.
4. Check the detected metadata and media.
5. Convert, then choose where to save the result.

For a single map, use the regular drop area. For a collection, open a pack
folder so Henkan can discover each chart before conversion.

## Formats at a glance

| Input | Output | Notes |
| --- | --- | --- |
| `.osu`, `.osz` | `.sm` | BPM changes, holds, metadata, and background references are retained where the format allows. |
| `.sm` | `.osu` / `.osz` | Song metadata and chart data are carried into an osu!mania map. |

If a map looks unusual after conversion, save the source file and open an issue
with both formats attached where possible.
