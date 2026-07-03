import type { VercelRequest, VercelResponse } from '@vercel/node'

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const user = req.query.user as string
  if (!user) {
    res.status(400).json({ error: 'Missing user parameter' })
    return
  }

  try {
    const profileUrl = `https://osu.ppy.sh/users/${encodeURIComponent(user)}`
    const profileResp = await fetch(profileUrl, {
      headers: { 'User-Agent': UA },
      redirect: 'manual',
    })

    const location = profileResp.headers.get('location')
    if (!location) {
      res.status(404).json({ error: 'User not found' })
      return
    }

    const match = location.match(/\/users\/(\d+)/)
    if (!match) {
      res.status(404).json({ error: 'Could not resolve user ID' })
      return
    }

    const userId = match[1]
    const avatarUrl = `https://a.ppy.sh/${userId}`
    const avatarResp = await fetch(avatarUrl, {
      headers: { 'User-Agent': UA },
    })

    if (!avatarResp.ok) {
      res.status(avatarResp.status).json({ error: 'Failed to fetch avatar' })
      return
    }

    const contentType = avatarResp.headers.get('content-type') || 'image/png'
    const buffer = await avatarResp.arrayBuffer()

    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=3600')
    res.status(200).send(Buffer.from(buffer))
  } catch (e) {
    res.status(500).json({ error: String(e) })
  }
}
