import type { Beatmap, ExportConfig, PackEntry } from '../types/beatmap'

export function configForSeparateBeatmap(
  current: ExportConfig,
  targetBeatmap: Beatmap,
): ExportConfig {
  return {
    ...current,
    // Compilation packs store the actual song title in osu!'s Version field.
    title: targetBeatmap.difficulty_name,
    artist: targetBeatmap.artist,
    creator: targetBeatmap.creator,
    difficulty_name: targetBeatmap.difficulty_name,
    source: targetBeatmap.source,
    tags: targetBeatmap.tags,
    audio_filename: targetBeatmap.audio_filename,
    background_filename: targetBeatmap.background_filename,
    banner_filename: targetBeatmap.banner_filename,
    cdtitle_filename: targetBeatmap.cdtitle_filename,
    preview_time: targetBeatmap.preview_time,
    subtitle: targetBeatmap.title || null,
    title_translit: null,
    subtitle_translit: null,
    artist_translit: null,
    genre: null,
    credit: null,
  }
}

export function isOsuCompilationPack(entries: PackEntry[]): boolean {
  if (entries.length < 2) return false

  const titles = new Set(
    entries
      .map(entry => entry.title.trim().toLowerCase())
      .filter(Boolean),
  )
  const audioFiles = new Set(
    entries
      .map(entry => entry.available_difficulties[0]?.audio_filename?.trim().toLowerCase())
      .filter((name): name is string => Boolean(name)),
  )

  return titles.size === 1 && audioFiles.size > 1
}

export function packEntryMetadata(entry: PackEntry, useDifficultyAsTitle: boolean) {
  const difficulty = entry.available_difficulties[0]
  const difficultyName = difficulty?.name.trim() || ''

  return {
    title: useDifficultyAsTitle && difficultyName ? difficultyName : entry.title,
    artist: entry.artist,
    subtitle: useDifficultyAsTitle && entry.title.trim() ? entry.title.trim() : null,
    difficultyName,
    audioFilename: difficulty?.audio_filename || '',
  }
}

interface EditablePackMetadata {
  title: string
  subtitle: string | null
  difficulty_name: string
  audio_filename: string
}

interface ParsedOsuMetadata {
  title: string
  difficulty_name: string
  audio_filename: string
}

export function normalizeParsedOsuPackMetadata(
  beatmap: ParsedOsuMetadata,
  entries: PackEntry[],
  current: EditablePackMetadata,
): EditablePackMetadata {
  const sourceTitle = beatmap.title.trim()
  const difficultyName = beatmap.difficulty_name.trim()
  const difficultyTitles = new Set(
    entries
      .map(item => item.available_difficulties[0]?.name.trim())
      .filter((name): name is string => Boolean(name)),
  )
  const title = current.title.trim()
  const subtitle = current.subtitle?.trim() || ''
  const replaceTitle = Boolean(
    difficultyName && (!title || title === sourceTitle || difficultyTitles.has(title)),
  )

  return {
    ...current,
    title: replaceTitle ? difficultyName : current.title,
    subtitle: sourceTitle && (replaceTitle || !subtitle || difficultyTitles.has(subtitle))
      ? sourceTitle
      : current.subtitle,
    difficulty_name: current.difficulty_name.trim() || difficultyName,
    audio_filename: current.audio_filename.trim() || beatmap.audio_filename,
  }
}

export function normalizeCompilationMetadata(
  entry: PackEntry,
  entries: PackEntry[],
  current: EditablePackMetadata,
): EditablePackMetadata {
  const defaults = packEntryMetadata(entry, true)
  const sourceTitle = entry.title.trim()
  const difficultyTitles = new Set(
    entries
      .map(item => item.available_difficulties[0]?.name.trim())
      .filter((name): name is string => Boolean(name)),
  )
  const title = current.title.trim()
  const subtitle = current.subtitle?.trim() || ''

  return {
    ...current,
    title: !title || title === sourceTitle || (difficultyTitles.has(title) && title !== defaults.title)
      ? defaults.title
      : current.title,
    subtitle: !subtitle || difficultyTitles.has(subtitle)
      ? defaults.subtitle
      : current.subtitle,
    difficulty_name: current.difficulty_name.trim() || defaults.difficultyName,
    audio_filename: current.audio_filename.trim() || defaults.audioFilename,
  }
}
