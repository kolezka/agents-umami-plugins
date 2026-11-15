# agents-umami-plugins

Administer [Umami](https://umami.is) analytics from a coding agent. One MCP server, packaged
for two hosts:

- **Claude Code**: a plugin with the `umami` MCP server and the `umami-admin` skill.
- **DeepSeek Harness (DSH)**: a bundle that mounts the same server and skill.

It works with self-hosted Umami and with Umami Cloud.

## What it can do

| Area | Tools |
| --- | --- |
| Account | `umami_me` |
| Websites | `umami_list_websites`, `umami_get_website`, `umami_create_website`, `umami_update_website`, `umami_delete_website`, `umami_reset_website` |
| Analytics | `umami_website_stats`, `umami_website_pageviews`, `umami_website_metrics`, `umami_website_active` |
| Teams | `umami_list_teams`, `umami_get_team`, `umami_create_team`, `umami_update_team`, `umami_delete_team`, `umami_list_team_users`, `umami_add_team_user`, `umami_remove_team_user`, `umami_list_team_websites` |
| Users (self-hosted) | `umami_get_user`, `umami_create_user`, `umami_update_user`, `umami_delete_user`, `umami_list_user_websites` |
| Anything else | `umami_request`: any endpoint from the [Umami API docs](https://docs.umami.is/docs/api) |

Safety:

- Delete and reset tools, and every non-GET `umami_request`, refuse to run without
  `confirm: true`. The skill tells the agent to show the object and ask first.
- Credentials in responses (`token`, `password` fields) are replaced with `<redacted>`.
  `/api/me`, for example, echoes the caller's token.
- Date ranges such as `7d` or `today` are turned into explicit `startAt`/`endAt`
  timestamps, so they work on Umami versions older than 3.5 that do not accept `period`.

## Configuration

The server reads two environment variables from the process that starts the agent:

| Variable | Required | Value |
| --- | --- | --- |
| `UMAMI_API_TOKEN` | yes | An Umami API key (Settings, API keys) |
| `UMAMI_API_URL` | no | Your instance, e.g. `https://umami.example.com`. Defaults to Umami Cloud, `https://api.umami.is/v1` |

`/api` is added for you, so `https://umami.example.com` and `https://umami.example.com/api`
both work. Put them in `~/.zshenv` or your shell profile:

```sh
export UMAMI_API_TOKEN=...
export UMAMI_API_URL=https://umami.example.com
```

Requires Node.js 20 or newer on `PATH`.

## Install in Claude Code

```sh
claude plugin marketplace add kolezka/agents-umami-plugins
claude plugin install umami@agents-umami-plugins
```

Restart Claude Code, then ask something like "how many visitors did example.com have last
week?". To try it from a checkout without installing:

```sh
claude --plugin-dir ./plugins/umami
```

## Install in DeepSeek Harness

The bundle is `plugins/umami`. Install it into a profile from a checkout:

```sh
git clone https://github.com/kolezka/agents-umami-plugins
dsh plugin --profile web add file:$PWD/agents-umami-plugins/plugins/umami
dsh --profile web --dump-config | grep umami   # shows the "# == @kolezka/umami-dsh" layer
```

The bundle adds two rows: `claude-compat-umami` loads the skill through
[`claude-plugin-dsh`](https://github.com/kolezka/claude-plugins-dsh), and `umami-mcp` starts
the server through `@deepseek-ai/dsh-mcp-client`. DSH scrubs the environment of MCP
children, so `umami-mcp` passes `UMAMI_API_TOKEN` and `UMAMI_API_URL` on explicitly. The
tools appear as `mcp__umami__*`.

Remove it with `dsh plugin --profile web remove @kolezka/umami-dsh`.

## Known limits

- On self-hosted Umami, API keys get HTTP 401 on `/api/admin/*` and `/api/me/api-keys`,
  even for an admin account. Those routes need a browser login session.
- `umami_website_metrics` uses `type: "path"` for pages. Older instances expect `url`.

## Development

```sh
bun install
bun run build    # src/ -> plugins/umami/server/umami-mcp.js (committed, the plugins run it)
bun test         # unit tests against a fake Umami, plus the built bundle under node
bun run check    # TypeScript
bun run smoke    # read-only checks against the instance in your environment
```

Rebuild and commit `plugins/umami/server/umami-mcp.js` with every change to `src/`. CI fails
when the committed bundle does not match the source.

## Releasing

Run the `release` workflow from the Actions tab and pick `patch`, `minor` or `major`. It:

1. checks types, tests and that the committed bundle matches the source,
2. bumps the version in every file listed in `release.config.json` (both `package.json`
   files, the plugin manifest and the marketplace entry) and rebuilds the bundle, which
   reports the new version,
3. adds a `CHANGELOG.md` section built from the Conventional Commits since the last tag,
4. commits `chore(release): vX.Y.Z`, tags it, pushes both to `main` in one atomic push and
   creates the GitHub release with that section as notes.

Tick `dry_run` to see the result without publishing. Pull requests that change the release
tooling run the same steps in dry-run mode. Locally: `bun scripts/release.ts minor` on a
clean tree prepares the same changes without committing.

## License

MIT
