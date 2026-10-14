// -----------------------------------------------------------------------------
// The client of the STIB-MIVB datasets (Belgian Mobility open data portal):
// waiting times, travellers information, stop details and stops by line, as
// raw rows. Turning them into readings is src/model.js's job.
//
// The gateway speaks an Opendatasoft-like dialect, checked by hand on
// 2026-10-14: `limit` (at most 1000, larger values are capped), `offset`,
// and `where` with quoted strings (`pointid in ("8321","3518B")`). A list
// answer is { results, total_count, parameters, metadata }.
// -----------------------------------------------------------------------------

import {
  API_URL,
  KEY_HEADER,
  PAGE_SIZE,
  PARTNER_API_URL,
  PATHS,
  POINT_ID_PATTERN,
  POINTS_PER_REQUEST,
} from './constants.js';
import { getJson } from './http.js';

export class StibClient {
  constructor({ apiKey = '', pageSize = PAGE_SIZE } = {}) {
    this.baseUrl = apiKey ? PARTNER_API_URL : API_URL;
    this.headers = apiKey ? { [KEY_HEADER]: apiKey } : {};
    this.pageSize = pageSize;
    /** Requests sent, for the logs (the anonymous quota counts them). */
    this.requests = 0;
  }

  url(path, params = {}) {
    return `${this.baseUrl}/${path}?${new URLSearchParams(params)}`;
  }

  async get(path, params) {
    this.requests += 1;
    const answer = await getJson(this.url(path, params), { headers: this.headers });
    if (!Array.isArray(answer?.results)) {
      throw new Error(`Unexpected answer on ${path}: no results`);
    }
    return answer;
  }

  /** Every row of a dataset, page by page. */
  async all(path, params = {}) {
    const rows = [];
    for (let offset = 0; ; offset += this.pageSize) {
      const answer = await this.get(path, {
        ...params,
        limit: String(this.pageSize),
        ...(offset > 0 ? { offset: String(offset) } : {}),
      });
      rows.push(...answer.results);
      const total = Number(answer.total_count ?? answer.totalCount);
      if (
        answer.results.length < this.pageSize ||
        (Number.isFinite(total) && rows.length >= total)
      ) {
        return rows;
      }
    }
  }

  /** [{ id, name: '{"fr","nl"}', gpscoordinates: '{"latitude","longitude"}' }] */
  async stopDetails() {
    return this.all(PATHS.STOP_DETAILS);
  }

  /** [{ lineid, direction, destination: '{"fr","nl"}', points: '[{"id","order"}]' }] */
  async stopsByLine() {
    return this.all(PATHS.STOPS_BY_LINE);
  }

  /** [{ id, content, lines, points, priority, type }] */
  async travellersInformation() {
    return this.all(PATHS.TRAVELLERS_INFORMATION);
  }

  /**
   * The waiting times of some points, in as few requests as possible:
   * [{ pointid, lineid, passingtimes: '[{...}]' }], one row per point and line.
   */
  async waitingTimes(pointIds) {
    const ids = [...new Set(pointIds)].filter((id) => POINT_ID_PATTERN.test(id));
    const rows = [];
    for (let i = 0; i < ids.length; i += POINTS_PER_REQUEST) {
      const chunk = ids.slice(i, i + POINTS_PER_REQUEST);
      const where = `pointid in (${chunk.map((id) => `"${id}"`).join(',')})`;
      rows.push(...(await this.all(PATHS.WAITING_TIMES, { where })));
    }
    return rows;
  }
}
