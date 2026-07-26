import type {
  Beatmap,
  ExportConfig,
} from '../types/beatmap'

let wasm: typeof import('../wasm/henkan_core.js') | null = null

async function ensureWasm(): Promise<typeof import('../wasm/henkan_core.js')> {
  if (wasm) return wasm
  try {
    const mod = await import('../wasm/henkan_core.js')
    await mod.default()
    wasm = mod
    return mod
  } catch (e) {
    console.error('WASM init failed:', e)
    throw e
  }
}

export async function wasmParseOsu(content: string): Promise<Beatmap> {
  const mod = await ensureWasm()
  return JSON.parse(mod.parse_osu_content(content))
}

export async function wasmParseSm(content: string): Promise<Beatmap> {
  const mod = await ensureWasm()
  return JSON.parse(mod.parse_sm_content(content))
}

export async function wasmParseSmDifficulty(content: string, index: number): Promise<Beatmap> {
  const mod = await ensureWasm()
  return JSON.parse(mod.parse_sm_difficulty(content, index))
}

export async function wasmParseSmAll(content: string): Promise<Beatmap[]> {
  const mod = await ensureWasm()
  return JSON.parse(mod.parse_sm_all_difficulties(content))
}

export async function wasmConvertEtternaToOsu(beatmap: Beatmap, config: ExportConfig): Promise<string> {
  const mod = await ensureWasm()
  return mod.convert_etterna_to_osu(JSON.stringify(beatmap), JSON.stringify(config))
}

export async function wasmConvertOsuToEtterna(
  beatmap: Beatmap,
  config: ExportConfig,
): Promise<string> {
  const mod = await ensureWasm()
  return mod.convert_osu_to_etterna(JSON.stringify(beatmap), JSON.stringify(config))
}

export async function wasmScaleTimingForRate(beatmap: Beatmap, rate: number): Promise<Beatmap> {
  const mod = await ensureWasm()
  return JSON.parse(mod.scale_timing_for_rate(JSON.stringify(beatmap), rate))
}
