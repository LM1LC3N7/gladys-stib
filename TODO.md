# TODO

## Before announcing

- [ ] Test on a real Gladys 5.1+: discovery with a located house (every
      platform of the nearest stops), a typed stop with a line filter, the two
      widgets, the "vehicle approaching" trigger during a commute.
- [ ] Create a free account on the developer portal, subscribe, and run a
      day with the key: the header is accepted and the pace stays far below
      12,000 requests a day.
- [ ] Reserve "STIB-MIVB" in the forum thread t/10385, then add the
      `gladys-assistant-integration` topic to publish in the store.
- [ ] Turn on "Private vulnerability reporting" (SECURITY.md points there).

## To confirm

- [ ] The anonymous gateway (`api-management-discovery-production`) stays
      open without a key, and its quota (100 requests a day, 10 a minute,
      announced as indicative) is really what it enforces: until then the
      integration paces itself to it (departures every 20 minutes without a
      key).
- [ ] The subscription key: the developer portal declares the
      `bmc-partner-key` header (header or query) on
      `api-management-opendata-production`; on 2026-10-14 neither gateway
      checked keys (a made-up key was accepted). Confirm the host and the
      header with a real key, and the name of the free offer to subscribe to
      (docs step 1).
- [ ] The daytime shape of `WaitingTimes`: built from the real night answer
      (03:00, "Last departure" markers) and the old STIB API (two passages
      per line and point). Check a morning answer: millisecond or minute
      times, a `message` on a real last departure, other messages (diverted,
      not served...), and whether a letter-suffixed point (`3518B`, `5068F`)
      appears with its letter in `pointid`.
- [ ] The `priority` of the travellers information (3 to 9; the filler "Bon
      voyage sur nos lignes" is 9): ordering the notices by it once its
      meaning is known.
- [ ] `getHouses()` is granted with `location: true` on the install screen,
      and a house without coordinates is skipped quietly.
- [ ] The `duration` / `integer` features with `unit: minutes` render as
      countdowns, and the `text` features are readable on a phone.

## Ideas

- A "stop" filter on the disruption triggers (the notices list their points).
- Vehicle positions (`rt/VehiclePositions`) for a "my tram left the previous
  stop" trigger.
- De Lijn and TEC as sister integrations (the same portal publishes their
  GTFS-RT feeds).
