# Energy Metrics (Phase 5)

Phase 5 provides deterministic **simulation evidence** for relay send volume. It does **not** provide hardware battery telemetry.

## Simulation evidence (current truth)

Command:

```bash
node tools/phase5-energy-metrics.js
```

Output fields:

- `avgUniqueDelivered`
- `avgQueueRemaining`
- `nodeEnergyProfile` (`low|medium|high` per node)

Truth constraints:

- deterministic and seeded simulation output
- advisory for policy tuning only
- must not be reported as measured battery draw

## Measured evidence (future/manual structure only)

No measured battery telemetry is currently shipped in this repository.

To avoid mixing future measurements with simulation records, use schema separation:

- `docs/schemas/energy-evidence.schema.json`
  - `evidenceClass: "simulation" | "measured"`
  - `truthFlags.batteryTelemetry: "simulated" | "measured" | "not_available"`

Until a real measured path exists, records should remain `evidenceClass: "simulation"`.
