// -----------------------------------------------------------------------------
// The stop directory: StopDetails (names, coordinates) joined with
// stopsByLine (the lines and directions serving each point). Resolves what
// the user typed and finds the stops near a house. Pure.
//
// A "point" is one platform in one direction (8321: metro 2 and 6 towards the
// city at LOUISE); a "stop" is the group of the points sharing a name.
// -----------------------------------------------------------------------------

import { POINT_ID_PATTERN } from './constants.js';
import { compareLines, fold, localized, parseJson, prettyName } from './text.js';

/** A point of StopDetails, normalized. */
export function pointOf(raw) {
  const id = String(raw.id ?? '');
  const name = parseJson(raw.name, {});
  const gps = parseJson(raw.gpscoordinates, {});
  return {
    id,
    name: { fr: name.fr ?? name.nl ?? id, nl: name.nl ?? name.fr ?? id },
    latitude: Number(gps.latitude ?? Number.NaN),
    longitude: Number(gps.longitude ?? Number.NaN),
  };
}

/** stopsByLine -> point id -> [{ line, direction, destination: { fr, nl }, order }]. */
export function lineMapOf(rows) {
  const map = new Map();
  for (const row of rows ?? []) {
    const destination = parseJson(row.destination, {});
    for (const point of parseJson(row.points, [])) {
      const id = String(point.id);
      if (!map.has(id)) {
        map.set(id, []);
      }
      map.get(id).push({
        line: String(row.lineid),
        direction: row.direction ?? null,
        destination: { fr: destination.fr ?? '', nl: destination.nl ?? destination.fr ?? '' },
        order: Number(point.order) || 0,
      });
    }
  }
  for (const lines of map.values()) {
    lines.sort((a, b) => compareLines(a.line, b.line));
  }
  return map;
}

/** The directory: every point with its lines, indexed by id. */
export function buildDirectory(stopRows, lineRows) {
  const lineMap = lineMapOf(lineRows);
  const points = (stopRows ?? [])
    .map(pointOf)
    .filter((p) => p.id)
    .map((p) => ({ ...p, lines: lineMap.get(p.id) ?? [] }));
  return { points, byId: new Map(points.map((p) => [p.id, p])), hasLines: lineMap.size > 0 };
}

/** The points a stop really offers: the served ones (some ids are retired). */
function served(directory, points) {
  if (!directory.hasLines) {
    return points;
  }
  return points.filter((p) => p.lines.length > 0);
}

/** The stops: the points grouped by name. */
export function stopsOf(directory) {
  const groups = new Map();
  for (const point of directory.points) {
    const key = fold(point.name.fr);
    if (!groups.has(key)) {
      groups.set(key, { name: point.name, points: [] });
    }
    groups.get(key).points.push(point);
  }
  return [...groups.values()]
    .map((g) => ({ ...g, points: served(directory, g.points) }))
    .filter((g) => g.points.length > 0);
}

/**
 * The stop matching a query: a point id (one point), an exact name in French
 * or Dutch, else the shortest name containing the query. Undefined when
 * nothing matches. { name, points }
 */
export function findStop(directory, query) {
  const text = String(query ?? '').trim();
  if (!text) {
    return undefined;
  }
  const id = text.toUpperCase();
  if (POINT_ID_PATTERN.test(id)) {
    const point = directory.byId.get(id);
    return point ? { name: point.name, points: [point] } : undefined;
  }
  const wanted = fold(text);
  const stops = stopsOf(directory);
  const names = (s) => [fold(s.name.fr), fold(s.name.nl)];
  const exact = stops.find((s) => names(s).includes(wanted));
  if (exact) {
    return exact;
  }
  return stops
    .filter((s) => names(s).some((n) => n.includes(wanted)))
    .sort((a, b) => a.name.fr.length - b.name.fr.length)[0];
}

/** The stops whose name contains the query (for the "Search stops" button). */
export function searchStops(directory, query, max = 10) {
  const wanted = fold(query);
  if (!wanted) {
    return [];
  }
  return stopsOf(directory)
    .filter((s) => [fold(s.name.fr), fold(s.name.nl)].some((n) => n.includes(wanted)))
    .sort((a, b) => a.name.fr.length - b.name.fr.length || a.name.fr.localeCompare(b.name.fr))
    .slice(0, max);
}

/** Great-circle distance in km. */
export function distanceKm(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

const located = (p) => Number.isFinite(p?.latitude) && Number.isFinite(p?.longitude);

/** The `count` stops closest to a point (distance of their closest platform). */
export function nearestStops(directory, home, count) {
  if (!located(home)) {
    return [];
  }
  return stopsOf(directory)
    .map((s) => ({
      ...s,
      distanceKm: Math.min(...s.points.filter(located).map((p) => distanceKm(home, p))),
    }))
    .filter((s) => Number.isFinite(s.distanceKm))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, count);
}

/**
 * What a point serves, for a name: "2 → Simonis · 6 → Roi Baudouin", or
 * "2, 6 → Elisabeth" when the lines share a destination. Only the `lines`
 * kept by a filter when there is one.
 */
export function describePoint(point, language = 'fr', lines = []) {
  const kept = point.lines.filter((l) => lines.length === 0 || lines.includes(l.line));
  const byDestination = new Map();
  for (const l of kept) {
    const destination = prettyName(localized(l.destination, language));
    if (!byDestination.has(destination)) {
      byDestination.set(destination, []);
    }
    if (!byDestination.get(destination).includes(l.line)) {
      byDestination.get(destination).push(l.line);
    }
  }
  return [...byDestination.entries()]
    .map(([destination, ls]) => `${ls.join(', ')} → ${destination}`)
    .join(' · ');
}
