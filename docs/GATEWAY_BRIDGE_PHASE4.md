# Gateway Bridge Drill (Phase 4)

This runbook defines the truthful Phase 4 gateway scope.

## Shipped now

- Dedicated `gateway/` service split from `node-server/` relay.
- `GatewayBridge` responsibilities:
  1. local mesh ingest
  2. signed event store
  3. backhaul export/import over simple HTTP service endpoints
  4. duplicate + loop suppression (`eventId` dedupe + `gatewayPath` loop guard)
- Local-only mode supported (`uplinkEnabled=false`): events remain locally available even when backhaul is unavailable.
- Metadata-minimizing policy controls uplink:
  - high/critical priority uplink only
  - optional topic filter (`allowedTopics`)
  - optional geofence/scope filter (`geofences`)

## Not shipped in this phase

- Browser endpoint direct backhaul runtime.
- Multi-client Node relay behavioral change (Node relay remains intentionally single-client).
- Production-grade global gateway federation control-plane.

## HTTP endpoints (gateway service)

- `GET /health`
- `POST /gateway/local-ingest`
- `POST /gateway/backhaul-ingest`
- `GET /gateway/export?cursor=0`
- `GET /gateway/snapshot`

## Validation evidence

- Integration test: `tests/integration/gateway-phase4.test.js`
  - two-island sync via gateway import/export
  - reconnect duplicate suppression
  - loop suppression on round-trip
  - local-only mode survivability
  - metadata policy filtering
