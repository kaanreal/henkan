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

## Skin conversion

Henkan converts the shared 4K gameplay layer between osu!mania skins and
Etterna `dance` noteskins: tap notes, hold heads/bodies/tails, lane receptors,
and the configuration files that load them.

The skin converter has one import flow. It detects an osu!mania `skin.ini` or
an Etterna `NoteSkin.lua`/`metrics.ini` from the archive contents and always
exports the opposite format. Skin archives and folders can be dropped on the
main converter; Henkan detects them and switches to the skin workflow. Browser
and Vercel builds package dropped folders in memory, while the desktop app
packages them through its native filesystem bridge before running the same
converter.

The two systems are not equivalent. osu! menu, ranking, sound, and non-mania
assets do not belong to an Etterna noteskin. Etterna Lua animation,
quantisation colours, mines, explosions, and theme-level judgements cannot be
represented by osu!mania `skin.ini`. Etterna exports include
`HENKAN-REPORT.txt` with mapped, fallback, and missing assets so these losses
are explicit. Etterna-to-osu! exports place the converted notes, holds, and
receptors into the bundled osu! interface skin; that template's own gameplay
sprites are excluded so they cannot override the conversion.

For osu!mania output, the bundled interface skin supplies the complete 4K
playfield configuration, including column geometry, hit position, layering,
colours, long-note style, and stage presentation. Only its note, hold, and
receptor image references are replaced by the converted Etterna assets.

Etterna exports contain one ready-to-install skin folder. Extract the ZIP into
`Etterna/NoteSkins/dance`; do not create another folder around the folder that
is already inside the archive. The generated Lua actors reference uniquely
named underscored textures so Etterna never sees an ambiguous actor/texture
pair. Remove an older conversion with the same folder name before installing;
merging versions leaves obsolete files that can make Etterna's lookup
ambiguous again.
