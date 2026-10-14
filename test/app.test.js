// -----------------------------------------------------------------------------
// The integration against the SDK's fake Gladys and a fake gateway.
// -----------------------------------------------------------------------------

import { afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { StibApp } from '../src/app.js';
import { ACTIONS, KEY_HEADER, SCENE_ACTIONS, SCENE_TRIGGERS, WIDGETS } from '../src/constants.js';
import {
  FIXTURE_NOW,
  fixture,
  gatewayState,
  installFetch,
  installGateway,
  json,
  waitingRows,
} from './helpers/fakeFetch.js';
import { createFakeTimers } from './helpers/fakeTimers.js';

const quiet = {
  info() {},
  warn: (...a) => process.env.DEBUG_TEST && console.error(...a),
  error() {},
  debug() {},
};

let fake;
afterEach(() => fake?.restore());

const LOUISE = 'ext:stib:stop:8321';
const BUS = 'ext:stib:stop:3518B';
const NETWORK = 'ext:stib:network';
const KEY = { api_key: 'secret-key-123' };

async function setup({ config = {}, houses = [], devices = [] } = {}) {
  const state = gatewayState();
  fake = installGateway(state);
  const gladys = createFakeGladys({ selector: 'stib', config, houses, devices });
  const timers = createFakeTimers();
  const clock = { now: FIXTURE_NOW };
  const app = new StibApp({ gladys, logger: quiet, now: () => clock.now, timers });
  gladys.onScanRequest(() => app.publishDevices());
  gladys.onDeviceCreated((device) => app.deviceCreated(device));
  gladys.onSceneAction(SCENE_ACTIONS.NEXT_DEPARTURES, (f) => app.getNextDepartures(f));
  for (const key of Object.values(WIDGETS)) {
    gladys.onWidgetGet(key, (request) => app.getWidget(key, request));
  }
  gladys.onAction(ACTIONS.TEST, () => app.testConnection());
  gladys.onAction(ACTIONS.SEARCH, (fields) => app.searchStops(fields));
  // Resynchronizes gladys.devices from the fake host API.
  await gladys.connect();
  return { app, gladys, timers, clock, state };
}

/** A stop device as Gladys hands it back once created. */
function createdStop(pointId = '8321', { lines = '', served = '2|6', name } = {}) {
  return {
    external_id: `ext:stib:stop:${pointId}`,
    name: name ?? `STIB stop ${pointId}`,
    params: [
      { name: 'point_id', value: pointId },
      { name: 'stop_name', value: 'Louise' },
      { name: 'lines', value: lines },
      { name: 'served_lines', value: served },
      { name: 'max_departures', value: '3' },
    ],
  };
}

const calls = (pattern) => fake.calls.filter((c) => pattern.test(c.url));

test('discovery offers the typed stops, the platforms of the nearest stops and the network', async () => {
  const config = { stops: 'Porte de Namur@54:Bus du soir, Atlantis', nearby_stops: 1 };
  const { app, gladys } = await setup({
    config,
    houses: [{ id: 1, name: 'Home', selector: 'home', latitude: 50.8355, longitude: 4.357 }],
  });
  await app.start(config);
  const devices = gladys.fake.discoveredDevices;
  assert.deepEqual(
    devices.map((d) => d.name),
    [
      'Bus du soir · 54 → Forest (Bervoets)',
      'Bus du soir · 54 → Trone',
      'STIB Louise · 8 → Louise · 92 → Schaerbeek Gare · 93 → Stade',
      'STIB Louise · 2 → Simonis · 6 → Roi Baudouin',
      'STIB Louise · 2, 6 → Elisabeth',
      'STIB Louise · 8 → Roodebeek · 92 → Fort-Jaco · 93 → Legrand',
      'STIB network',
    ],
  );
  const bus = devices[0];
  assert.equal(bus.external_id, BUS);
  assert.equal(bus.params.find((p) => p.name === 'lines').value, '54');
  assert.equal(bus.params.find((p) => p.name === 'served_lines').value, '54|71');
  assert.equal(bus.features.length, 1 + 3 * 2 + 1);
  assert.ok(devices[3].params.some((p) => p.name === 'distance_km'));
  // Paged directory, then nothing else: no device created yet.
  assert.equal(calls(/StopDetails/).length, 1);
  assert.equal(calls(/stopsByLine/).length, 1);
  assert.equal(calls(/WaitingTimes/).length, 0);
  assert.match(gladys.fake.connectionStatus.message.fr, /Aucun arrêt/);
});

test('the stop list is read page by page', async () => {
  const { app, state } = await setup();
  app.client.pageSize = 30;
  const directory = await app.directory();
  assert.equal(directory.points.length, state.stops.length);
  assert.deepEqual(
    calls(/StopDetails/).map((c) => c.params.offset ?? '0'),
    ['0', '30', '60'],
  );
});

test('the created stops are read in one request, then on the timer', async () => {
  const { app, gladys, timers, clock, state } = await setup({
    config: KEY,
    devices: [
      createdStop('8321'),
      createdStop('3518B', { served: '54|71' }),
      { external_id: NETWORK, name: 'STIB network' },
    ],
  });
  await app.start(KEY);
  const [request] = calls(/WaitingTimes/);
  assert.equal(request.params.where, 'pointid in ("8321","3518B")');
  assert.equal(request.init.headers[KEY_HEADER], 'secret-key-123');
  assert.match(request.url, /api-management-opendata-production/);
  assert.equal(gladys.fake.lastState(`${LOUISE}:next_minutes`), 2);
  assert.equal(gladys.fake.lastState(`${LOUISE}:dep1_text`), '2 → Simonis');
  assert.equal(gladys.fake.lastState(`${LOUISE}:dep2_minutes`), 4);
  assert.equal(gladys.fake.lastState(`${LOUISE}:message`), '—');
  assert.equal(gladys.fake.lastState(`${BUS}:dep1_text`), '71 → Delta');
  assert.equal(gladys.fake.lastState(`${NETWORK}:notices`), 13);
  assert.equal(gladys.fake.lastState(`${NETWORK}:my_notices`), 6);
  assert.match(gladys.fake.lastState(`${NETWORK}:notice`), /^6 · Made in Asia/);
  assert.match(gladys.fake.connectionStatus.message.en, /Watching 2 stops, refreshed every 30 s/);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'nothing on the first reading');
  assert.equal(timers.intervals()[0].ms, 30_000);
  // 3 minutes later the line 6 metro arrives in 1 minute.
  clock.now = FIXTURE_NOW + 3 * 60_000;
  state.waiting = waitingRows();
  await timers.runIntervals();
  const approaching = gladys.fake.sceneEvents.filter((e) => e.key === SCENE_TRIGGERS.APPROACHING);
  assert.ok(approaching.some((e) => e.data.stop === LOUISE && e.data.threshold === '1'));
  assert.equal(calls(/WaitingTimes/).length, 2);
  // The notices are not read again before 5 minutes.
  assert.equal(calls(/TravellersInformation/).length, 1);
  app.stop();
});

test('without a key: the anonymous gateway, a 20-minute pace, the status says why', async () => {
  const { app, gladys, timers } = await setup({
    devices: [createdStop('8321'), { external_id: NETWORK, name: 'STIB network' }],
  });
  await app.start({ poll_frequency: 30 });
  const [request] = calls(/WaitingTimes/);
  assert.match(request.url, /api-management-discovery-production/);
  assert.equal(request.init.headers[KEY_HEADER], undefined);
  assert.equal(timers.intervals()[0].ms, 20 * 60_000);
  assert.match(gladys.fake.connectionStatus.message.en, /without a subscription key.*20 min/);
  assert.match(gladys.fake.connectionStatus.message.fr, /quota anonyme/);
});

test('a new notice for my line fires line_disrupted, a withdrawn one disruption_cleared', async () => {
  const { app, gladys, timers, state, clock } = await setup({
    config: KEY,
    devices: [createdStop('8321'), { external_id: NETWORK, name: 'STIB network' }],
  });
  const all = fixture('travellers-information.json').results;
  state.notices = all.filter((n) => n.id !== '23876899');
  await app.start(KEY);
  state.notices = all.filter((n) => n.id !== '30616323');
  clock.now = FIXTURE_NOW + 6 * 60_000;
  await timers.runIntervals();
  const network = gladys.fake.sceneEvents.filter((e) => e.key !== SCENE_TRIGGERS.APPROACHING);
  assert.deepEqual(
    network.map((e) => [e.key, e.data.line, e.data.scope]),
    [
      [SCENE_TRIGGERS.DISRUPTED, '2', 'mine'],
      [SCENE_TRIGGERS.DISRUPTED, '6', 'mine'],
      [SCENE_TRIGGERS.CLEARED, '13', 'other'],
    ],
  );
  app.stop();
});

test('the night: STIB statuses, no departure, no event', async () => {
  const { app, gladys, state, clock } = await setup({
    config: KEY,
    devices: [createdStop('8321')],
  });
  state.waiting = fixture('waiting-night.json').results;
  clock.now = Date.parse('2026-10-14T03:00:10+02:00');
  await app.start(KEY);
  assert.equal(gladys.fake.lastState(`${LOUISE}:dep1_text`), '—');
  assert.equal(gladys.fake.lastState(`${LOUISE}:message`), '6: Dernier passage');
  assert.equal(gladys.fake.lastState(`${LOUISE}:next_minutes`), undefined);
  const widget = (
    await gladys.fake.widgetGet(WIDGETS.DEPARTURES, {
      settings: { device: LOUISE },
      language: 'fr',
    })
  ).data.content;
  assert.equal(widget.components[1].text, '6: Dernier passage');
  assert.deepEqual(validateWidgetContent(widget), []);
});

test('the scene action answers from the last reading, reads again when it is old', async () => {
  const { app, gladys, clock } = await setup({
    config: KEY,
    devices: [createdStop('6361', { lines: '92', served: '8|92|93' })],
  });
  await app.start(KEY);
  const action = await gladys.fake.sceneAction(SCENE_ACTIONS.NEXT_DEPARTURES, {
    device: 'ext:stib:stop:6361',
  });
  assert.equal(action.success, true);
  assert.deepEqual(action.data.outputs, {
    stop: 'Louise',
    count: 2,
    list: '92 → Schaerbeek Gare · 3 min\n92 → Schaerbeek Gare · 13 min',
    next_line: '92',
    next_destination: 'Schaerbeek Gare',
    next_minutes: 3,
    next_time: '2026-10-14T06:03:00.660Z',
    message: null,
  });
  assert.equal(calls(/WaitingTimes/).length, 1);
  clock.now = FIXTURE_NOW + 60_000;
  const later = await gladys.fake.sceneAction(SCENE_ACTIONS.NEXT_DEPARTURES, {
    device: 'ext:stib:stop:6361',
  });
  assert.equal(later.data.outputs.next_minutes, 2);
  assert.equal(calls(/WaitingTimes/).length, 2);
  assert.equal(gladys.fake.sceneEvents.length, 0, 'an action never fires an event');
  const wrong = await gladys.fake.sceneAction(SCENE_ACTIONS.NEXT_DEPARTURES, { device: NETWORK });
  assert.equal(wrong.success, false);
});

test('the widgets fit the vocabulary', async () => {
  const { app, gladys, clock } = await setup({
    config: KEY,
    devices: [
      createdStop('8321', { name: 'Métro' }),
      { external_id: NETWORK, name: 'STIB network' },
    ],
  });
  await app.start(KEY);
  const departures = (
    await gladys.fake.widgetGet(WIDGETS.DEPARTURES, {
      settings: { device: LOUISE },
      language: 'fr',
    })
  ).data.content;
  assert.deepEqual(validateWidgetContent(departures), []);
  assert.equal(departures.components[0].text, 'Métro');
  const status = departures.components.find((c) => c.type === 'status');
  assert.equal(status.items.length, 4);
  assert.equal(status.items[0].label, '2 → Simonis');
  assert.equal(status.items[0].value, '08:01 · dans 2 min');
  assert.match(departures.components.at(-1).text, /Mis à jour 08:00 · données ouvertes STIB-MIVB/);
  const network = (await gladys.fake.widgetGet(WIDGETS.NETWORK, { settings: {}, language: 'en' }))
    .data.content;
  assert.deepEqual(validateWidgetContent(network), []);
  const cards = network.components.find((c) => c.type === 'card-list');
  assert.equal(cards.items.length, 3);
  assert.equal(cards.items[0].badge.text, 'My stop');
  assert.equal(cards.items[0].subtitle, 'Line 6');
  const bus = (
    await gladys.fake.widgetGet(WIDGETS.NETWORK, { settings: { lines: '54' }, language: 'fr' })
  ).data.content;
  assert.equal(bus.components.find((c) => c.type === 'card-list').items.length, 2);
  // Two minutes later, before the next read: the countdowns follow the clock.
  clock.now = FIXTURE_NOW + 2 * 60_000;
  const later = (
    await gladys.fake.widgetGet(WIDGETS.DEPARTURES, {
      settings: { device: LOUISE },
      language: 'en',
    })
  ).data.content;
  const items = later.components.find((c) => c.type === 'status').items;
  assert.deepEqual(
    items.map((i) => i.value),
    ['08:01 · now', '08:04 · in 2 min', '08:07 · in 6 min', '08:11 · in 10 min'],
  );
  const none = (await gladys.fake.widgetGet(WIDGETS.DEPARTURES, { settings: {} })).data.content;
  assert.match(none.components[0].text.fr, /Choisissez un arrêt/);
});

test('the buttons', async () => {
  const config = { stops: 'Louise, Atlantis' };
  const { app, gladys } = await setup({ config });
  await app.start(config);
  const tested = await gladys.fake.action(ACTIONS.TEST);
  assert.match(tested.data.message.fr, /12 arrêts \(81 quais\) connus, 0 suivi/);
  assert.match(tested.data.message.fr, /Pas de clé d'abonnement/);
  assert.match(tested.data.message.fr, /Arrêt inconnu « Atlantis »/);
  const search = await gladys.fake.action(ACTIONS.SEARCH, { query: 'louiza' });
  assert.match(search.data.message.en, /^Louise: 6361 \(8 → Louise · 92 → Schaerbeek Gare/);
  assert.match(search.data.message.en, /8322 \(2, 6 → Elisabeth\)/);
  assert.match(
    (await gladys.fake.action(ACTIONS.SEARCH, { query: 'zzz' })).data.message.en,
    /Unknown stop/,
  );
  // The directory is read once, whatever the buttons.
  assert.equal(calls(/StopDetails/).length, 1);
});

test('the devices created together are read together, at once', async () => {
  const { app, gladys, timers } = await setup({ devices: [] });
  await app.start({});
  await gladys.fake.deviceCreated(createdStop('8322', { served: '2|6' }));
  await gladys.fake.deviceCreated(createdStop('6314', { served: '8|92|93' }));
  assert.equal(calls(/WaitingTimes/).length, 0);
  await timers.runTimeouts();
  assert.equal(gladys.fake.lastState('ext:stib:stop:8322:dep1_text'), '2 → Elisabeth');
  assert.equal(gladys.fake.lastState('ext:stib:stop:6314:dep1_text'), '92 → Fort-Jaco');
  assert.deepEqual(
    calls(/WaitingTimes/).map((c) => c.params.where),
    ['pointid in ("8322","6314")'],
  );
});

test('the gateway down or over quota: the status says so, the loop keeps running', async () => {
  const { app, gladys, timers } = await setup({ config: KEY, devices: [createdStop('8321')] });
  fake.restore();
  fake = installFetch([[/./, () => json({ statusCode: 429, message: 'Rate limit' }, 429)]]);
  await app.start(KEY);
  assert.equal(gladys.fake.connectionStatus.connected, false);
  assert.match(gladys.fake.connectionStatus.message.en, /unreachable: HTTP 429 .*quota exceeded/);
  assert.doesNotMatch(gladys.fake.connectionStatus.message.en, /secret-key-123/);
  assert.equal(timers.intervals().length, 1);
});
