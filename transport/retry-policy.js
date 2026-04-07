export const TRANSPORT_CLASS = {
  BLE_INTERACTIVE: "ble-interactive",
  BLE_RELAY: "ble-relay",
  FILE_DELAY_TOLERANT: "file-delay-tolerant",
  GATEWAY_SERIAL: "gateway-serial"
};

const DEFAULT_POLICY = {
  retryCount: 3,
  retryDelayMs: 400,
  outboxRetryIntervalMs: 3_000,
  ackTimeoutMs: 4_000
};

const POLICIES = {
  [TRANSPORT_CLASS.BLE_INTERACTIVE]: {
    retryCount: 4,
    retryDelayMs: 350,
    outboxRetryIntervalMs: 2_000,
    ackTimeoutMs: 3_500
  },
  [TRANSPORT_CLASS.BLE_RELAY]: {
    retryCount: 5,
    retryDelayMs: 500,
    outboxRetryIntervalMs: 3_000,
    ackTimeoutMs: 4_500
  },
  [TRANSPORT_CLASS.FILE_DELAY_TOLERANT]: {
    retryCount: 2,
    retryDelayMs: 2_000,
    outboxRetryIntervalMs: 10_000,
    ackTimeoutMs: 10_000
  },
  [TRANSPORT_CLASS.GATEWAY_SERIAL]: {
    retryCount: 6,
    retryDelayMs: 700,
    outboxRetryIntervalMs: 4_000,
    ackTimeoutMs: 5_000
  }
};

export function getRetryPolicy(transportClass) {
  return {
    ...DEFAULT_POLICY,
    ...(POLICIES[transportClass] ?? {})
  };
}
