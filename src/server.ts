import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { UmamiClient } from './client.ts'
import { registerTools } from './tools.ts'

export const VERSION = '0.1.0'

const INSTRUCTIONS = `Administer an Umami analytics instance through its REST API.
Find ids with umami_list_websites or umami_list_teams before calling tools that need one.
Delete and reset tools, and non-GET umami_request calls, need confirm: true. Ask the user before setting it.
Ranges: pass period (today, yesterday, 24h, 7d, 30d, 90d, 6month, 12month) or startAt/endAt.`

export function createServer(client: UmamiClient): McpServer {
  const server = new McpServer({ name: 'umami', version: VERSION }, { instructions: INSTRUCTIONS })
  registerTools(server, client)
  return server
}
