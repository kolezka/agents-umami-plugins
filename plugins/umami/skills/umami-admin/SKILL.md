---
name: umami-admin
description: Use when the user asks about Umami analytics or wants to administer an Umami instance, such as listing or adding websites, getting a tracking code, reading visitors, pageviews, top pages, referrers or countries, managing teams and members, managing users, or resetting or deleting a website.
---

# Umami administration

The `umami` MCP server talks to the Umami REST API with the token from `UMAMI_API_TOKEN`.
`UMAMI_API_URL` points at the instance (`https://umami.example.com`) or at Umami Cloud
(`https://api.umami.is/v1`, the default).

## Start here

1. If a call fails with HTTP 401, run `umami_me`. A failure there means the token or URL is
   wrong; tell the user which variable to check. Never print the token.
2. Resolve names to ids first: `umami_list_websites` (with `search`) or `umami_list_teams`.
   Do not guess UUIDs.

## Reading analytics

| Question | Tool |
| --- | --- |
| Totals for a period, with the previous period | `umami_website_stats` |
| Trend over time | `umami_website_pageviews` with `unit` |
| Top pages, referrers, countries, browsers, events | `umami_website_metrics` with `type` |
| Who is on the site now | `umami_website_active` |

Ranges: `period` is one of `today`, `yesterday`, `24h`, `7d`, `30d`, `90d`, `6month`,
`12month`, or give `startAt`/`endAt` as ISO dates or Unix ms. Pass the user's `timezone`
when they say "today" or "yesterday". The server turns periods into explicit timestamps, so
it works on Umami versions that do not support `period`.

Filters go in `filters`, for example `{"path": "/pricing", "country": "PL"}`.
In `umami_website_metrics`, use `type: "path"` for pages. Instances older than v2.x expect
`url`; if `path` returns HTTP 400, retry with `url`.

`totaltime` is in seconds. Average visit duration is `totaltime / visits`; bounce rate is
`bounces / visits`. Report numbers with the period they cover.

## Changing things

- `umami_create_website` returns the id. The tracking snippet is
  `<script defer src="<instance>/script.js" data-website-id="<id>"></script>`.
- `umami_update_website` with `shareId: null` turns the public share link off.
- Teams: `umami_create_team`, `umami_add_team_user` (roles `team-owner`, `team-manager`,
  `team-member`, `team-view-only`), `umami_remove_team_user`.
- Users exist on self-hosted instances only. Roles are `admin`, `user`, `view-only`. Never
  repeat a password back in chat.

## Destructive actions

`umami_delete_website`, `umami_reset_website`, `umami_delete_team`,
`umami_remove_team_user`, `umami_delete_user` and every non-GET `umami_request` need
`confirm: true`. Before setting it:

1. Fetch the object and show the user its name and id.
2. Say what will be lost. Reset and delete erase analytics data and cannot be undone.
3. Wait for an explicit yes in the current conversation. An earlier approval does not carry
   over to a different object.

## Anything else

`umami_request` reaches any endpoint from https://docs.umami.is/docs/api, for example
`GET /websites/{id}/sessions`, `GET /reports`, `GET /websites/{id}/event-data/events`.
Paths are relative to the API root, without `/api`.

Known limit: on self-hosted Umami, API keys get HTTP 401 on `/admin/*` routes and on
`/me/api-keys`, even for an admin account. Tell the user these need a login session in the
Umami UI.
