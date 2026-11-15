// In-process stand-in for an Umami instance. Records every request so tests can assert what reached the API.

export interface Seen {
  method: string
  path: string
  query: Record<string, string>
  auth: string | null
  body: unknown
}

export const FAKE_TOKEN = 'umami_test_token_should_never_leak'

export function startFakeUmami() {
  const seen: Seen[] = []
  const server = Bun.serve({
    port: 0,
    async fetch(req) {
      const url = new URL(req.url)
      const text = await req.text()
      seen.push({
        method: req.method,
        path: url.pathname,
        query: Object.fromEntries(url.searchParams),
        auth: req.headers.get('authorization'),
        body: text ? JSON.parse(text) : undefined,
      })
      if (req.headers.get('authorization') !== `Bearer ${FAKE_TOKEN}`) {
        return Response.json({ error: { message: 'Unauthorized', status: 401 } }, { status: 401 })
      }
      if (url.pathname === '/api/me') {
        return Response.json({ token: FAKE_TOKEN, authType: 'api-key', user: { id: 'u1', role: 'admin' } })
      }
      if (url.pathname === '/api/websites' && req.method === 'GET') {
        return Response.json({ data: [{ id: 'w1', name: 'Site', domain: 'example.com' }], count: 1, page: 1, pageSize: 10 })
      }
      if (url.pathname === '/api/websites/missing') {
        return Response.json({ error: { message: 'Not found', status: 404 } }, { status: 404 })
      }
      return Response.json({ ok: true })
    },
  })
  return { url: `http://127.0.0.1:${server.port}`, seen, stop: () => server.stop(true) }
}
