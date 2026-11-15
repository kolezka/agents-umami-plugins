// Mounts the umami MCP server in DeepSeek Harness. A patch row cannot know where this package is
// installed, so this plugin resolves the server path itself and hands it to dsh-mcp-client.
import { fileURLToPath } from 'node:url'
import * as McpClient from '@deepseek-ai/dsh-mcp-client'

export const name = 'umami-mcp'

const serverPath = fileURLToPath(new URL('../server/umami-mcp.js', import.meta.url))

export function apply(ctx, config = {}) {
  // dsh-mcp-client scrubs the ambient environment, so pass the Umami variables on explicitly.
  const env = {}
  for (const key of ['UMAMI_API_TOKEN', 'UMAMI_API_URL']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  ctx.plugin(McpClient, {
    serverName: config.serverName ?? 'umami',
    transport: 'stdio',
    command: process.execPath,
    args: [serverPath],
    env,
    failOnStartupError: false,
  })
}
