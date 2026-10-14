# gladys-stib

[Gladys Assistant](https://gladysassistant.com) external integration for
**STIB-MIVB** (Brussels public transport): next metro, tram and bus
departures at your stops, network disturbances, scene triggers and dashboard
widgets, from the STIB-MIVB open data of the
[Belgian Mobility portal](https://data.belgianmobility.io/). **Unofficial,
not affiliated with STIB-MIVB.**

User documentation: [docs/en.md](docs/en.md) · [docs/fr.md](docs/fr.md).

## How it works

```
Gladys ⇄ SDK ⇄ src/app.js (StibApp)
                 ├─ src/stib.js       WaitingTimes, TravellersInformation, StopDetails, stopsByLine
                 ├─ src/stops.js      the directory: typed names / ids, nearest stops (pure)
                 ├─ src/model.js      waiting times -> departures, notices (pure)
                 ├─ src/devices.js    devices, params, states (pure)
                 ├─ src/triggers.js   two readings -> scene events (pure)
                 └─ src/widget.js     the two widgets (pure)
```

- **Discovery** offers the stops typed in the configuration (with the line
  filter and custom name stored as device params) and every platform of the
  stops closest to the houses of Gladys (`location: true`), plus the network
  device. The directory (StopDetails + stopsByLine) is read once a day.
- **Reading**: only the devices the user created are read, all their points
  in one `WaitingTimes` request (`where=pointid in (...)`), every
  `poll_frequency` seconds with a subscription key, every 20 minutes without
  (the anonymous quota is 100 requests a day); the travellers information
  every 5 minutes (2 hours without a key). States go through
  `publishChangedStates`.
- **Triggers** come from two consecutive readings: STIB gives no vehicle id,
  so a vehicle is matched by line, destination and expected time. The first
  reading fires nothing.

## The gateway

The datasets answer an Opendatasoft-like dialect, checked by hand on
2026-10-14: `limit` (capped at 1000), `offset`, `where` with quoted strings
(`pointid in ("8321","3518B")`, `pointid="8321" and lineid="6"`). The
anonymous gateway (`api-management-discovery-production`) needs no key; the
developer portal (`api-management-opendata-production`) declares the
`bmc-partner-key` header for the free subscription keys.

## Development

```bash
npm install
npm test                                        # node --test, no network
npm run lint && npm run format:check
npx github:GladysAssistant/integration-store .  # store admission checks
```

The fixtures in `test/fixtures/` are real answers recorded on 2026-10-14
(a subset of the stops, lines and notices, and the waiting times at 03:00,
when only the "last departure" markers remain); `waiting-day.json` is shaped
after them for a morning at Louise and Porte de Namur.

## Releasing

**Actions → Release → Run workflow** (patch / minor / major): bumps the
version in `package.json` and the manifest, rolls `CHANGELOG.md`, tags, builds
the multi-arch image to GHCR and publishes the GitHub Release.

## License

Apache-2.0. The data: STIB-MIVB – Open Data, CC BY 4.0.
