/* tslint:disable */
/* eslint-disable */

export function convert_etterna_to_osu(beatmap_json: string, config_json: string): string;

export function convert_osu_to_etterna(beatmap_json: string, global_timing_ms: number, chart_description: string): string;

export function parse_osu_content(content: string): string;

export function parse_sm_all_difficulties(content: string): string;

export function parse_sm_content(content: string): string;

export function parse_sm_difficulty(content: string, index: number): string;

export function rate_label_text(rate: number): string | undefined;

export function scale_timing_for_rate(beatmap_json: string, rate: number): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly convert_etterna_to_osu: (a: number, b: number, c: number, d: number) => [number, number, number, number];
    readonly convert_osu_to_etterna: (a: number, b: number, c: number, d: number, e: number) => [number, number, number, number];
    readonly parse_osu_content: (a: number, b: number) => [number, number, number, number];
    readonly parse_sm_all_difficulties: (a: number, b: number) => [number, number, number, number];
    readonly parse_sm_content: (a: number, b: number) => [number, number, number, number];
    readonly parse_sm_difficulty: (a: number, b: number, c: number) => [number, number, number, number];
    readonly rate_label_text: (a: number) => [number, number];
    readonly scale_timing_for_rate: (a: number, b: number, c: number) => [number, number, number, number];
    readonly __wbindgen_externrefs: WebAssembly.Table;
    readonly __wbindgen_malloc: (a: number, b: number) => number;
    readonly __wbindgen_realloc: (a: number, b: number, c: number, d: number) => number;
    readonly __externref_table_dealloc: (a: number) => void;
    readonly __wbindgen_free: (a: number, b: number, c: number) => void;
    readonly __wbindgen_start: () => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
