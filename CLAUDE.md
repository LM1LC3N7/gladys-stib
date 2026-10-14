# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for
human contributors.

## What this is

A Gladys Assistant **external integration** of type `device`: a Node.js
service (Node 22+, ESM, no build step) in its own sandboxed Docker container,
talking to Gladys through `@gladysassistant/integration-sdk` (v0.15). It
reads the **STIB-MIVB** open data of the Belgian Mobility portal (waiting
times, travellers information, stops, lines) and turns the departures of
watched stop platforms and the network notices into devices, scene triggers,
a scene action and dashboard widgets. Unofficial: not affiliated with
STIB-MIVB. Sibling of `gladys-sncb` (same vocabulary of devices, triggers and
widgets).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npm run audit                             # npm audit --omit=dev
npx github:GladysAssistant/integration-store .   # store admission checks
```

Run `format:check`, `lint`, `test` and `audit` before every commit.

## Architecture

```
index.js            SDK wiring only (handlers registered before connect())
src/app.js          StibApp: directory, discovery, refresh loop, network,
                    scene action, widgets, buttons
src/stib.js         the gateway client (paging, `where`, the key header)
src/stops.js        directory: name/id resolution, nearest stops (pure)
src/model.js        waiting times -> departures, notices (pure)
src/devices.js      devices, params (the watch settings), states (pure)
src/triggers.js     transitions -> scene events (pure)
src/widget.js       the two widgets (pure)
src/text.js         fold, embedded JSON, names in capitals (pure)
src/config.js       config_schema normalized, the `stops` grammar, pacing
src/constants.js    endpoints, pacing, thresholds, manifest keys
src/i18n.js         runtime texts (en/fr)
src/http.js         the only network access (fetch, timeout, User-Agent)
test/fixtures/      real answers (2026-10-14) + waiting-day.json shaped after them
test/helpers/       fake gateway (fetch), fake timers; Gladys is the SDK's fake
```

## Rules

- **Unofficial.** Every user-facing surface says "unofficial connector, not
  affiliated with STIB-MIVB". Never use the STIB logo. The data is CC BY 4.0:
  keep the "STIB-MIVB – Open Data" attribution (docs, intro, widgets).
- **Keys are forever**: the manifest keys (`src/constants.js`), the feature
  keys (`FEATURE` in `src/devices.js`) and the external id shapes
  (`stop:<pointId>`, `network`) are stored in user scenes and dashboards.
  Never rename them.
- **The watch settings live in the device params** (point id, line filter,
  served lines, max departures): the poll path reads the device Gladys hands
  back, never the configuration nor the directory.
- **Be polite with the portal** (published quotas: anonymous 100 requests a
  day and 10 a minute; free key 12,000 a day and 500 a minute): every watched
  point in one `WaitingTimes` request (50 points per request), 30 s by
  default and never below 20 s with a key, 20 minutes without; the notices
  every 5 minutes (2 hours without a key); the directory once a day, read one
  request after the other. `PACING` in `src/constants.js` is the one place.
- **The key is a secret**: sent only as the `bmc-partner-key` header to the
  developer portal's gateway, never logged, never in an error (`HttpError`
  keeps the path only).
- **One event per transition** (`src/triggers.js`): the first reading fires
  nothing; a vehicle is matched across readings by line, destination and
  expected time (`MATCH_WINDOW`); a last departure is announced once per
  line, direction and service day; at most `MAX_NETWORK_EVENTS` per reading.
- **No event from an action**: the scene action reads for its answer only.
- **The night markers** (two passages with the same time and a "Last
  departure" / "End of service" message) are statuses, not departures
  (`isStatusRow`).
- **Read-only rootfs**: write nothing on disk.
- **Versions belong to the Release workflow** (Actions → Release). Never edit
  `version` in `package.json` or in the manifest, nor the `docker_image` tag.
- **Changelog**: every user-visible change adds a line under
  `## [Unreleased]` in `CHANGELOG.md`.
- **Manifest texts** are `{ en, fr }` objects; the catalog description holds
  10 to 100 characters per language; `test/manifest.test.js` ties the
  manifest to the code.
- **User-facing text** is bilingual, `docs/en.md` and `docs/fr.md` kept in
  sync. Comments explain why, in English.
- **Tests never touch the network** (`installGateway` replaces `fetch`).

## CI and pushes

- Group the commits and push **at most once a day**, unless the maintainer
  explicitly asks otherwise: the GitHub Actions quota is limited.
- If every CI job fails in under 2 seconds, the quota is exhausted: it is
  not a bug in the code.
- The Docker image cannot be built in the Claude Code cloud container (no
  network for `apk` inside `docker build`): the CI builds it.

## Refreshing the fixtures

Mind the anonymous quota (100 requests a day): a handful of calls is enough.

```bash
B='https://api-management-discovery-production.azure-api.net/api/datasets/stibmivb'
curl -s "$B/rt/WaitingTimes?where=pointid%20in%20(%228321%22,%228322%22,%226361%22,%226314%22,%223518B%22)&limit=1000" | python3 -m json.tool --indent 1
curl -s "$B/rt/TravellersInformation?limit=1000" > /tmp/ti.json      # then keep a subset
curl -s "$B/static/StopDetails?limit=1000&offset=0" > /tmp/stops.json # 3 pages
curl -s "$B/static/stopsByLine?limit=1000" > /tmp/lines.json
```

`FIXTURE_NOW` in `test/helpers/fakeFetch.js` is 08:00 in Brussels, the
morning of `waiting-day.json`; the expected countdowns in the tests follow.
