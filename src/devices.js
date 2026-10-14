// -----------------------------------------------------------------------------
// The Gladys devices and their states. Pure.
//
// External ids (forever):
//   stop:<pointId>   a watched point: one platform, one direction (8321, 3518B)
//   network          the STIB-MIVB network (travellers information)
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as T,
  DEVICE_FEATURE_UNITS as U,
} from '@gladysassistant/integration-sdk';
import { normalizeLine } from './config.js';
import { departureLine, noticeLine, statusText } from './model.js';
import { describePoint } from './stops.js';
import { localized, prettyName } from './text.js';

export const DEVICE_TYPES = { STOP: 'stop', NETWORK: 'network' };

export const FEATURE = {
  NEXT_MINUTES: 'next_minutes',
  minutes: (i) => `dep${i}_minutes`,
  text: (i) => `dep${i}_text`,
  MESSAGE: 'message',
  NOTICES: 'notices',
  MY_NOTICES: 'my_notices',
  NOTICE: 'notice',
};

export const ids = {
  stop: (gladys, pointId) => gladys.externalId(`stop:${pointId}`),
  network: (gladys) => gladys.externalId('network'),
  feature: (deviceId, key) => `${deviceId}:${key}`,
};

/** { kind: 'stop', pointId } | { kind: 'network' } | undefined. */
export function parseExternalId(externalId) {
  const text = String(externalId ?? '');
  const stop = /:stop:(\d{1,6}[A-Z]?)$/.exec(text);
  if (stop) {
    return { kind: DEVICE_TYPES.STOP, pointId: stop[1] };
  }
  if (/:network$/.test(text)) {
    return { kind: DEVICE_TYPES.NETWORK };
  }
  return undefined;
}

const feature = (deviceId, key, name, category, type, extra = {}) => ({
  name,
  external_id: ids.feature(deviceId, key),
  category,
  type,
  min: 0,
  max: 1440,
  read_only: true,
  has_feedback: false,
  keep_history: true,
  ...extra,
});

const minutes = (id, key, name) =>
  feature(id, key, name, C.DURATION, T.DURATION.INTEGER, { unit: U.MINUTES });
const count = (id, key, name) =>
  feature(id, key, name, C.COUNTER_SENSOR, T.SENSOR.INTEGER, { max: 1000 });
const text = (id, key, name) =>
  feature(id, key, name, C.TEXT, T.TEXT.TEXT, { min: 0, max: 0, keep_history: false });

/**
 * A stop device. `watch` is { point, lines, name?, distanceKm?, several? }:
 * the point id, the line filter and the name of the stop are stored as
 * params, so the poll path reads them from the device Gladys hands back
 * (not from the config). `several`: the custom name covers several
 * platforms, the directions tell them apart.
 */
export function buildStopDevice(gladys, watch, maxDepartures, language = 'fr') {
  const { point } = watch;
  const id = ids.stop(gladys, point.id);
  const features = [minutes(id, FEATURE.NEXT_MINUTES, 'Next departure (min)')];
  for (let i = 1; i <= maxDepartures; i += 1) {
    features.push(minutes(id, FEATURE.minutes(i), `Departure ${i} (min)`));
    features.push(text(id, FEATURE.text(i), `Departure ${i}`));
  }
  features.push(text(id, FEATURE.MESSAGE, 'STIB message'));
  const stopName = prettyName(localized(point.name, language));
  const serves = describePoint(point, language, watch.lines);
  let name;
  if (watch.name) {
    name = watch.several && serves ? `${watch.name} · ${serves}` : watch.name;
  } else {
    name = serves ? `STIB ${stopName} · ${serves}` : `STIB ${stopName} (${point.id})`;
  }
  return {
    name: name.slice(0, 80),
    external_id: id,
    features,
    params: [
      { name: 'point_id', value: point.id },
      { name: 'stop_name', value: stopName },
      { name: 'lines', value: watch.lines.join('|') },
      {
        name: 'served_lines',
        value: [...new Set(point.lines.map((l) => l.line))].join('|'),
      },
      { name: 'max_departures', value: String(maxDepartures) },
      ...(watch.distanceKm !== undefined
        ? [{ name: 'distance_km', value: watch.distanceKm.toFixed(2) }]
        : []),
    ],
  };
}

export function buildNetworkDevice(gladys) {
  const id = ids.network(gladys);
  return {
    name: 'STIB network',
    external_id: id,
    features: [
      count(id, FEATURE.NOTICES, 'Notices on the network'),
      count(id, FEATURE.MY_NOTICES, 'Notices for my stops'),
      text(id, FEATURE.NOTICE, 'Main notice for my stops'),
    ],
  };
}

const split = (value) =>
  String(value ?? '')
    .split('|')
    .map(normalizeLine)
    .filter(Boolean);

/** The watch settings stored in a device's params. */
export function watchOfDevice(device) {
  const params = Object.fromEntries((device.params ?? []).map((p) => [p.name, p.value]));
  return {
    pointId: params.point_id ?? parseExternalId(device.external_id)?.pointId,
    stopName: params.stop_name ?? device.name,
    lines: split(params.lines),
    servedLines: split(params.served_lines),
    maxDepartures: Math.max(1, Math.min(5, Number(params.max_departures) || 3)),
  };
}

const state = (deviceId, key, value) =>
  value === null || value === undefined
    ? []
    : [
        typeof value === 'string'
          ? { device_feature_external_id: ids.feature(deviceId, key), text: value }
          : { device_feature_external_id: ids.feature(deviceId, key), state: value },
      ];

export function stopStates(deviceId, reading, maxDepartures, language = 'fr') {
  const [next] = reading.departures;
  const states = [...state(deviceId, FEATURE.NEXT_MINUTES, next ? next.minutes : null)];
  for (let i = 1; i <= maxDepartures; i += 1) {
    const d = reading.departures[i - 1];
    states.push(...state(deviceId, FEATURE.minutes(i), d ? d.minutes : null));
    states.push(...state(deviceId, FEATURE.text(i), d ? departureLine(d, language) : '—'));
  }
  states.push(
    ...state(deviceId, FEATURE.MESSAGE, (statusText(reading, language) ?? '—').slice(0, 200)),
  );
  return states;
}

export function networkStates(deviceId, reading, language = 'fr') {
  const [main] = reading.mine;
  return [
    ...state(deviceId, FEATURE.NOTICES, reading.total),
    ...state(deviceId, FEATURE.MY_NOTICES, reading.mine.length),
    ...state(deviceId, FEATURE.NOTICE, main ? noticeLine(main, language).slice(0, 200) : '—'),
  ];
}
