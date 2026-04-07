# Energy Metrics (Phase 5)

Phase 5 adds deterministic, simulation-based energy class reporting tied to relay send volume.

## Command

```bash
node tools/phase5-energy-metrics.js
```

## Output

- `avgUniqueDelivered`
- `avgQueueRemaining`
- `nodeEnergyProfile` (`low|medium|high` per node)

This metric is advisory and deterministic (seeded simulation), intended to support transport policy tuning without claiming hardware battery telemetry.
