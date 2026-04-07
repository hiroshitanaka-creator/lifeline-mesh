# Gateway Bridge Drill (Phase 4)

This runbook defines the truthful Phase 4 gateway scope.

## Shipped now

- Dedicated `gateway/` service split from `node-server/` relay.
- `GatewayBridge` responsibilities:
  1. local mesh ingest
  2. signed event store (durable JSONL persistence on gateway server)
  3. backhaul export/import over simple HTTP service endpoints
  4. duplicate + loop suppression (`eventId` dedupe + `gatewayPath` loop guard)
- Local-only mode supported (`uplinkEnabled=false`): events remain locally available even when backhaul is unavailable.
- Metadata-minimizing policy controls uplink:
  - high/critical priority uplink only
  - optional topic filter (`allowedTopics`)
  - optional geofence/scope filter (`geofences`)
- Restart safety:
  - persisted events are replayed on process boot
  - export cursor semantics remain index-ordered across restart (`cursor` tracks durable append order)
  - duplicate/loop suppression behavior remains unchanged after recovery

## Persistence configuration

- Default gateway server path: `.lifeline-gateway/<islandId>.events.jsonl`
- Optional overrides:
  - `LIFELINE_GATEWAY_DATA_DIR` (base directory for per-island store files)
  - `LIFELINE_GATEWAY_EVENT_STORE_PATH` (explicit full file path; overrides data-dir default)

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
