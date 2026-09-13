import wasmUrl from './minacalc.wasm?url'
import { loadMinacalc, type Minacalc, type MsdRating, type MsdRow } from './minacalc'

export type MsdWorkerRequest = {
  id: number
  rows: MsdRow[]
  keyCount: number
}

export type MsdWorkerResponse = {
  id: number
  rating: MsdRating | null
  error?: string
}

let calcPromise: Promise<Minacalc> | null = null

function getCalc(): Promise<Minacalc> {
  if (!calcPromise) {
    calcPromise = fetch(wasmUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`wasm fetch failed (${response.status})`)
        return response.arrayBuffer()
      })
      .then(loadMinacalc)
  }
  return calcPromise
}

self.onmessage = (event: MessageEvent<MsdWorkerRequest>) => {
  const { id, rows, keyCount } = event.data
  void getCalc()
    .then((calc) => {
      const rating = calc.compute(rows, keyCount)
      self.postMessage({ id, rating } satisfies MsdWorkerResponse)
    })
    .catch((error: unknown) => {
      calcPromise = null
      self.postMessage({
        id,
        rating: null,
        error: error instanceof Error ? error.message : 'msd computation failed',
      } satisfies MsdWorkerResponse)
    })
}
