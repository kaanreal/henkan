import { create } from 'zustand'

const FALLING_ARROWS_KEY = 'henkan.show-falling-arrows'
const OSU_HOOK_KEY = 'henkan.osu-hook-enabled'
const ETTERNA_HOOK_KEY = 'henkan.etterna-hook-enabled'

function readSetting(key: string, fallback: boolean): boolean {
  try {
    const value = localStorage.getItem(key)
    return value === null ? fallback : value === '1'
  } catch {
    return fallback
  }
}

function writeSetting(key: string, value: boolean): void {
  try {
    localStorage.setItem(key, value ? '1' : '0')
  } catch {
    // Keep the setting active for this session when storage is unavailable.
  }
}

type InterfaceSettingsState = {
  showFallingArrows: boolean
  osuHookEnabled: boolean
  etternaHookEnabled: boolean
  setShowFallingArrows: (show: boolean) => void
  setOsuHookEnabled: (enabled: boolean) => void
  setEtternaHookEnabled: (enabled: boolean) => void
}

export const useInterfaceSettingsStore = create<InterfaceSettingsState>((set) => ({
  showFallingArrows: readSetting(FALLING_ARROWS_KEY, true),
  osuHookEnabled: readSetting(OSU_HOOK_KEY, true),
  etternaHookEnabled: readSetting(ETTERNA_HOOK_KEY, true),
  setShowFallingArrows: (show) => {
    writeSetting(FALLING_ARROWS_KEY, show)
    set({ showFallingArrows: show })
  },
  setOsuHookEnabled: (enabled) => {
    writeSetting(OSU_HOOK_KEY, enabled)
    set({ osuHookEnabled: enabled })
  },
  setEtternaHookEnabled: (enabled) => {
    writeSetting(ETTERNA_HOOK_KEY, enabled)
    set({ etternaHookEnabled: enabled })
  },
}))
