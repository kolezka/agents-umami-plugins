import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { UmamiClient } from '../src/client.ts'
import { normalizeApiRoot, readConfig } from '../src/config.ts'
import { resolveRange } from '../src/range.ts'
import { createServer } from '../src/server.ts'
import { FAKE_TOKEN, startFakeUmami } from './fake-umami.ts'

const fake = startFakeUmami()
let mcp: Client

beforeAll(async () => {
  const server = createServer(new UmamiClient({ apiRoot: `${fake.url}/api`, token: FAKE_TOKEN }))
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair()
  await server.connect(serverSide)
  mcp = new Client({ name: 'test', version: '0' })
  await mcp.connect(clientSide)
})
afterAll(() => fake.stop())
beforeEach(() => {
  fake.seen.length = 0
})

async function callTool(name: string, args: Record<string, unknown>) {
  const res = (await mcp.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
  return { text: res.content.map((c) => c.text).join('\n'), isError: res.isError === true }
}

describe('config', () => {
  test('derives the API root from an instance, /api or Cloud URL', () => {
    expect(normalizeApiRoot('https://umami.example.com')).toBe('https://umami.example.com/api')
    expect(normalizeApiRoot('https://umami.example.com/')).toBe('https://umami.example.com/api')
    expect(normalizeApiRoot('https://umami.example.com/api/')).toBe('https://umami.example.com/api')
    expect(normalizeApiRoot('https://example.com/analytics')).toBe('https://example.com/analytics/api')
    expect(normalizeApiRoot('https://api.umami.is')).toBe('https://api.umami.is/v1')
    expect(normalizeApiRoot('https://api.umami.is/v1')).toBe('https://api.umami.is/v1')
  })

  test('requires UMAMI_API_TOKEN and defaults the URL to Umami Cloud', () => {
    expect(() => readConfig({})).toThrow('UMAMI_API_TOKEN is not set')
    expect(readConfig({ UMAMI_API_TOKEN: 'x' }).apiRoot).toBe('https://api.umami.is/v1')
  })
})

describe('range', () => {
  const now = Date.UTC(2026, 10, 15, 12, 30) // 2026-11-15 12:30 UTC

  test('relative periods end now', () => {
    expect(resolveRange({ period: '7d' }, now)).toEqual({ startAt: now - 7 * 86_400_000, endAt: now })
    expect(resolveRange({}, now)).toEqual({ startAt: now - 7 * 86_400_000, endAt: now })
  })

  test('today starts at local midnight of the given time zone', () => {
    expect(resolveRange({ period: 'today' }, now).startAt).toBe(Date.UTC(2026, 10, 15))
    // Warsaw is UTC+1 in November, so its midnight is 23:00 UTC the day before.
    expect(resolveRange({ period: 'today', timezone: 'Europe/Warsaw' }, now).startAt).toBe(Date.UTC(2026, 10, 14, 23))
  })

  test('accepts ISO dates and rejects mixed or inverted ranges', () => {
    expect(resolveRange({ startAt: '2026-11-01', endAt: '2026-11-02' }, now)).toEqual({
      startAt: Date.UTC(2026, 10, 1),
      endAt: Date.UTC(2026, 10, 2),
    })
    expect(() => resolveRange({ period: '7d', startAt: 1 }, now)).toThrow('not both')
    expect(() => resolveRange({ startAt: 10, endAt: 5 }, now)).toThrow('earlier')
  })
})

describe('tools', () => {
  test('sends the token as a Bearer header and redacts it from responses', async () => {
    const res = await callTool('umami_me', {})
    expect(res.isError).toBe(false)
    expect(fake.seen[0]?.auth).toBe(`Bearer ${FAKE_TOKEN}`)
    expect(res.text).not.toContain(FAKE_TOKEN)
    expect(res.text).toContain('<redacted>')
  })

  test('analytics tools send an explicit startAt/endAt range, never period', async () => {
    await callTool('umami_website_metrics', { websiteId: 'w1', type: 'path', period: '30d', filters: { country: 'PL' } })
    const q = fake.seen[0]!.query
    expect(fake.seen[0]!.path).toBe('/api/websites/w1/metrics')
    expect(q.period).toBeUndefined()
    expect(Number(q.endAt) - Number(q.startAt)).toBe(30 * 86_400_000)
    expect(q).toMatchObject({ type: 'path', country: 'PL' })
  })

  test('API errors come back as tool errors with the status code', async () => {
    const res = await callTool('umami_get_website', { websiteId: 'missing' })
    expect(res.isError).toBe(true)
    expect(res.text).toContain('HTTP 404')
  })

  // Every destructive path must refuse without confirm and must not reach the API.
  const destructive: [string, Record<string, unknown>, string, string][] = [
    ['umami_delete_website', { websiteId: 'w1' }, 'DELETE', '/api/websites/w1'],
    ['umami_reset_website', { websiteId: 'w1' }, 'POST', '/api/websites/w1/reset'],
    ['umami_delete_team', { teamId: 't1' }, 'DELETE', '/api/teams/t1'],
    ['umami_remove_team_user', { teamId: 't1', userId: 'u1' }, 'DELETE', '/api/teams/t1/users/u1'],
    ['umami_delete_user', { userId: 'u1' }, 'DELETE', '/api/users/u1'],
    ['umami_request', { method: 'POST', path: '/websites/w1' }, 'POST', '/api/websites/w1'],
    ['umami_request', { method: 'DELETE', path: '/reports/r1' }, 'DELETE', '/api/reports/r1'],
  ]
  for (const [name, args, method, path] of destructive) {
    test(`${name} ${method} ${path} needs confirm: true`, async () => {
      for (const bad of [{}, { confirm: false }]) {
        const refused = await callTool(name, { ...args, ...bad })
        expect(refused.isError).toBe(true)
      }
      expect(fake.seen).toHaveLength(0)

      const ok = await callTool(name, { ...args, confirm: true })
      expect(ok.isError).toBe(false)
      expect(fake.seen.map((s) => `${s.method} ${s.path}`)).toEqual([`${method} ${path}`])
    })
  }

  test('umami_request runs GET without confirm and refuses path traversal', async () => {
    expect((await callTool('umami_request', { method: 'GET', path: '/websites' })).isError).toBe(false)
    expect((await callTool('umami_request', { method: 'GET', path: '/websites?x=1' })).isError).toBe(true)
    expect((await callTool('umami_request', { method: 'GET', path: '/../admin' })).isError).toBe(true)
    expect(fake.seen.map((s) => s.path)).toEqual(['/api/websites'])
  })

  test('create_user never echoes the password', async () => {
    const res = await callTool('umami_create_user', { username: 'ann', password: 'hunter2hunter2', role: 'view-only' })
    expect(fake.seen[0]!.body).toEqual({ username: 'ann', password: 'hunter2hunter2', role: 'view-only' })
    expect(res.text).not.toContain('hunter2')
  })
})
