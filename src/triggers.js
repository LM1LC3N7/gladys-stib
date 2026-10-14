// -----------------------------------------------------------------------------
// Two consecutive readings -> scene events. Pure. Nothing fires on the first
// reading (no transition without a previous value).
//
// STIB gives no vehicle id: a departure of the previous reading is the same
// vehicle when it has the same line and destination and an expected time
// within `MATCH_WINDOW` (closest pairs first).
// -----------------------------------------------------------------------------

import {
  DEPARTURE_THRESHOLDS,
  MATCH_WINDOW,
  MAX_NETWORK_EVENTS,
  SCENE_TRIGGERS,
} from './constants.js';
import { noticeText } from './model.js';
import { localized, prettyName } from './text.js';

/** current departure -> the same vehicle in the previous reading. */
export function matchDepartures(previous, current) {
  const pairs = [];
  current.forEach((d, i) => {
    previous.forEach((o, j) => {
      if (o.line !== d.line || o.destination.fr !== d.destination.fr) {
        return;
      }
      const delta = Math.abs(Date.parse(o.expectedAt) - Date.parse(d.expectedAt));
      if (delta <= MATCH_WINDOW) {
        pairs.push({ i, j, delta });
      }
    });
  });
  pairs.sort((a, b) => a.delta - b.delta);
  const usedI = new Set();
  const usedJ = new Set();
  const matches = new Map();
  for (const { i, j } of pairs) {
    if (!usedI.has(i) && !usedJ.has(j)) {
      usedI.add(i);
      usedJ.add(j);
      matches.set(current[i], previous[j]);
    }
  }
  return matches;
}

/**
 * The key of a last departure, once per service day (a service day ends
 * after midnight: shift by 4 hours).
 */
export const lastKey = (deviceId, d) =>
  [
    deviceId,
    d.line,
    d.destination.fr,
    new Date(Date.parse(d.expectedAt) - 4 * 3_600_000).toISOString().slice(0, 10),
  ].join('|');

/**
 * The events of a stop between two readings. `announced` remembers the last
 * departures already announced (a flag that flickers fires once).
 */
export function stopEvents(deviceId, previous, current, { language = 'fr', announced } = {}) {
  const memory = announced ?? new Set();
  const events = [];
  if (!previous) {
    for (const d of current.departures.filter((x) => x.last)) {
      memory.add(lastKey(deviceId, d));
    }
    return events;
  }
  const matches = matchDepartures(previous.departures, current.departures);
  for (const d of current.departures) {
    const base = {
      stop: deviceId,
      line: d.line,
      destination: prettyName(localized(d.destination, language)),
      minutes: d.minutes,
      expected_at: d.expectedAt,
    };
    const old = matches.get(d);
    if (old) {
      for (const threshold of DEPARTURE_THRESHOLDS) {
        if (old.minutes > threshold && d.minutes <= threshold) {
          events.push({
            key: SCENE_TRIGGERS.APPROACHING,
            data: { ...base, threshold: String(threshold) },
          });
        }
      }
    }
    if (d.last && !memory.has(lastKey(deviceId, d))) {
      memory.add(lastKey(deviceId, d));
      events.push({ key: SCENE_TRIGGERS.LAST, data: base });
    }
  }
  return events;
}

const noticeEvents = (key, notice, language) =>
  (notice.lines.length > 0 ? notice.lines : [null]).map((line) => ({
    key,
    data: {
      line,
      scope: notice.mine ? 'mine' : 'other',
      notice: noticeText(notice, language).slice(0, 1000),
      notice_id: notice.id,
      lines: notice.lines.join(', '),
      stops: notice.points.length,
    },
  }));

/**
 * The notices published and withdrawn since the previous reading, one event
 * per line concerned, at most `MAX_NETWORK_EVENTS` per reading.
 */
export function networkEvents(previous, current, { language = 'fr' } = {}) {
  if (!previous) {
    return [];
  }
  const before = new Set(previous.items.map((n) => n.id));
  const after = new Set(current.items.map((n) => n.id));
  const events = [
    ...current.items
      .filter((n) => !before.has(n.id))
      .flatMap((n) => noticeEvents(SCENE_TRIGGERS.DISRUPTED, n, language)),
    ...previous.items
      .filter((n) => !after.has(n.id))
      .flatMap((n) => noticeEvents(SCENE_TRIGGERS.CLEARED, n, language)),
  ];
  return events.slice(0, MAX_NETWORK_EVENTS);
}
