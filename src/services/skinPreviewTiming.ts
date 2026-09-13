export function resolvePreviewEventWindow(
  eventTimeMs: number,
  holdEndMs: number | undefined,
  elapsedMs: number,
  cycleMs: number,
  lookAheadMs: number,
): { headDelta: number; tailDelta: number } {
  const cycleIndex = Math.floor(elapsedMs / cycleMs)
  let eventStartMs = eventTimeMs + cycleIndex * cycleMs
  let eventEndMs = (holdEndMs ?? eventTimeMs) + cycleIndex * cycleMs

  // Keep a finished event's negative deltas until its next occurrence is
  // close enough to enter the playfield. This keeps hold heads and tails in
  // the same cycle instead of wrapping them independently.
  if (eventEndMs < elapsedMs && eventStartMs + cycleMs - elapsedMs <= lookAheadMs) {
    eventStartMs += cycleMs
    eventEndMs += cycleMs
  }

  return {
    headDelta: eventStartMs - elapsedMs,
    tailDelta: eventEndMs - elapsedMs,
  }
}
