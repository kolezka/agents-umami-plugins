// Runs the committed bundle the way Claude Code and DSH do: `node umami-mcp.js` over stdio.
import { afterAll, expect, test } from 'bun:test'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { FAKE_TOKEN, startFakeUmami } from './fake-umami.ts'

const bundle = fileURLToPath(new URL('../plugins/umami/server/umami-mcp.js', import.meta.url))
const fake = startFakeUmami()
afterAll(() => fake.stop())

test('the built server starts under node, lists tools and redacts the token', async () => {
  const transport = new StdioClientTransport({
    command: 'node',
    args: [bundle],
    env: { PATH: process.env.PATH ?? '', UMAMI_API_TOKEN: FAKE_TOKEN, UMAMI_API_URL: fake.url },
  })
  const client = new Client({ name: 'bundle-test', version: '0' })
  await client.connect(transport)
  try {
    const { tools } = await client.listTools()
    expect(tools.map((t) => t.name)).toContain('umami_website_stats')
    expect(tools.find((t) => t.name === 'umami_delete_website')?.annotations?.destructiveHint).toBe(true)
    const res = (await client.callTool({ name: 'umami_me', arguments: {} })) as { content: { text: string }[] }
    expect(res.content[0]!.text).toContain('"role": "admin"')
    expect(res.content[0]!.text).not.toContain(FAKE_TOKEN)
  } finally {
    await client.close()
  }
})

test('the built server exits with a clear message when the token is missing', async () => {
  const proc = Bun.spawn(['node', bundle], { env: { PATH: process.env.PATH ?? '' }, stderr: 'pipe', stdout: 'pipe' })
  expect(await proc.exited).toBe(1)
  expect(await new Response(proc.stderr).text()).toContain('UMAMI_API_TOKEN is not set')
})
