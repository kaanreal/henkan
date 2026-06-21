// TypeScript port of src-tauri/src/converters/etterna_to_osu.rs

import type { Beatmap, ExportConfig } from '../models'

export function convertEtternaToOsu(beatmap: Beatmap, config: ExportConfig): string {
  const globalTimingMs = config.global_timing_ms
  let output = ''

  output += 'osu file format v14\n\n'

  output += '[General]\n'
  output += `AudioFilename: ${beatmap.audio_filename}\n`
  output += `AudioLeadIn: ${Math.floor(beatmap.lead_in_ms)}\n`
  output += 'Mode: 3\n'
  output += `PreviewTime: ${Math.floor(beatmap.preview_time)}\n`
  output += '\n'

  output += '[Editor]\n\n'

  output += '[Metadata]\n'
  output += `Title:${beatmap.title}\n`
  output += `TitleUnicode:${beatmap.title}\n`
  output += `Artist:${beatmap.artist}\n`
  output += `ArtistUnicode:${beatmap.artist}\n`
  output += `Creator:${beatmap.creator}\n`
  output += `Version:${beatmap.difficulty_name}\n`
  output += `Source:${beatmap.source}\n`
  output += `Tags:${beatmap.tags}\n`
  output += '\n'

  const cs = config.circle_size === 0 ? beatmap.keys : config.circle_size
  const ar = config.approach_rate === 0 ? config.overall_difficulty : config.approach_rate

  output += '[Difficulty]\n'
  output += `HPDrainRate:${config.hp_drain}\n`
  output += `CircleSize:${cs}\n`
  output += `OverallDifficulty:${config.overall_difficulty}\n`
  output += `ApproachRate:${ar}\n`
  output += 'SliderMultiplier:1.4\n'
  output += 'SliderTickRate:1\n'
  output += '\n'

  output += '[Events]\n'
  output += '//Background and Video events\n'
  if (beatmap.background_filename) {
    output += '0,0,"bg.jpg",0,0\n'
  }
  output += '//Break Periods\n'
  output += '//Storyboard Layer 0 (Background)\n'
  output += '//Storyboard Layer 1 (Fail)\n'
  output += '//Storyboard Layer 2 (Pass)\n'
  output += '//Storyboard Layer 3 (Foreground)\n'
  output += '//Storyboard Layer 4 (Overlay)\n'
  output += '//Storyboard Sound Samples\n'
  output += '\n'

  const shift = (t: number) => Math.max(0, t - globalTimingMs)

  output += '[TimingPoints]\n'

  const lines: { t: number; uninheritedRank: number; line: string }[] = []

  for (const tp of beatmap.timing_points) {
    const beatLength = tp.beat_length > 0 ? tp.beat_length : -100
    const t = shift(tp.time_ms)
    lines.push({
      t,
      uninheritedRank: tp.uninherited ? 0 : 1,
      line: `${Math.floor(t)},${beatLength},${tp.meter},0,0,100,${tp.uninherited ? 1 : 0},0`,
    })
  }

  for (const sv of beatmap.sv_events) {
    if (sv.multiplier <= 0) continue
    const svBeatLength = -100 / sv.multiplier
    const t = shift(sv.time_ms)
    lines.push({
      t,
      uninheritedRank: 1,
      line: `${Math.floor(t)},${svBeatLength},4,0,0,100,0,0`,
    })
  }

  lines.sort((a, b) => {
    if (a.t !== b.t) return a.t - b.t
    return a.uninheritedRank - b.uninheritedRank
  })

  for (const item of lines) {
    output += item.line + '\n'
  }
  output += '\n'

  output += '[HitObjects]\n'
  for (const note of beatmap.notes) {
    const x = Math.floor(((note.column + 0.5) / beatmap.keys) * 512)
    const time = Math.floor(shift(note.time_ms))

    if (note.hold) {
      const endTime = Math.floor(shift(note.hold_end_ms ?? (note.time_ms + 1000)))
      output += `${x},192,${time},128,0,${endTime}:0:0:0:0:\n`
    } else {
      output += `${x},192,${time},1,0,0:0:0:0:\n`
    }
  }

  return output
}
