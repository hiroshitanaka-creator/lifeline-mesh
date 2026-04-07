import path from "node:path";

import { GatewayBridge } from "./bridge.js";
import { GatewayEventStore } from "./event-store.js";
import { createGatewayService } from "./service.js";

const islandId = process.env.LIFELINE_ISLAND_ID ?? "island-default";
const uplinkEnabled = process.env.LIFELINE_GATEWAY_UPLINK !== "off";
const allowedTopics = process.env.LIFELINE_GATEWAY_ALLOWED_TOPICS
  ? process.env.LIFELINE_GATEWAY_ALLOWED_TOPICS.split(",").map((entry) => entry.trim()).filter(Boolean)
  : null;
const geofences = process.env.LIFELINE_GATEWAY_GEOFENCE_SCOPES
  ? process.env.LIFELINE_GATEWAY_GEOFENCE_SCOPES.split(",").map((entry) => entry.trim()).filter(Boolean)
  : null;
const port = Number(process.env.PORT ?? "8787");
const gatewayDataDir = process.env.LIFELINE_GATEWAY_DATA_DIR ?? ".lifeline-gateway";
const persistencePath = process.env.LIFELINE_GATEWAY_EVENT_STORE_PATH
  ?? path.join(gatewayDataDir, `${islandId}.events.jsonl`);

const store = new GatewayEventStore({ filePath: persistencePath });

const bridge = new GatewayBridge({
  islandId,
  store,
  uplinkEnabled,
  policy: {
    allowedTopics,
    geofences
  }
});

const app = createGatewayService({ bridge });

app.listen(port).then(() => {
  console.log(`[Gateway] listening on :${port} island=${islandId} uplinkEnabled=${uplinkEnabled}`);
});
