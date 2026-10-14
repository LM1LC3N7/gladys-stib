// -----------------------------------------------------------------------------
// Transitions -> scene events: nothing on the first reading, one event per
// transition, every threshold crossed in one step.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCENE_TRIGGERS } from '../src/constants.js';
import { networkReading, stopReading } from '../src/model.js';
import { matchDepartures, networkEvents, stopEvents } from '../src/triggers.js';
import { FIXTURE_NOW, fixture, waitingRows } from './helpers/fakeFetch.js';

const STOP = 'ext:stib:stop:8321';
const read = (now, rows = waitingRows()) => stopReading(rows, { pointId: '8321', now });

test('the first reading fires nothing', () => {
  assert.deepEqual(stopEvents(STOP, undefined, read(FIXTURE_NOW)), []);
  const network = networkReading(fixture('travellers-information.json').results, {
    now: FIXTURE_NOW,
  });
  assert.deepEqual(networkEvents(undefined, network), []);
});

test('the same vehicle is matched across readings despite a drifting prediction', () => {
  const before = read(FIXTURE_NOW);
  // 90 s later every prediction moved by 40 s; the first metro is still there.
  const after = read(FIXTURE_NOW + 90_000, waitingRows({ shiftSeconds: 40 }));
  const matches = matchDepartures(before.departures, after.departures);
  assert.equal(matches.size, 4);
  for (const [current, previous] of matches) {
    assert.equal(current.line, previous.line);
    assert.equal(Date.parse(current.expectedAt) - Date.parse(previous.expectedAt), 40_000);
  }
});

test('a vehicle crossing thresholds fires each of them once', () => {
  const before = read(FIXTURE_NOW);
  // 3 minutes later: the line 6 metro (4 min) is at 1 min, the next 2 (8 min)
  // at 5, the next 6 (12 min) at 9.
  const after = read(FIXTURE_NOW + 3 * 60_000);
  const events = stopEvents(STOP, before, after);
  const approaching = events
    .filter((e) => e.key === SCENE_TRIGGERS.APPROACHING)
    .map((e) => `${e.data.line}:${e.data.threshold}`);
  assert.deepEqual(approaching, ['6:1', '6:2', '6:3', '2:5', '6:10']);
  const first = events[0].data;
  assert.equal(first.stop, STOP);
  assert.equal(first.destination, 'Roi Baudouin');
  assert.equal(first.minutes, 1);
  // The same reading again: no transition, no event.
  assert.deepEqual(stopEvents(STOP, after, read(FIXTURE_NOW + 3 * 60_000)), []);
});

test('the last departure is announced once per line and direction', () => {
  const announced = new Set();
  const last = (p) => {
    if (p.lineId === '2' && p.expectedArrivalTime.startsWith('2026-10-14T06:07')) {
      p.message = { fr: 'Dernier passage', nl: 'Laatste vertrek', en: 'Last departure' };
    }
  };
  const before = read(FIXTURE_NOW);
  const flagged = read(FIXTURE_NOW + 30_000, waitingRows({ edit: last }));
  const events = stopEvents(STOP, before, flagged, { announced, language: 'nl' });
  assert.deepEqual(
    events
      .filter((e) => e.key === SCENE_TRIGGERS.LAST)
      .map((e) => [e.data.line, e.data.destination]),
    [['2', 'Simonis']],
  );
  // The flag disappears then comes back: still one event.
  const plain = read(FIXTURE_NOW + 60_000);
  stopEvents(STOP, flagged, plain, { announced });
  const again = stopEvents(STOP, plain, read(FIXTURE_NOW + 90_000, waitingRows({ edit: last })), {
    announced,
  });
  assert.deepEqual(
    again.filter((e) => e.key === SCENE_TRIGGERS.LAST),
    [],
  );
  // Already flagged on the first reading: remembered, never announced.
  const fresh = new Set();
  stopEvents(STOP, undefined, flagged, { announced: fresh });
  assert.deepEqual(stopEvents(STOP, flagged, flagged, { announced: fresh }), []);
});

test('notices published and withdrawn fire one event per line', () => {
  const rows = fixture('travellers-information.json').results;
  const scope = { now: FIXTURE_NOW, points: ['8321'], lines: ['2', '6'] };
  const before = networkReading(
    rows.filter((r) => r.id !== '23876899'),
    scope,
  );
  const after = networkReading(
    rows.filter((r) => r.id !== '30616323'),
    scope,
  );
  const events = networkEvents(before, after, { language: 'fr' });
  assert.deepEqual(
    events.map((e) => [e.key, e.data.line, e.data.scope]),
    [
      [SCENE_TRIGGERS.DISRUPTED, '2', 'mine'],
      [SCENE_TRIGGERS.DISRUPTED, '6', 'mine'],
      [SCENE_TRIGGERS.CLEARED, '13', 'other'],
    ],
  );
  assert.match(events[0].data.notice, /^Interruption trams 4 10/);
  assert.equal(events[0].data.lines, '2, 6');
  assert.equal(events[0].data.notice_id, '23876899');
  assert.equal(typeof events[0].data.stops, 'number');
});

test('a notice without lines fires once with line null, and a flood is capped', () => {
  const rows = fixture('travellers-information.json').results;
  const none = networkReading([], { now: FIXTURE_NOW });
  const all = networkReading(rows, { now: FIXTURE_NOW, points: ['6314'] });
  const events = networkEvents(none, all);
  const tram97 = events.find((e) => e.data.notice_id === '26204957');
  assert.equal(tram97.data.line, null);
  assert.equal(tram97.data.scope, 'mine');
  const many = Array.from({ length: 60 }, (_, i) => ({
    id: String(i),
    content: JSON.stringify([{ text: [{ fr: `Avis ${i}` }] }]),
    lines: '[{"id":"1"}]',
    points: '[]',
  }));
  assert.equal(networkEvents(none, networkReading(many, { now: FIXTURE_NOW })).length, 40);
});
