// -----------------------------------------------------------------------------
// Entry point: SDK wiring only. Every handler is registered BEFORE connect(),
// and delegates to the StibApp (src/app.js).
//
// Environment variables provided by the Gladys supervisor, read by the SDK:
// GLADYS_HOST_API_URL, GLADYS_INTEGRATION_TOKEN, GLADYS_INTEGRATION_SELECTOR.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { StibApp } from './src/app.js';
import { ACTIONS, SCENE_ACTIONS, WIDGETS } from './src/constants.js';

const gladys = new GladysIntegration();
const app = new StibApp({ gladys });

// --- Discovery -------------------------------------------------------------------
gladys.onScanRequest(() => app.publishDevices());
gladys.onDeviceCreated((device) => app.deviceCreated(device));
gladys.onDeviceUpdated((device) => app.deviceCreated(device));

// --- Scene actions --------------------------------------------------------------
gladys.onSceneAction(SCENE_ACTIONS.NEXT_DEPARTURES, (fields) => app.getNextDepartures(fields));

// --- Dashboard widgets ----------------------------------------------------------
for (const key of Object.values(WIDGETS)) {
  gladys.onWidgetGet(key, (request) => app.getWidget(key, request));
}

// --- Configuration screen buttons ----------------------------------------------
gladys.onAction(ACTIONS.TEST, () => app.testConnection());
gladys.onAction(ACTIONS.SEARCH, (fields) => app.searchStops(fields));

// --- Configuration changed by the user ----------------------------------------
gladys.onConfigUpdated((config) => {
  logger.info('Configuration updated: restarting');
  return app.start(config);
});

// --- Connection lifecycle ------------------------------------------------------
gladys.on('connected', async () => {
  try {
    await app.start(await gladys.getConfig());
  } catch (err) {
    logger.error('Start failed', err);
  }
});
gladys.on('disconnected', () => app.stop());
gladys.handleShutdown(() => app.stop());

logger.info('Starting the STIB-MIVB integration...');
gladys.connect().catch((err) => {
  logger.error('Initial connection failed', err);
  process.exit(1);
});
