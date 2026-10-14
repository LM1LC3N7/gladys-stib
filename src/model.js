// -----------------------------------------------------------------------------
// The STIB-MIVB datasets -> plain readings. Pure: `now` is a parameter
// (milliseconds).
//
//   WaitingTimes row  { pointid, lineid, passingtimes: '[{ destination: { fr, nl },
//                       expectedArrivalTime, lineId, message?: { fr, nl, en, de } }]' }
//   TravellersInformation row  { id, content: '[{ text: [{ en, fr, nl }], type }]',
//                       lines: '[{ id }]', points: '[{ id }]', priority, type }
// -----------------------------------------------------------------------------

import { normalizeLine } from './config.js';
import { DEPARTED_GRACE } from './constants.js';
import { compareLines, localized, parseJson, prettyName } from './text.js';

const LAST = /last departure|dernier passage|laatste vertrek|laatste doorkomst|letzte/i;
const ENDED = /end of service|service termin|einde dienst|dienstschluss/i;

/** "last" (last departure of the day), "ended" (end of service) or "info". */
export function messageKind(message) {
  const all = Object.values(message ?? {}).join(' ');
  if (LAST.test(all)) {
    return 'last';
  }
  return ENDED.test(all) ? 'ended' : 'info';
}

/** The passages of one WaitingTimes row. */
export function passagesOf(row) {
  const list = parseJson(row?.passingtimes, []);
  return (Array.isArray(list) ? list : []).map((p) => {
    const destination = p?.destination;
    return {
      line: normalizeLine(p?.lineId ?? row.lineid),
      destination:
        destination && (destination.fr || destination.nl)
          ? { fr: destination.fr ?? destination.nl, nl: destination.nl ?? destination.fr }
          : null,
      at: Date.parse(p?.expectedArrivalTime),
      message: p?.message && typeof p.message === 'object' ? p.message : null,
    };
  });
}

/**
 * A row that only carries a status, no vehicle: after the last departure STIB
 * repeats "Last departure" (or "End of service") stamped with the time of the
 * answer, twice, the second entry without destination (real answers of
 * 2026-10-14 at 03:00).
 */
export function isStatusRow(passages) {
  return (
    passages.length > 1 &&
    passages.some((p) => p.message) &&
    new Set(passages.map((p) => p.at)).size === 1
  );
}

/**
 * The reading of one point: every upcoming departure of the wanted lines,
 * sorted by expected time, and the statuses (end of service...). A departure
 * stays listed `DEPARTED_GRACE` after its time (STIB says "now" until then).
 */
export function stopReading(rows, { pointId, now, lines = [] }) {
  const departures = [];
  const statuses = new Map();
  for (const row of rows ?? []) {
    if (String(row.pointid) !== pointId) {
      continue;
    }
    if (lines.length > 0 && !lines.includes(normalizeLine(row.lineid))) {
      continue;
    }
    const passages = passagesOf(row);
    const statusOnly = isStatusRow(passages);
    for (const p of passages) {
      if (p.message && (statusOnly || !p.destination)) {
        const kind = messageKind(p.message);
        statuses.set(`${p.line}|${kind}`, { line: p.line, kind, text: p.message });
      }
      if (statusOnly || !p.destination || !Number.isFinite(p.at) || p.at < now - DEPARTED_GRACE) {
        continue;
      }
      departures.push({
        line: p.line,
        destination: p.destination,
        expectedAt: new Date(p.at).toISOString(),
        /** Minutes until the expected passage, never negative. */
        minutes: Math.max(0, Math.round((p.at - now) / 60_000)),
        message: p.message,
        last: p.message ? messageKind(p.message) === 'last' : false,
      });
    }
  }
  departures.sort(
    (a, b) => Date.parse(a.expectedAt) - Date.parse(b.expectedAt) || compareLines(a.line, b.line),
  );
  return {
    pointId,
    readAt: new Date(now).toISOString(),
    departures,
    statuses: [...statuses.values()].sort((a, b) => compareLines(a.line, b.line)),
  };
}

/**
 * A reading seen at a later instant: the countdowns follow the clock and the
 * departed vehicles leave, so a widget or an action stays right between two
 * reads (20 minutes apart without a subscription key).
 */
export function aged(reading, now) {
  if (!reading) {
    return reading;
  }
  const departures = reading.departures
    .filter((d) => Date.parse(d.expectedAt) >= now - DEPARTED_GRACE)
    .map((d) => ({
      ...d,
      minutes: Math.max(0, Math.round((Date.parse(d.expectedAt) - now) / 60_000)),
    }));
  return { ...reading, departures };
}

/** "92 → Schaerbeek Gare", "+ · Dernier passage", "+ · 4 min" on demand. */
export function departureLine(d, language = 'fr', { minutes = false } = {}) {
  const parts = [`${d.line} → ${prettyName(localized(d.destination, language))}`];
  if (d.message) {
    parts.push(localized(d.message, language));
  }
  if (minutes) {
    parts.push(`${d.minutes} min`);
  }
  return parts.join(' · ');
}

/** The STIB messages of a point ("6: Dernier passage"), or null. */
export function statusText(reading, language = 'fr') {
  const texts = new Set();
  for (const s of reading?.statuses ?? []) {
    texts.add(`${s.line}: ${localized(s.text, language)}`);
  }
  for (const d of reading?.departures ?? []) {
    if (d.message) {
      texts.add(`${d.line}: ${localized(d.message, language)}`);
    }
  }
  return texts.size > 0 ? [...texts].join(' · ') : null;
}

/** One travellers information notice. */
export function noticeOf(raw) {
  const content = parseJson(raw?.content, []);
  const blocks = (Array.isArray(content) ? content : []).flatMap((c) =>
    Array.isArray(c?.text) ? c.text : [],
  );
  const text = {};
  for (const language of ['fr', 'nl', 'en']) {
    const parts = blocks.map((b) => String(b?.[language] ?? '').trim()).filter(Boolean);
    if (parts.length > 0) {
      text[language] = parts.join(' ');
    }
  }
  const ids = (value) =>
    (Array.isArray(parseJson(value, [])) ? parseJson(value, []) : [])
      .map((x) => String(x?.id ?? ''))
      .filter(Boolean);
  return {
    id: String(raw?.id ?? ''),
    text,
    lines: [...new Set(ids(raw?.lines).map(normalizeLine))].sort(compareLines),
    points: ids(raw?.points),
    priority: Number.isFinite(Number(raw?.priority)) ? Number(raw.priority) : null,
  };
}

/** The text of a notice in a language (English as a last resort). */
export const noticeText = (notice, language = 'fr') =>
  notice.text[language] ?? notice.text.fr ?? notice.text.nl ?? notice.text.en ?? '';

/**
 * The notices of the network, each marked when it concerns a watched point
 * (`atMyStop`) or a line serving one (`onMyLine`). `mine` lists those first.
 */
export function networkReading(rows, { now, points = [], lines = [] }) {
  const pointSet = new Set(points);
  const lineSet = new Set(lines.map(normalizeLine));
  const items = (rows ?? [])
    .map(noticeOf)
    .filter((n) => n.id && noticeText(n))
    .map((n) => {
      const atMyStop = n.points.some((p) => pointSet.has(p));
      const onMyLine = n.lines.some((l) => lineSet.has(l));
      return { ...n, atMyStop, onMyLine, mine: atMyStop || onMyLine };
    });
  const mine = items.filter((n) => n.atMyStop).concat(items.filter((n) => !n.atMyStop && n.mine));
  return { readAt: new Date(now).toISOString(), items, total: items.length, mine };
}

/** "92 · Travaux. Du 29/9..." — the notice with its lines, for a text feature. */
export function noticeLine(notice, language = 'fr') {
  const text = noticeText(notice, language);
  return notice.lines.length > 0 ? `${notice.lines.join(', ')} · ${text}` : text;
}
