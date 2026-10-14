// -----------------------------------------------------------------------------
// The configuration the user fills (manifest `config_schema`), normalized.
// -----------------------------------------------------------------------------

import { LANGUAGES, PACING } from './constants.js';

// Defaults: they MUST match the `default` values of the manifest.
export const DEFAULTS = {
  nearby_stops: 2,
  stops: '',
  max_departures: 3,
  poll_frequency: 30,
  language: 'fr',
  watch_disturbances: true,
};

const number = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

/** A line as STIB writes it: "92", "T81" (T-bus). */
export const normalizeLine = (line) =>
  String(line ?? '')
    .trim()
    .toUpperCase();

/**
 * One watched stop of the `stops` field: "Louise", "Louise@2|6",
 * "Louise@92:Tram du matin", "8321".
 *   { query: 'Louise', lines: ['92'], name: 'Tram du matin' }
 */
export function parseStopEntry(entry) {
  const text = String(entry ?? '').trim();
  if (!text) {
    return undefined;
  }
  const [head, ...rest] = text.split(':');
  const name = rest.join(':').trim() || undefined;
  const [query, filter] = head.split('@');
  const lines = String(filter ?? '')
    .split('|')
    .map(normalizeLine)
    .filter(Boolean);
  return { query: query.trim(), lines, name };
}

export function normalizeConfig(raw = {}) {
  const language = String(raw.language ?? DEFAULTS.language).toLowerCase();
  return {
    // Never logged, never in an error: only sent as a header to the gateway.
    apiKey: String(raw.api_key ?? '').trim(),
    nearbyStops: number(raw.nearby_stops, DEFAULTS.nearby_stops, 0, 5),
    stops: String(raw.stops ?? '')
      .split(',')
      .map(parseStopEntry)
      .filter((e) => e?.query),
    maxDepartures: number(raw.max_departures, DEFAULTS.max_departures, 1, 5),
    pollFrequency: number(raw.poll_frequency, DEFAULTS.poll_frequency, 20, 600),
    language: LANGUAGES.includes(language) ? language : DEFAULTS.language,
    watchDisturbances: raw.watch_disturbances !== false && raw.watch_disturbances !== 'false',
  };
}

/**
 * The pace actually used: the configured one with a subscription key, at
 * least every 20 minutes without (the anonymous quota is 100 requests a day).
 */
export function pacingOf(config) {
  const tier = config.apiKey ? PACING.KEY : PACING.ANONYMOUS;
  return {
    anonymous: !config.apiKey,
    pollSeconds: Math.max(tier.minPoll, config.pollFrequency),
    disturbancesInterval: tier.disturbancesInterval,
  };
}
