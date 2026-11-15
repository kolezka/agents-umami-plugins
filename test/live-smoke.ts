// Read-only check against a real instance from UMAMI_API_TOKEN / UMAMI_API_URL. Run with `bun run smoke`.
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'

const token = process.env.UMAMI_API_TOKEN
if (!token) throw new Error('UMAMI_API_TOKEN is not set')

const client = new Client({ name: 'live-smoke', version: '0' })
await client.connect(
  new StdioClientTransport({
    command: 'node',
    args: [fileURLToPath(new URL('../plugins/umami/server/umami-mcp.js', import.meta.url))],
    env: { PATH: process.env.PATH ?? '', UMAMI_API_TOKEN: token, UMAMI_API_URL: process.env.UMAMI_API_URL ?? '' },
  }),
)

let failures = 0
async function check(name: string, args: Record<string, unknown>, expectError = false) {
  const res = (await client.callTool({ name, arguments: args })) as { content: { text: string }[]; isError?: boolean }
  const text = res.content[0]?.text ?? ''
  const ok = Boolean(res.isError) === expectError && !text.includes(token!)
  if (!ok) failures++
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name} ${JSON.stringify(args)} -> ${text.replace(/\s+/g, ' ').slice(0, 110)}`)
  return text
}

await check('umami_me', {})
const sites = JSON.parse(await check('umami_list_websites', { pageSize: 1 }))
const websiteId = sites.data[0]?.id
if (websiteId) {
  await check('umami_get_website', { websiteId })
  await check('umami_website_stats', { websiteId, period: '30d' })
  await check('umami_website_stats', { websiteId, period: 'today', timezone: 'Europe/Warsaw' })
  await check('umami_website_pageviews', { websiteId, period: '7d', unit: 'day' })
  await check('umami_website_metrics', { websiteId, type: 'path', period: '90d', limit: 3 })
  await check('umami_website_metrics', { websiteId, type: 'country', period: '90d', limit: 3 })
  await check('umami_website_active', { websiteId })
  await check('umami_request', { method: 'GET', path: `/websites/${websiteId}/sessions`, query: { ...range30d(), pageSize: 1 } })
  // Refused before any request is sent.
  await check('umami_delete_website', { websiteId }, true)
}
await check('umami_list_teams', {})
await client.close()

function range30d() {
  const endAt = Date.now()
  return { startAt: endAt - 30 * 86_400_000, endAt }
}

console.log(failures ? `${failures} check(s) failed` : 'all checks passed')
process.exit(failures ? 1 : 0)
