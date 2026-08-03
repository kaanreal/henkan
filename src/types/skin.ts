export type SkinDirection = 'osu-to-etterna' | 'etterna-to-osu'

export interface SkinAssetMapping {
  target: string
  source: string | null
  status: 'mapped' | 'fallback' | 'missing'
}

export interface SkinInspection {
  name: string
  format: 'osu!mania skin' | 'Etterna noteskin'
  fileCount: number
  keyModes: number[]
  mappings: SkinAssetMapping[]
  warnings: string[]
}

export interface SkinConversionResult {
  blob: Blob
  filename: string
  inspection: SkinInspection
}

export interface SkinPreviewAsset {
  blob: Blob
  width: number
  height: number
}

export interface SkinPreviewLane {
  note: SkinPreviewAsset
  holdHead: SkinPreviewAsset
  holdBody: SkinPreviewAsset
  holdTail: SkinPreviewAsset
  receptor: SkinPreviewAsset
}

export interface SkinPreview {
  lanes: SkinPreviewLane[]
  hitPosition?: number
  columnWidth?: number
}

export interface SkinConversionOptions {
  hitPosition?: number
  columnWidth?: number
}
