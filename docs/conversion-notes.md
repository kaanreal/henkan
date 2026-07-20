# Conversion notes

Henkan aims for musical fidelity first: timing, BPM changes, holds, and usable
metadata should survive a trip between formats.

## What transfers well

- note positions and long notes
- BPM changes and offsets
- title, artist, chart name, and creator fields
- referenced backgrounds and audio when they are available in the source pack

## Format boundaries

Some data has no direct equivalent. osu!mania scroll velocity changes do not
map to standard StepMania `.sm` timing, so they are not converted to an
equivalent effect.

Always play-test a converted chart before publishing it. Conversion is a strong
starting point, not a substitute for chart review.
