import type { UmamiConfig } from './config.ts'

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE'
export type Query = Record<string, string | number | boolean | undefined | null>

// Response fields that carry credentials. /api/me echoes the caller's token, for example.
const SECRET_KEYS = new Set(['token', 'partialToken', 'password', 'newPassword', 'currentPassword'])

export class UmamiApiError extends Error {
  constructor(
    readonly status: number,
    readonly method: Method,
    readonly path: string,
    readonly detail: unknown,
  ) {
    super(`Umami ${method} ${path} failed with HTTP ${status}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`)
  }
}

export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, SECRET_KEYS.has(k) && v != null ? '<redacted>' : redact(v)]),
    )
  }
  return value
}

export function buildPath(path: string, query?: Query): string {
  if (!path.startsWith('/')) path = `/${path}`
  if (path.includes('..')) throw new Error(`Refusing path with "..": ${path}`)
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') params.set(k, String(v))
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

export class UmamiClient {
  constructor(
    private readonly config: UmamiConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get apiRoot(): string {
    return this.config.apiRoot
  }

  async request(method: Method, path: string, options: { query?: Query; body?: unknown } = {}): Promise<unknown> {
    const target = buildPath(path, options.query)
    const headers: Record<string, string> = {
      Accept: 'application/json',
      Authorization: `Bearer ${this.config.token}`,
      'User-Agent': 'agents-umami-plugins',
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    const res = await this.fetchImpl(`${this.config.apiRoot}${target}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(30_000),
    })
    const text = await res.text()
    let parsed: unknown = text
    if (text) {
      try {
        parsed = JSON.parse(text)
      } catch {
        // Some endpoints answer with plain text such as "ok".
      }
    } else {
      parsed = null
    }
    if (!res.ok) throw new UmamiApiError(res.status, method, target.split('?')[0]!, redact(parsed))
    return redact(parsed)
  }
}
