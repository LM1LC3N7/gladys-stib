// -----------------------------------------------------------------------------
// Fake `fetch` for the tests: routes requests to handlers, records every
// call, and fails loudly on an unexpected URL. No test touches the network.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { setFetch } from '../../src/http.js';

setFetch(async (url) => {
  throw new Error(`Network call without a fake fetch in a test: ${url}`);
});

export function fixture(name) {
  return JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));
}

export const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Install a fake fetch; `routes` is a list of [RegExp, handler({ url, params, init })]. */
export function installFetch(routes) {
  const calls = [];
  const previous = setFetch(async (url, init = {}) => {
    const call = { url, params: Object.fromEntries(new URL(url).searchParams), init };
    calls.push(call);
    const route = routes.find(([pattern]) => pattern.test(url));
    if (!route) {
      throw new Error(`Unexpected network call in a test: ${url}`);
    }
    return route[1](call);
  });
  return { calls, restore: () => setFetch(previous) };
}

/** A list answer of the gateway, paged by `limit` / `offset` like the real one. */
export function paged(rows, params = {}) {
  const limit = Math.min(1000, Number(params.limit ?? 1000));
  const offset = Number(params.offset ?? 0);
  return json({
    results: rows.slice(offset, offset + limit),
    total_count: rows.length,
    parameters: params,
  });
}

/** The ids of a `pointid in ("8321","3518B")` clause. */
export const whereIds = (where) => [...String(where ?? '').matchAll(/"([^"]+)"/g)].map((m) => m[1]);

/** The instant of the day fixture (waiting-day.json): 08:00 in Brussels. */
export const FIXTURE_NOW = Date.parse('2026-10-14T08:00:00+02:00');

/**
 * The rows of the day fixture, the passages shifted by `shiftSeconds` and
 * edited by `edit(passage, row)` (the passing times are a JSON string).
 */
export function waitingRows({ shiftSeconds = 0, edit = () => {} } = {}) {
  return fixture('waiting-day.json').results.map((row) => {
    const passages = JSON.parse(row.passingtimes).map((p) => {
      const at = new Date(Date.parse(p.expectedArrivalTime) + shiftSeconds * 1000);
      const copy = { ...p, expectedArrivalTime: at.toISOString() };
      edit(copy, row);
      return copy;
    });
    return { ...row, passingtimes: JSON.stringify(passages) };
  });
}

/** Install the whole fake gateway; `state` holds what each dataset answers. */
export function installGateway(state) {
  return installFetch([
    [
      /\/rt\/WaitingTimes\?/,
      ({ params }) => {
        const ids = whereIds(params.where);
        return paged(
          state.waiting.filter((r) => ids.includes(r.pointid)),
          params,
        );
      },
    ],
    [/\/rt\/TravellersInformation\?/, ({ params }) => paged(state.notices, params)],
    [/\/static\/StopDetails\?/, ({ params }) => paged(state.stops, params)],
    [/\/static\/stopsByLine\?/, ({ params }) => paged(state.lines, params)],
  ]);
}

/** The default state of the fake gateway: the fixtures. */
export const gatewayState = () => ({
  waiting: waitingRows(),
  notices: fixture('travellers-information.json').results,
  stops: fixture('stop-details.json').results,
  lines: fixture('stops-by-line.json').results,
});
