import { MeshRouter } from "../../bluetooth/mesh-router.js";

/**
 * Single-link runtime mesh wiring for the current app architecture.
 * The app currently maintains one active BLEManager connection.
 */
export function createRuntimeMeshWiring(options = {}) {
  const {
    localPeerId = "unknown",
    defaultMaxHops = 1,
    onStateChange = null,
    now = () => Date.now()
  } = options;

  const router = new MeshRouter({ localPeerId, defaultMaxHops });

  const relayState = {
    localPeerId: router.localPeerId,
    connectedPeerId: null,
    connectedPeerName: null,
    seenTransfers: 0,
    relayForwardedCount: 0,
    relayNoEgressCount: 0,
    lastRelayEvent: "idle",
    lastForwardedMsgId: null,
    lastIngressPeerId: null,
    lastRelayAt: null
  };

  function emitState() {
    relayState.seenTransfers = router.seenCount;
    if (onStateChange) {
      onStateChange({ ...relayState });
    }
  }

  function updateLocalPeerId(nextPeerId) {
    if (!nextPeerId || typeof nextPeerId !== "string") {
      return;
    }
    router.localPeerId = nextPeerId;
    relayState.localPeerId = nextPeerId;
    emitState();
  }

  function onConnectionChange(connected, device) {
    relayState.connectedPeerId = connected ? (device?.id || "unknown-peer") : null;
    relayState.connectedPeerName = connected ? (device?.name || device?.id || "unknown") : null;
    emitState();
  }

  async function onForward(message, ingressPeerId) {
    relayState.lastRelayAt = now();
    relayState.lastForwardedMsgId = message?.msgId || null;
    relayState.lastIngressPeerId = ingressPeerId || null;

    // Current runtime is single-link BLE. If ingress is the same active peer,
    // there is no safe BLE egress peer to forward to.
    if (!relayState.connectedPeerId || relayState.connectedPeerId === ingressPeerId) {
      relayState.relayNoEgressCount += 1;
      relayState.lastRelayEvent = "no-egress-peer";
      emitState();
      return;
    }

    relayState.relayForwardedCount += 1;
    relayState.lastRelayEvent = "forwarded";
    emitState();
  }

  emitState();

  return {
    router,
    relayState,
    updateLocalPeerId,
    onConnectionChange,
    onForward
  };
}
