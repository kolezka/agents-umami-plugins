import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { UmamiClient } from './client.ts'
import { ConfigError, readConfig } from './config.ts'
import { createServer } from './server.ts'

let config
try {
  config = readConfig(process.env)
} catch (err) {
  if (!(err instanceof ConfigError)) throw err
  process.stderr.write(`umami-mcp: ${err.message}\n`)
  process.exit(1)
}
await createServer(new UmamiClient(config)).connect(new StdioServerTransport())
