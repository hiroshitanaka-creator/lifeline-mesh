import { GatewayBridge } from "./bridge.js";
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

const bridge = new GatewayBridge({
  islandId,
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
