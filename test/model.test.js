// -----------------------------------------------------------------------------
// The pure modules on the fixtures: waiting times, notices, the directory,
// the configuration grammar.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, pacingOf, parseStopEntry } from '../src/config.js';
import {
  departureLine,
  isStatusRow,
  messageKind,
  networkReading,
  noticeLine,
  noticeOf,
  passagesOf,
  statusText,
  stopReading,
} from '../src/model.js';
import {
  buildDirectory,
  describePoint,
  findStop,
  nearestStops,
  searchStops,
  stopsOf,
} from '../src/stops.js';
import { fold, prettyName } from '../src/text.js';
import { FIXTURE_NOW, fixture, waitingRows } from './helpers/fakeFetch.js';

const directory = () =>
  buildDirectory(fixture('stop-details.json').results, fixture('stops-by-line.json').results);
/** The instant of the night fixture (waiting-night.json, 03:00 in Brussels). */
const NIGHT = Date.parse('2026-10-14T03:00:10+02:00');

test('the waiting times of a point become departures sorted by time', () => {
  const reading = stopReading(waitingRows(), { pointId: '8321', now: FIXTURE_NOW });
  assert.deepEqual(
    reading.departures.map((d) => departureLine(d, 'fr', { minutes: true })),
    [
      '2 → Simonis · 2 min',
      '6 → Roi Baudouin · 4 min',
      '2 → Simonis · 8 min',
      '6 → Roi Baudouin · 12 min',
    ],
  );
  const [first] = reading.departures;
  assert.equal(first.line, '2');
  assert.equal(first.expectedAt, '2026-10-14T06:01:35.515Z');
  assert.equal(first.last, false);
  assert.deepEqual(reading.statuses, []);
  assert.equal(statusText(reading), null);
});

test('the line filter, the Dutch names and the departed vehicles', () => {
  const rows = waitingRows();
  const tram = stopReading(rows, { pointId: '6361', now: FIXTURE_NOW, lines: ['92'] });
  assert.deepEqual(
    tram.departures.map((d) => departureLine(d, 'nl')),
    ['92 → Schaarbeek Station', '92 → Schaarbeek Station'],
  );
  // Five minutes later the first metro (08:01:35) is gone, the 08:04:10 one is "now".
  const later = stopReading(rows, { pointId: '8321', now: FIXTURE_NOW + 4 * 60_000 + 20_000 });
  assert.equal(later.departures.length, 3);
  assert.equal(later.departures[0].minutes, 0);
  assert.equal(stopReading(rows, { pointId: '9999', now: FIXTURE_NOW }).departures.length, 0);
});

test('a real last departure is flagged with the STIB message', () => {
  const rows = waitingRows({
    edit: (p, row) => {
      if (row.pointid === '3518B' && row.lineid === '71') {
        p.message = { fr: 'Dernier passage', nl: 'Laatste vertrek', en: 'Last departure' };
      }
    },
  });
  const reading = stopReading(rows, { pointId: '3518B', now: FIXTURE_NOW });
  const delta = reading.departures.find((d) => d.line === '71');
  assert.equal(delta.last, true);
  assert.equal(departureLine(delta, 'fr'), '71 → Delta · Dernier passage');
  assert.equal(statusText(reading, 'nl'), '71: Laatste vertrek');
});

test('the night markers are statuses, not departures (real answer of 03:00)', () => {
  const rows = fixture('waiting-night.json').results;
  const passages = passagesOf(rows[0]);
  assert.equal(passages.length, 2);
  assert.equal(passages[1].destination, null);
  assert.ok(isStatusRow(passages));
  const reading = stopReading(rows, { pointId: '8321', now: NIGHT });
  assert.deepEqual(reading.departures, []);
  assert.equal(reading.statuses[0].kind, 'last');
  assert.equal(statusText(reading), '6: Dernier passage');
  assert.equal(messageKind({ de: 'Dienstschluss', fr: 'Service terminé' }), 'ended');
  assert.equal(messageKind({ en: 'Diverted' }), 'info');
  // A broken passingtimes string is no departure, not a crash.
  assert.deepEqual(passagesOf({ pointid: '1', lineid: '1', passingtimes: '[{' }), []);
});

test('the travellers information notices, mine first', () => {
  const rows = fixture('travellers-information.json').results;
  const notice = noticeOf(rows.find((r) => r.id === '23876899'));
  assert.deepEqual(notice.lines, ['2', '6']);
  assert.ok(notice.points.includes('8321'));
  assert.match(notice.text.en, /^Interruption tram 4 10/);
  const reading = networkReading(rows, {
    now: FIXTURE_NOW,
    points: ['8321', '6314'],
    lines: ['2', '6', '92'],
  });
  assert.equal(reading.total, 13);
  assert.equal(reading.mine.length, 4);
  assert.ok(reading.mine.every((n) => n.atMyStop));
  const tram97 = reading.mine.find((n) => n.id === '26204957');
  assert.deepEqual(tram97.lines, [], 'a notice without lines, matched by its stops');
  assert.match(noticeLine(reading.mine[0], 'nl'), /^6 · Made in Asia/);
  const onlyLines = networkReading(rows, { now: FIXTURE_NOW, points: [], lines: ['54'] });
  assert.deepEqual(
    onlyLines.mine.map((n) => n.id),
    ['26995571', '26995570'],
  );
});

test('the stop directory: names, ids, platforms, nearest stops', () => {
  const dir = directory();
  assert.equal(dir.points.length, 81);
  assert.equal(fold("Gare de l'Ouest"), 'gare de l ouest');
  assert.equal(prettyName("GARE DE L'OUEST"), "Gare de l'Ouest");
  assert.equal(prettyName('FOREST (BERVOETS)'), 'Forest (Bervoets)');
  const louise = findStop(dir, 'louiza');
  assert.equal(louise.name.fr, 'LOUISE');
  // 1726, 3624B and 1087 are LOUISE ids no line serves: left out.
  assert.deepEqual(
    louise.points.map((p) => p.id),
    ['6361', '8321', '8322', '6314'],
  );
  assert.deepEqual(
    findStop(dir, '3518b').points.map((p) => p.id),
    ['3518B'],
  );
  assert.equal(findStop(dir, 'Namur').name.fr, 'PORTE DE NAMUR', 'shortest containing');
  assert.equal(findStop(dir, 'Atlantis'), undefined);
  assert.equal(findStop(dir, '99999'), undefined);
  const metro = dir.byId.get('8321');
  assert.equal(describePoint(metro, 'fr'), '2 → Simonis · 6 → Roi Baudouin');
  assert.equal(describePoint(dir.byId.get('8322'), 'nl'), '2, 6 → Elisabeth');
  assert.equal(describePoint(dir.byId.get('6361'), 'fr', ['92']), '92 → Schaerbeek Gare');
  const near = nearestStops(dir, { latitude: 50.8355, longitude: 4.357 }, 2);
  assert.deepEqual(
    near.map((s) => s.name.fr),
    ['LOUISE', 'STEPHANIE'],
  );
  assert.ok(near[0].distanceKm < 0.2);
  assert.deepEqual(nearestStops(dir, { latitude: null, longitude: null }, 2), []);
  assert.deepEqual(
    searchStops(dir, 'porte').map((s) => s.name.fr),
    ['PORTE DE NAMUR'],
  );
  assert.equal(stopsOf(dir).length, 12);
});

test('the stops field grammar and the pacing', () => {
  assert.deepEqual(parseStopEntry(' Louise '), { query: 'Louise', lines: [], name: undefined });
  assert.deepEqual(parseStopEntry('Louise@2|t81:Métro du matin'), {
    query: 'Louise',
    lines: ['2', 'T81'],
    name: 'Métro du matin',
  });
  assert.equal(parseStopEntry(''), undefined);
  const config = normalizeConfig({ stops: 'Louise, ,3518B', poll_frequency: 5, language: 'de' });
  assert.equal(config.stops.length, 2);
  assert.equal(config.pollFrequency, 20);
  assert.equal(config.language, 'fr');
  assert.deepEqual(pacingOf(config), {
    anonymous: true,
    pollSeconds: 1200,
    disturbancesInterval: 2 * 60 * 60_000,
  });
  assert.deepEqual(pacingOf(normalizeConfig({ api_key: ' k ' })), {
    anonymous: false,
    pollSeconds: 30,
    disturbancesInterval: 5 * 60_000,
  });
});
