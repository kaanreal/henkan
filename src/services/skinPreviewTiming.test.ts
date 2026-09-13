import { describe, expect, it } from 'vitest'
import { resolvePreviewEventWindow } from './skinPreviewTiming'

describe('resolvePreviewEventWindow', () => {
  const cycleMs = 12_000
  const lookAheadMs = 380

  it('keeps a hold head and tail in the same cycle', () => {
    expect(resolvePreviewEventWindow(11_800, 13_200, 11_900, cycleMs, lookAheadMs)).toEqual({
      headDelta: -100,
      tailDelta: 1_300,
    })
  })

  it('does not revive a finished hold until the next cycle', () => {
    expect(resolvePreviewEventWindow(400, 1_800, 2_200, cycleMs, lookAheadMs)).toEqual({
      headDelta: -1_800,
      tailDelta: -400,
    })
  })
})
