import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage, ServerResponse } from 'http'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
const MIRROR_BASE = 'https://catboy.best'

// ── Avatar proxy ──────────────────────────────────────────────────────────────

async function handleAvatar(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '', 'http://localhost')
  const user = url.searchParams.get('user')
  if (!user) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Missing user parameter' }))
    return
  }

  try {
    const profileResp = await fetch(`https://osu.ppy.sh/users/${encodeURIComponent(user)}`, {
      headers: { 'User-Agent': UA },
      redirect: 'manual',
    })
    const location = profileResp.headers.get('location')
    if (!location) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'User not found' }))
      return
    }
    const match = location.match(/\/users\/(\d+)/)
    if (!match) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'Could not resolve user ID' }))
      return
    }
    const userId = match[1]
    const avatarResp = await fetch(`https://a.ppy.sh/${userId}`, {
      headers: { 'User-Agent': UA },
    })
    if (!avatarResp.ok) {
      res.statusCode = avatarResp.status
      res.end()
      return
    }
    const contentType = avatarResp.headers.get('content-type') || 'image/png'
    const buffer = Buffer.from(await avatarResp.arrayBuffer())
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.end(buffer)
  } catch {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Internal error' }))
  }
}

// ── Mirror proxy ──────────────────────────────────────────────────────────────
// Proxies /api/mirror?path=/api/search&... and /api/mirror?path=/d/<id>
// to https://catboy.best — avoids browser CORS restrictions in dev.

async function handleMirror(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || '', 'http://localhost')
  const mirrorPath = url.searchParams.get('path') || ''

  if (!mirrorPath) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Missing path param' }))
    return
  }

  // Safety: only allow known endpoints
  if (mirrorPath !== '/api/search' && !/^\/d\/\d+$/.test(mirrorPath)) {
    res.statusCode = 403
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Forbidden' }))
    return
  }

  const qs = new URLSearchParams(url.search)
  qs.delete('path')
  const qsStr = qs.toString()
  const upstreamUrl = `${MIRROR_BASE}${mirrorPath}${qsStr ? `?${qsStr}` : ''}`

  try {
    const upstream = await fetch(upstreamUrl, {
      headers: { 'User-Agent': 'henkan-mirror/1.0' },
      signal: AbortSignal.timeout(60_000),
    })

    if (!upstream.ok) {
      res.statusCode = upstream.status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: `Upstream error ${upstream.status}` }))
      return
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream'
    const buffer = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=60')
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.end(buffer)
  } catch (e) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: String(e) }))
  }
}

// ── Vite plugin wiring ────────────────────────────────────────────────────────

type ViteDevServer = {
  middlewares: {
    use: (path: string, handler: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => void
  }
}

function apiPlugin() {
  return {
    name: 'api-proxy',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/avatar', (req, res) => { handleAvatar(req, res) })
      server.middlewares.use('/api/mirror', (req, res) => { handleMirror(req, res) })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), apiPlugin()],
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      ignored: ['**/src-tauri/**'],
    },
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: ['es2021', 'chrome105', 'safari15'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
})
