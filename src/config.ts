export interface UmamiConfig {
  /** API root that endpoint paths are appended to, e.g. https://host/api or https://api.umami.is/v1 */
  apiRoot: string
  token: string
}

export class ConfigError extends Error {}

/** Accepts an instance URL, an /api URL or the Umami Cloud /v1 URL. */
export function normalizeApiRoot(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new ConfigError(`UMAMI_API_URL is not a valid URL: ${raw}`)
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigError(`UMAMI_API_URL must use http or https, got ${url.protocol}`)
  }
  const path = url.pathname.replace(/\/+$/, '')
  if (/\/(api|v1)$/.test(path)) return `${url.origin}${path}`
  if (url.hostname === 'api.umami.is') return `${url.origin}/v1`
  return `${url.origin}${path}/api`
}

export function readConfig(env: Record<string, string | undefined>): UmamiConfig {
  const token = env.UMAMI_API_TOKEN?.trim()
  if (!token) throw new ConfigError('UMAMI_API_TOKEN is not set. Export it in the environment that starts the agent.')
  const rawUrl = env.UMAMI_API_URL?.trim() || 'https://api.umami.is/v1'
  return { apiRoot: normalizeApiRoot(rawUrl), token }
}
