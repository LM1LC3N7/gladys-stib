// -----------------------------------------------------------------------------
// Constants of the STIB-MIVB integration.
// -----------------------------------------------------------------------------

/**
 * The STIB-MIVB datasets of the Belgian Mobility Company open data portal
 * (https://data.belgianmobility.io), anonymous access: the URLs its data
 * catalog links to.
 */
export const API_URL =
  'https://api-management-discovery-production.azure-api.net/api/datasets/stibmivb';

/**
 * The same datasets behind the developer portal, where the free subscription
 * keys are issued: a key is sent there, in the header the portal declares.
 */
export const PARTNER_API_URL =
  'https://api-management-opendata-production.azure-api.net/api/datasets/stibmivb';
export const KEY_HEADER = 'bmc-partner-key';

export const PATHS = {
  WAITING_TIMES: 'rt/WaitingTimes',
  TRAVELLERS_INFORMATION: 'rt/TravellersInformation',
  STOP_DETAILS: 'static/StopDetails',
  STOPS_BY_LINE: 'static/stopsByLine',
};

export const USER_AGENT = 'gladys-stib/0.1 (https://github.com/LM1LC3N7/gladys-stib)';
export const HTTP_TIMEOUT = 15_000;

/** The gateway caps `limit` at 1000 rows: the static datasets come in pages. */
export const PAGE_SIZE = 1000;
/** Point ids per WaitingTimes request, so the `where` clause stays short. */
export const POINTS_PER_REQUEST = 50;
/** A point id: digits, sometimes a letter (5399F, 3518B). */
export const POINT_ID_PATTERN = /^\d{1,6}[A-Z]?$/;

/** The stop list and the lines change a few times a year: keep them a day. */
export const DIRECTORY_TTL = 24 * 60 * 60_000;

/**
 * The pacing, with a subscription key (Standard tier: 12,000 requests a day,
 * 500 a minute) and without (anonymous: 100 a day, 10 a minute). Anonymous:
 * 72 departure reads + 12 disturbance reads + 4 directory pages a day.
 */
export const PACING = {
  KEY: { minPoll: 20, disturbancesInterval: 5 * 60_000 },
  ANONYMOUS: { minPoll: 20 * 60, disturbancesInterval: 2 * 60 * 60_000 },
};

/** Discovery adds several platforms in a row: wait this long to read them together. */
export const CREATED_DELAY = 2_000;
/** Two readings of the same vehicle predict times at most this far apart. */
export const MATCH_WINDOW = 4 * 60_000;
/** A departure stays listed until this long after its expected time. */
export const DEPARTED_GRACE = 30_000;
/** At most this many network events per reading (the core admits 300/min). */
export const MAX_NETWORK_EVENTS = 40;

/** The "minutes before the departure" marks a scene can wait for. */
export const DEPARTURE_THRESHOLDS = [1, 2, 3, 5, 10, 15];

/** The languages of the STIB names (stops, destinations). */
export const LANGUAGES = ['fr', 'nl'];

/** Manifest keys (forever: stored in user scenes and dashboards). */
export const ACTIONS = { TEST: 'test_connection', SEARCH: 'search_stops' };
export const SCENE_ACTIONS = { NEXT_DEPARTURES: 'get_next_departures' };
export const SCENE_TRIGGERS = {
  APPROACHING: 'departure_approaching',
  LAST: 'last_departure',
  DISRUPTED: 'line_disrupted',
  CLEARED: 'disruption_cleared',
};
export const WIDGETS = { DEPARTURES: 'departures', NETWORK: 'network' };
