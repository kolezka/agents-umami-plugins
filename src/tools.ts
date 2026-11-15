import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { UmamiApiError, type Method, type Query, type UmamiClient } from './client.ts'
import { PERIODS, resolveRange } from './range.ts'

type Shape = z.ZodRawShape
type Result = { content: { type: 'text'; text: string }[]; isError?: boolean }

const id = (what: string) => z.string().min(1).describe(`${what} id (UUID)`)
const confirm = z
  .literal(true)
  .describe('Must be true. Ask the user before setting it: this change cannot be undone.')

const rangeShape = {
  period: z.enum(PERIODS).optional().describe('Relative range. Defaults to 7d when no startAt/endAt is given.'),
  startAt: z.union([z.number(), z.string()]).optional().describe('Range start: Unix ms or ISO date. Not with period.'),
  endAt: z.union([z.number(), z.string()]).optional().describe('Range end: Unix ms or ISO date. Defaults to now.'),
  timezone: z.string().optional().describe('IANA time zone, e.g. Europe/Warsaw. Defaults to UTC.'),
  filters: z
    .record(z.string(), z.string())
    .optional()
    .describe('Extra query filters, e.g. {"path":"/pricing","country":"PL","event":"signup"}.'),
}

const pageShape = {
  search: z.string().optional(),
  page: z.number().int().positive().optional(),
  pageSize: z.number().int().positive().max(200).optional(),
}

function text(value: unknown): Result {
  return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] }
}

function failure(err: unknown): Result {
  const message =
    err instanceof UmamiApiError || err instanceof Error ? err.message : `Unexpected error: ${String(err)}`
  return { content: [{ type: 'text', text: message }], isError: true }
}

function rangeQuery(args: {
  period?: (typeof PERIODS)[number]
  startAt?: number | string
  endAt?: number | string
  timezone?: string
  filters?: Record<string, string>
}): Query {
  const { startAt, endAt } = resolveRange(args)
  return { ...args.filters, startAt, endAt, timezone: args.timezone }
}

function compact<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>
}

export function registerTools(server: McpServer, client: UmamiClient): void {
  const add = <S extends Shape>(
    name: string,
    description: string,
    inputSchema: S,
    kind: 'read' | 'write' | 'destroy',
    run: (args: z.infer<z.ZodObject<S>>) => Promise<unknown>,
  ) => {
    server.registerTool(
      name,
      {
        description,
        inputSchema,
        annotations: {
          readOnlyHint: kind === 'read',
          destructiveHint: kind === 'destroy',
          openWorldHint: true,
        },
      },
      (async (args: z.infer<z.ZodObject<S>>) => {
        try {
          return text(await run(args))
        } catch (err) {
          return failure(err)
        }
      }) as never,
    )
  }
  const call = (method: Method, path: string, query?: Query, body?: unknown) =>
    client.request(method, path, { query, body })

  // Account
  add('umami_me', 'Show the account behind UMAMI_API_TOKEN: user, role, auth type. Secrets are redacted.', {}, 'read', () =>
    call('GET', '/me'),
  )

  // Websites
  add(
    'umami_list_websites',
    'List websites the token can see. includeTeams adds websites owned by the user\'s teams.',
    { ...pageShape, includeTeams: z.boolean().optional() },
    'read',
    (a) => call('GET', '/websites', a),
  )
  add('umami_get_website', 'Get one website: name, domain, shareId, team, timestamps.', { websiteId: id('Website') }, 'read', (a) =>
    call('GET', `/websites/${a.websiteId}`),
  )
  add(
    'umami_create_website',
    'Create a website. Returns its id, which goes into the tracking script as data-website-id.',
    {
      name: z.string().min(1),
      domain: z.string().min(1).describe('Domain without protocol, e.g. example.com'),
      teamId: z.string().optional().describe('Create it under this team instead of the user'),
    },
    'write',
    (a) => call('POST', '/websites', undefined, compact(a)),
  )
  add(
    'umami_update_website',
    'Update a website\'s name, domain or share id. shareId null turns the public share link off.',
    {
      websiteId: id('Website'),
      name: z.string().min(1).optional(),
      domain: z.string().min(1).optional(),
      shareId: z.string().nullable().optional(),
    },
    'write',
    ({ websiteId, ...rest }) => call('POST', `/websites/${websiteId}`, undefined, compact(rest)),
  )
  add(
    'umami_delete_website',
    'Delete a website and all of its analytics data.',
    { websiteId: id('Website'), confirm },
    'destroy',
    (a) => call('DELETE', `/websites/${a.websiteId}`),
  )
  add(
    'umami_reset_website',
    'Erase all analytics data of a website but keep the website and its id.',
    { websiteId: id('Website'), confirm },
    'destroy',
    (a) => call('POST', `/websites/${a.websiteId}/reset`),
  )

  // Analytics
  add(
    'umami_website_stats',
    'Summary numbers for a range: pageviews, visitors, visits, bounces, total time, with the previous period for comparison.',
    { websiteId: id('Website'), ...rangeShape },
    'read',
    ({ websiteId, ...r }) => call('GET', `/websites/${websiteId}/stats`, rangeQuery(r)),
  )
  add(
    'umami_website_pageviews',
    'Pageviews and sessions over time, grouped by unit.',
    { websiteId: id('Website'), ...rangeShape, unit: z.enum(['minute', 'hour', 'day', 'month', 'year']).optional() },
    'read',
    ({ websiteId, unit, ...r }) => call('GET', `/websites/${websiteId}/pageviews`, { ...rangeQuery(r), unit: unit ?? 'day' }),
  )
  add(
    'umami_website_metrics',
    'Ranked breakdown by one dimension. Common types: path, entry, exit, title, referrer, channel, country, region, city, browser, os, device, language, screen, event, hostname, tag. Older instances use url instead of path.',
    {
      websiteId: id('Website'),
      type: z.string().min(1),
      limit: z.number().int().positive().max(500).optional(),
      ...rangeShape,
    },
    'read',
    ({ websiteId, type, limit, ...r }) =>
      call('GET', `/websites/${websiteId}/metrics`, { ...rangeQuery(r), type, limit }),
  )
  add('umami_website_active', 'Number of visitors active in the last few minutes.', { websiteId: id('Website') }, 'read', (a) =>
    call('GET', `/websites/${a.websiteId}/active`),
  )

  // Teams
  add('umami_list_teams', 'List teams the token can see.', pageShape, 'read', (a) => call('GET', '/teams', a))
  add('umami_get_team', 'Get one team, including its access code.', { teamId: id('Team') }, 'read', (a) =>
    call('GET', `/teams/${a.teamId}`),
  )
  add('umami_create_team', 'Create a team. The caller becomes its owner.', { name: z.string().min(1) }, 'write', (a) =>
    call('POST', '/teams', undefined, a),
  )
  add(
    'umami_update_team',
    'Rename a team or rotate its access code.',
    { teamId: id('Team'), name: z.string().min(1).optional(), accessCode: z.string().min(1).optional() },
    'write',
    ({ teamId, ...rest }) => call('POST', `/teams/${teamId}`, undefined, compact(rest)),
  )
  add('umami_delete_team', 'Delete a team.', { teamId: id('Team'), confirm }, 'destroy', (a) =>
    call('DELETE', `/teams/${a.teamId}`),
  )
  add('umami_list_team_users', 'List members of a team with their roles.', { teamId: id('Team'), ...pageShape }, 'read', ({ teamId, ...p }) =>
    call('GET', `/teams/${teamId}/users`, p),
  )
  add(
    'umami_add_team_user',
    'Add an existing user to a team.',
    {
      teamId: id('Team'),
      userId: id('User'),
      role: z.enum(['team-owner', 'team-manager', 'team-member', 'team-view-only']),
    },
    'write',
    ({ teamId, ...body }) => call('POST', `/teams/${teamId}/users`, undefined, body),
  )
  add(
    'umami_remove_team_user',
    'Remove a user from a team.',
    { teamId: id('Team'), userId: id('User'), confirm },
    'destroy',
    (a) => call('DELETE', `/teams/${a.teamId}/users/${a.userId}`),
  )
  add('umami_list_team_websites', 'List websites owned by a team.', { teamId: id('Team'), ...pageShape }, 'read', ({ teamId, ...p }) =>
    call('GET', `/teams/${teamId}/websites`, p),
  )

  // Users (self-hosted, admin token)
  add('umami_get_user', 'Get one user. Self-hosted admin only.', { userId: id('User') }, 'read', (a) =>
    call('GET', `/users/${a.userId}`),
  )
  add(
    'umami_create_user',
    'Create a user. Self-hosted admin only. Never echo the password back to the chat.',
    {
      username: z.string().min(1),
      password: z.string().min(8),
      role: z.enum(['admin', 'user', 'view-only']),
    },
    'write',
    (a) => call('POST', '/users', undefined, a),
  )
  add(
    'umami_update_user',
    'Change a user\'s username, password or role. Self-hosted admin only.',
    {
      userId: id('User'),
      username: z.string().min(1).optional(),
      password: z.string().min(8).optional(),
      role: z.enum(['admin', 'user', 'view-only']).optional(),
    },
    'write',
    ({ userId, ...rest }) => call('POST', `/users/${userId}`, undefined, compact(rest)),
  )
  add('umami_delete_user', 'Delete a user. Self-hosted admin only.', { userId: id('User'), confirm }, 'destroy', (a) =>
    call('DELETE', `/users/${a.userId}`),
  )
  add('umami_list_user_websites', 'List websites owned by a user.', { userId: id('User'), ...pageShape }, 'read', ({ userId, ...p }) =>
    call('GET', `/users/${userId}/websites`, p),
  )

  // Anything else in https://docs.umami.is/docs/api
  add(
    'umami_request',
    'Call any Umami API endpoint not covered by the other tools (reports, sessions, events, event-data, shares, admin routes). The path is relative to the API root, e.g. /websites/{id}/sessions. Writes (any method but GET) need confirm: true. Prefer the typed tools when one fits.',
    {
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
      path: z.string().regex(/^\/[A-Za-z0-9_\-/.]*$/, 'Path must start with / and contain no query string'),
      query: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
      body: z.unknown().optional(),
      confirm: z.boolean().optional().describe('Required (true) for every method except GET. Ask the user first.'),
    },
    'destroy',
    async (a) => {
      if (a.method !== 'GET' && a.confirm !== true) {
        throw new Error(`${a.method} ${a.path} changes data. Ask the user, then call again with confirm: true.`)
      }
      return call(a.method, a.path, a.query, a.body)
    },
  )
}
