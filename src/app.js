// -----------------------------------------------------------------------------
// The integration itself: the stop directory, discovery (typed stops and
// stops near the houses), the refresh loop over the devices the user created
// (one request for every watched point), the network notices, the scene
// triggers, the scene action and the widgets. index.js only wires the SDK
// handlers to it.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { normalizeConfig, normalizeLine, pacingOf } from './config.js';
import { CREATED_DELAY, DIRECTORY_TTL, WIDGETS } from './constants.js';
import {
  DEVICE_TYPES,
  buildNetworkDevice,
  buildStopDevice,
  networkStates,
  parseExternalId,
  stopStates,
  watchOfDevice,
} from './devices.js';
import { T } from './i18n.js';
import { aged, departureLine, networkReading, statusText, stopReading } from './model.js';
import { StibClient } from './stib.js';
import {
  buildDirectory,
  describePoint,
  findStop,
  nearestStops,
  searchStops,
  stopsOf,
} from './stops.js';
import { localized, prettyName } from './text.js';
import { networkEvents, stopEvents } from './triggers.js';
import { departuresWidget, networkWidget } from './widget.js';

const defaultTimers = { setTimeout, clearTimeout, setInterval, clearInterval };

export class StibApp {
  constructor({
    gladys,
    logger = createLogger({ name: 'stib' }),
    now = Date.now,
    timers = defaultTimers,
  }) {
    this.gladys = gladys;
    this.logger = logger;
    this.now = now;
    this.timers = timers;
    this.config = normalizeConfig();
    this.pacing = pacingOf(this.config);
    this.client = new StibClient();
    this.directoryCache = undefined;
    this.directoryAt = 0;
    /** device external id -> last reading */
    this.readings = new Map();
    this.network = undefined;
    this.networkAt = 0;
    /** The last departures already announced (see triggers.js). */
    this.announced = new Set();
    /** Stop devices just created, read together (see deviceCreated). */
    this.created = new Map();
    this.createdTimer = undefined;
    this.refreshTimer = undefined;
    this.lastStatus = undefined;
    this.refreshing = undefined;
    this.generation = 0;
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(raw = {}) {
    this.stop();
    const generation = ++this.generation;
    this.config = normalizeConfig(raw);
    this.pacing = pacingOf(this.config);
    this.client = new StibClient({ apiKey: this.config.apiKey });
    this.readings.clear();
    this.network = undefined;
    this.networkAt = 0;
    this.announced.clear();
    try {
      await this.publishDevices();
    } catch (err) {
      this.logger.warn(`Discovery failed: ${err.message}`);
    }
    try {
      await this.refresh();
    } catch (err) {
      await this.setStatus(false, T.unreachable(err.message));
    }
    if (generation !== this.generation) {
      return;
    }
    this.refreshTimer = this.timers.setInterval(
      () => this.refresh().catch((err) => this.setStatus(false, T.unreachable(err.message))),
      this.pacing.pollSeconds * 1000,
    );
  }

  stop() {
    this.generation += 1;
    this.timers.clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
    this.timers.clearTimeout(this.createdTimer);
    this.createdTimer = undefined;
    this.created.clear();
  }

  async setStatus(connected, message) {
    const key = JSON.stringify([connected, message ?? null]);
    if (key === this.lastStatus) {
      return;
    }
    this.lastStatus = key;
    await this.gladys
      .setConnectionStatus(connected, message)
      .catch((err) => this.logger.warn(`setConnectionStatus failed: ${err.message}`));
  }

  // --- Stop directory ----------------------------------------------------------

  /** StopDetails + stopsByLine, read once a day (only discovery needs them). */
  async directory() {
    if (!this.directoryCache || this.now() - this.directoryAt > DIRECTORY_TTL) {
      // One after the other: the anonymous tier admits 10 requests a minute.
      const stops = await this.client.stopDetails();
      const lines = await this.client.stopsByLine();
      this.directoryCache = buildDirectory(stops, lines);
      this.directoryAt = this.now();
    }
    return this.directoryCache;
  }

  // --- Discovery -----------------------------------------------------------------

  /** The devices to offer: the typed stops, the nearest ones, the network. */
  async discoveredDevices() {
    const directory = await this.directory();
    const watches = new Map();
    for (const entry of this.config.stops) {
      const stop = findStop(directory, entry.query);
      if (!stop) {
        this.logger.warn(`Unknown stop "${entry.query}"`);
        continue;
      }
      const points =
        entry.lines.length > 0 && directory.hasLines
          ? stop.points.filter((p) => p.lines.some((l) => entry.lines.includes(l.line)))
          : stop.points;
      if (points.length === 0) {
        this.logger.warn(`No platform of "${entry.query}" serves ${entry.lines.join(', ')}`);
      }
      for (const point of points) {
        watches.set(point.id, {
          point,
          lines: entry.lines,
          name: entry.name,
          several: points.length > 1,
        });
      }
    }
    if (this.config.nearbyStops > 0) {
      let houses = [];
      try {
        houses = await this.gladys.getHouses();
      } catch (err) {
        this.logger.warn(`Houses unavailable (location not granted?): ${err.message}`);
      }
      for (const house of houses) {
        for (const stop of nearestStops(directory, house, this.config.nearbyStops)) {
          for (const point of stop.points) {
            if (!watches.has(point.id)) {
              watches.set(point.id, { point, lines: [], distanceKm: stop.distanceKm });
            }
          }
        }
      }
    }
    const devices = [...watches.values()].map((w) =>
      buildStopDevice(this.gladys, w, this.config.maxDepartures, this.config.language),
    );
    if (this.config.watchDisturbances) {
      devices.push(buildNetworkDevice(this.gladys));
    }
    return devices;
  }

  async publishDevices() {
    await this.gladys.publishDiscoveredDevices(await this.discoveredDevices());
  }

  /** The devices the user created. */
  watchedDevices() {
    const stops = [];
    let network;
    for (const device of this.gladys.devices ?? []) {
      const parsed = parseExternalId(device.external_id);
      if (parsed?.kind === DEVICE_TYPES.STOP) {
        stops.push(device);
      } else if (parsed?.kind === DEVICE_TYPES.NETWORK) {
        network = device;
      }
    }
    return { stops, network };
  }

  /** The points and lines the network notices are matched against. */
  scope(stops) {
    const points = new Set();
    const lines = new Set();
    for (const device of stops) {
      const watch = watchOfDevice(device);
      points.add(watch.pointId);
      for (const line of watch.lines.length > 0 ? watch.lines : watch.servedLines) {
        lines.add(line);
      }
    }
    return { points: [...points], lines: [...lines] };
  }

  // --- Reading -------------------------------------------------------------------

  refresh() {
    if (!this.refreshing) {
      this.refreshing = this.doRefresh().finally(() => {
        this.refreshing = undefined;
      });
    }
    return this.refreshing;
  }

  async doRefresh() {
    const generation = this.generation;
    const { stops, network } = this.watchedDevices();
    let failure;
    if (stops.length > 0) {
      try {
        // Every watched point in one request (50 points per request).
        const watches = stops.map((device) => ({ device, watch: watchOfDevice(device) }));
        const rows = await this.client.waitingTimes(watches.map((w) => w.watch.pointId));
        if (generation !== this.generation) {
          return;
        }
        for (const { device, watch } of watches) {
          await this.applyStop(device, watch, rows);
        }
        this.gladys.requestWidgetRefresh(WIDGETS.DEPARTURES);
      } catch (err) {
        failure = err;
        this.logger.warn(`Reading the waiting times failed: ${err.message}`);
      }
    }
    if (network && this.now() - this.networkAt >= this.pacing.disturbancesInterval) {
      try {
        await this.refreshNetwork(network);
      } catch (err) {
        failure = err;
        this.logger.warn(`Reading the travellers information failed: ${err.message}`);
      }
    }
    if (failure) {
      await this.setStatus(this.readings.size > 0, T.unreachable(failure.message));
    } else if (stops.length === 0 && !network) {
      await this.setStatus(true, T.noStop);
    } else {
      await this.setStatus(true, T.ok(stops.length, this.pacing));
    }
  }

  /** A point's reading -> its states and scene events. */
  async applyStop(device, watch, rows) {
    const reading = stopReading(rows, {
      pointId: watch.pointId,
      now: this.now(),
      lines: watch.lines,
    });
    const previous = this.readings.get(device.external_id);
    this.readings.set(device.external_id, reading);
    await this.gladys.publishChangedStates(
      stopStates(device.external_id, reading, watch.maxDepartures, this.config.language),
      { heartbeat: 10 * 60_000 },
    );
    const events = stopEvents(device.external_id, previous, reading, {
      language: this.config.language,
      announced: this.announced,
    });
    if (this.announced.size > 1000) {
      this.announced.clear(); // a few days of last departures: start over
    }
    await this.fire(events);
  }

  async refreshNetwork(device) {
    const reading = networkReading(await this.client.travellersInformation(), {
      now: this.now(),
      ...this.scope(this.watchedDevices().stops),
    });
    const previous = this.network;
    this.network = reading;
    this.networkAt = this.now();
    await this.gladys.publishChangedStates(
      networkStates(device.external_id, reading, this.config.language),
      { heartbeat: 60 * 60_000 },
    );
    await this.fire(networkEvents(previous, reading, { language: this.config.language }));
    this.gladys.requestWidgetRefresh(WIDGETS.NETWORK);
  }

  async fire(events) {
    for (const event of events) {
      await this.gladys
        .publishSceneEvent(event.key, event.data)
        .catch((err) => this.logger.warn(`Scene event ${event.key} failed: ${err.message}`));
    }
  }

  /** A device was just created: read it now rather than at the next tick. */
  async deviceCreated(device) {
    const parsed = parseExternalId(device.external_id);
    try {
      if (parsed?.kind === DEVICE_TYPES.STOP) {
        // Discovery adds several platforms in a row: read them together.
        this.created.set(device.external_id, device);
        if (!this.createdTimer) {
          this.createdTimer = this.timers.setTimeout(
            () => this.readCreated().catch((err) => this.logger.warn(err.message)),
            CREATED_DELAY,
          );
        }
      } else if (parsed?.kind === DEVICE_TYPES.NETWORK) {
        this.networkAt = 0;
        await this.refreshNetwork(device);
      }
    } catch (err) {
      this.logger.warn(`Reading ${device.name} after creation failed: ${err.message}`);
    }
  }

  /** The stops created in the last seconds, in one request. */
  async readCreated() {
    this.createdTimer = undefined;
    const watches = [...this.created.values()].map((device) => ({
      device,
      watch: watchOfDevice(device),
    }));
    this.created.clear();
    if (watches.length === 0) {
      return;
    }
    const rows = await this.client.waitingTimes(watches.map((w) => w.watch.pointId));
    for (const { device, watch } of watches) {
      await this.applyStop(device, watch, rows);
    }
    this.gladys.requestWidgetRefresh(WIDGETS.DEPARTURES);
  }

  // --- Scene action ----------------------------------------------------------------

  stopDevice(externalId) {
    const device = (this.gladys.devices ?? []).find((d) => d.external_id === externalId);
    if (!device || parseExternalId(externalId)?.kind !== DEVICE_TYPES.STOP) {
      throw new Error(`Unknown STIB stop device ${externalId}`);
    }
    return device;
  }

  /**
   * The next departures of a stop. A reading older than the refresh pace is
   * read again for the answer only: an action never fires a scene event.
   */
  async getNextDepartures(fields = {}) {
    const device = this.stopDevice(fields.device);
    const watch = watchOfDevice(device);
    let reading = aged(this.readings.get(device.external_id), this.now());
    if (!reading || this.now() - Date.parse(reading.readAt) > this.pacing.pollSeconds * 1000) {
      reading = stopReading(await this.client.waitingTimes([watch.pointId]), {
        pointId: watch.pointId,
        now: this.now(),
        lines: watch.lines,
      });
    }
    const language = this.config.language;
    const shown = reading.departures.slice(0, watch.maxDepartures);
    const [next] = reading.departures;
    return {
      stop: watch.stopName,
      count: shown.length,
      list: shown.map((d) => departureLine(d, language, { minutes: true })).join('\n'),
      next_line: next?.line ?? null,
      next_destination: next ? prettyName(localized(next.destination, language)) : null,
      next_minutes: next?.minutes ?? null,
      next_time: next?.expectedAt ?? null,
      message: statusText(reading, language),
    };
  }

  // --- Widgets ---------------------------------------------------------------------

  async getWidget(key, { settings = {}, language } = {}) {
    const lang = language ?? 'en';
    const nameLanguage = this.config.language;
    if (key === WIDGETS.NETWORK) {
      const lines = String(settings.lines ?? '')
        .split(/[\s,|]+/)
        .map(normalizeLine)
        .filter(Boolean);
      return networkWidget({ reading: this.network, lines, language: lang, nameLanguage });
    }
    const device = (this.gladys.devices ?? []).find((d) => d.external_id === settings.device);
    if (!device || parseExternalId(device.external_id)?.kind !== DEVICE_TYPES.STOP) {
      return {
        ttl_seconds: 300,
        components: [{ type: 'text', text: T.widget.noStop, variant: 'body' }],
      };
    }
    return departuresWidget({
      stopName: device.name.length <= 40 ? device.name : watchOfDevice(device).stopName,
      reading: aged(this.readings.get(device.external_id), this.now()),
      language: lang,
      nameLanguage,
    });
  }

  // --- Configuration screen buttons --------------------------------------------------

  async testConnection() {
    try {
      const directory = await this.directory();
      const { stops: watched } = this.watchedDevices();
      const result = T.tested({
        stops: stopsOf(directory).length,
        points: directory.points.length,
        watched: watched.length,
        anonymous: this.pacing.anonymous,
      });
      const lines = { en: [result.en], fr: [result.fr] };
      for (const entry of this.config.stops.filter((e) => !findStop(directory, e.query))) {
        const message = T.unknownStop(entry.query);
        lines.en.push(message.en);
        lines.fr.push(message.fr);
      }
      return { en: lines.en.join('\n'), fr: lines.fr.join('\n') };
    } catch (err) {
      return T.unreachable(err.message);
    }
  }

  async searchStops(fields = {}) {
    const query = String(fields.query ?? '').trim();
    const language = this.config.language;
    const matches = searchStops(await this.directory(), query).map((stop) => {
      const points = stop.points.map((p) => {
        const serves = describePoint(p, language);
        return serves ? `${p.id} (${serves})` : p.id;
      });
      return `${prettyName(localized(stop.name, language))}: ${points.join(', ')}`;
    });
    if (matches.length === 0) {
      return T.unknownStop(query);
    }
    return { en: matches.join('\n'), fr: matches.join('\n') };
  }
}
