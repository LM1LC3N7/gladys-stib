// -----------------------------------------------------------------------------
// The manifest is the contract with Gladys and the store: these tests tie it
// to the code, so a key renamed on one side only fails here.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import {
  ACTIONS,
  DEPARTURE_THRESHOLDS,
  LANGUAGES,
  SCENE_ACTIONS,
  SCENE_TRIGGERS,
  WIDGETS,
} from '../src/constants.js';
import { DEFAULTS } from '../src/config.js';
import {
  FEATURE,
  buildNetworkDevice,
  buildStopDevice,
  ids,
  parseExternalId,
} from '../src/devices.js';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('gladys-assistant-integration.json'));
const index = read('index.js');

function* texts(node, path = '') {
  if (Array.isArray(node)) {
    for (const [i, item] of node.entries()) {
      yield* texts(item, `${path}[${i}]`);
    }
  } else if (node && typeof node === 'object') {
    if ('en' in node || 'fr' in node) {
      yield [path, node];
      return;
    }
    for (const [key, value] of Object.entries(node)) {
      yield* texts(value, `${path}.${key}`);
    }
  }
}

test('the store basics', () => {
  assert.equal(manifest.manifest_version, 1);
  assert.equal(manifest.type, 'device');
  assert.equal(manifest.location, true, 'the nearest stops need the house');
  assert.match(manifest.gladys_version, />=5\.1\.0/);
  assert.equal(manifest.docker_image, `ghcr.io/lm1lc3n7/gladys-stib:${manifest.version}`);
  assert.equal(manifest.version, JSON.parse(read('package.json')).version);
  for (const lang of ['en', 'fr']) {
    const length = manifest.description[lang].length;
    assert.ok(length >= 10 && length <= 100, `description.${lang}: ${length} characters`);
    assert.ok(read(`docs/${lang}.md`).length >= 300, `docs/${lang}.md is too short for the store`);
  }
  assert.match(manifest.description.en, /Unofficial/);
  assert.match(manifest.description.fr, /non officiel/);
});

test('every text is bilingual, every link is HTTPS', () => {
  for (const [path, text] of texts(manifest)) {
    assert.ok(text.en?.trim() && text.fr?.trim(), `${path} needs en and fr`);
  }
  for (const link of manifest.config_schema.flatMap((f) => f.links ?? [])) {
    assert.match(link.url, /^https:\/\//);
  }
});

test('the configuration matches the code; the key is a secret', () => {
  const fields = Object.fromEntries(manifest.config_schema.map((f) => [f.key, f]));
  for (const [key, value] of Object.entries(DEFAULTS)) {
    if (key === 'stops') {
      assert.equal(fields.stops.default, undefined);
    } else {
      assert.equal(fields[key].default, value, key);
    }
  }
  assert.equal(fields.api_key.type, 'secret');
  assert.notEqual(fields.api_key.required, true, 'the gateway is open without a key');
  assert.equal(fields.poll_frequency.min, 20);
  assert.deepEqual(
    fields.language.options.map((o) => o.value),
    LANGUAGES,
  );
});

test('the keys of the manifest are the keys of the code', () => {
  assert.deepEqual(manifest.actions.map((a) => a.key).sort(), Object.values(ACTIONS).sort());
  assert.deepEqual(
    manifest.scene_actions.map((a) => a.key).sort(),
    Object.values(SCENE_ACTIONS).sort(),
  );
  assert.deepEqual(
    manifest.scene_triggers.map((t) => t.key).sort(),
    Object.values(SCENE_TRIGGERS).sort(),
  );
  assert.deepEqual(manifest.widgets.map((w) => w.key).sort(), Object.values(WIDGETS).sort());
  for (const name of Object.keys(SCENE_ACTIONS)) {
    assert.ok(index.includes(`onSceneAction(SCENE_ACTIONS.${name}`), name);
  }
  const triggers = Object.fromEntries(manifest.scene_triggers.map((t) => [t.key, t]));
  const option = (trigger, key) =>
    triggers[trigger].fields.find((f) => f.key === key).options.map((o) => o.value);
  assert.deepEqual(
    option(SCENE_TRIGGERS.APPROACHING, 'threshold'),
    DEPARTURE_THRESHOLDS.map(String),
  );
  for (const key of [SCENE_TRIGGERS.DISRUPTED, SCENE_TRIGGERS.CLEARED]) {
    assert.deepEqual(option(key, 'scope'), ['mine', 'other']);
  }
});

test('the event data and the action outputs are the declared ones', () => {
  const declared = (trigger) =>
    new Set([...trigger.fields, ...trigger.variables].map((f) => f.key));
  const triggers = Object.fromEntries(manifest.scene_triggers.map((t) => [t.key, t]));
  const sent = {
    [SCENE_TRIGGERS.APPROACHING]: [
      'stop',
      'line',
      'destination',
      'minutes',
      'expected_at',
      'threshold',
    ],
    [SCENE_TRIGGERS.LAST]: ['stop', 'line', 'destination', 'minutes', 'expected_at'],
    [SCENE_TRIGGERS.DISRUPTED]: ['line', 'scope', 'notice', 'notice_id', 'lines', 'stops'],
    [SCENE_TRIGGERS.CLEARED]: ['line', 'scope', 'notice', 'notice_id', 'lines', 'stops'],
  };
  for (const [key, data] of Object.entries(sent)) {
    assert.deepEqual([...declared(triggers[key])].sort(), [...data].sort(), key);
  }
  const outputs = manifest.scene_actions[0].outputs.map((o) => o.key).sort();
  assert.deepEqual(outputs, [
    'count',
    'list',
    'message',
    'next_destination',
    'next_line',
    'next_minutes',
    'next_time',
    'stop',
  ]);
});

test('the external ids and feature keys are forever', () => {
  const gladys = createFakeGladys({ selector: 'stib' });
  const point = {
    id: '3518B',
    name: { fr: 'PORTE DE NAMUR', nl: 'NAAMSEPOORT' },
    lines: [{ line: '54', destination: { fr: 'TRONE', nl: 'TROON' } }],
  };
  const device = buildStopDevice(gladys, { point, lines: [] }, 2, 'nl');
  assert.equal(device.external_id, 'ext:stib:stop:3518B');
  assert.equal(device.name, 'STIB Naamsepoort · 54 → Troon');
  assert.deepEqual(
    device.features.map((f) => f.external_id.split(':').at(-1)),
    ['next_minutes', 'dep1_minutes', 'dep1_text', 'dep2_minutes', 'dep2_text', 'message'],
  );
  assert.deepEqual(parseExternalId(device.external_id), { kind: 'stop', pointId: '3518B' });
  assert.equal(buildNetworkDevice(gladys).external_id, ids.network(gladys));
  assert.deepEqual(parseExternalId('ext:stib:network'), { kind: 'network' });
  assert.equal(parseExternalId('ext:stib:stop:../x'), undefined);
  assert.deepEqual(
    [FEATURE.NOTICES, FEATURE.MY_NOTICES, FEATURE.NOTICE],
    ['notices', 'my_notices', 'notice'],
  );
});
