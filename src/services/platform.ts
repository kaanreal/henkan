import { isTauri } from './environment'

export async function openUrl(url: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_url', { url })
    return
  }
  window.open(url, '_blank', 'noopener')
}

export async function openFile(path: string): Promise<void> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('open_file', { path })
    return
  }
  window.open(path, '_blank')
}

export async function getGithubStars(repo: string): Promise<string | null> {
  if (isTauri()) {
    const { invoke } = await import('@tauri-apps/api/core')
    try {
      return await invoke<string | null>('get_github_stars', { repo })
    } catch {
      return null
    }
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repo}`)
    if (!res.ok) return null
    const data = await res.json()
    const count = data.stargazers_count
    if (count === undefined) return null
    return count >= 1000
      ? `${(count / 1000).toFixed(1)}k`
      : String(count)
  } catch {
    return null
  }
}
