import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Readable } from 'stream'

const MIRROR_BASE = 'https://catboy.best'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const rawPath = (req.query.path as string) || ''

  if (!rawPath) {
    res.status(400).json({ error: 'Missing path' })
    return
  }

  // Only allow /api/search and /d/<numeric-id>
  if (rawPath !== '/api/search' && !/^\/d\/\d+$/.test(rawPath)) {
    res.status(403).json({ error: 'Forbidden path' })
    return
  }

  const qs = new URLSearchParams(req.query as Record<string, string>)
  qs.delete('path')
  const qsStr = qs.toString()
  const upstreamUrl = `${MIRROR_BASE}${rawPath}${qsStr ? `?${qsStr}` : ''}`

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'henkan-mirror/1.0' },
      signal: AbortSignal.timeout(60_000),
    })

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Upstream error ${upstream.status}` })
      return
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, s-maxage=300, max-age=60')
    res.setHeader('Access-Control-Allow-Origin', '*')

    // Forward Content-Length so the client can show a determinate progress bar.
    const contentLength = upstream.headers.get('content-length')
    if (contentLength) {
      res.setHeader('Content-Length', contentLength)
    }

    if (upstream.body) {
      Readable.fromWeb(upstream.body as any).pipe(res)
    } else {
      const buffer = Buffer.from(await upstream.arrayBuffer())
      res.status(200).send(buffer)
    }
  } catch (e) {
    res.status(502).json({ error: String(e) })
  }
}
