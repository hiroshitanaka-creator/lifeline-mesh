import { BLEManager } from "../../bluetooth/ble-manager.js";
import { MeshRouter } from "../../bluetooth/mesh-router.js";

function safeNow(nowFn) {
  return typeof nowFn === "function" ? nowFn() : Date.now();
}

/**
 * Runtime mesh wiring helper for the app layer.
 * Keeps BLE manager/router integration focused and testable.
 */
export function createRuntimeMeshWiring(options = {}) {
  const {
    BLEManagerCtor = BLEManager,
    MeshRouterCtor = MeshRouter,
    transportManager = null,
    localPeerId = "unknown",
    now = null,
    onStateChange = null
  } = options;

  const router = new MeshRouterCtor({ localPeerId });
  const connectedManagers = new Map();

  const relayState = {
    localPeerId: router.localPeerId,
    connectedPeerIds: [],
    connectedPeerNames: [],
    seenTransfers: 0,
    forwardedCount: 0,
    droppedNoEgressCount: 0,
    lastRelayEvent: "idle",
    lastRelayAt: null,
    lastForwardedMsgId: null,
    lastIngressPeerId: null
  };

  function emitState() {
    relayState.seenTransfers = router.seenCount;
    relayState.connectedPeerIds = [...connectedManagers.keys()];
    relayState.connectedPeerNames = [...connectedManagers.values()]
      .map((manager) => manager?.device?.name || manager?.device?.id || "unknown");
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

  async function handleForward(message, ingressPeerId) {
    relayState.lastRelayAt = safeNow(now);
    relayState.lastForwardedMsgId = message?.msgId || null;
    relayState.lastIngressPeerId = ingressPeerId || null;

    const egressManagers = relayState.connectedPeerIds
      .filter((peerId) => peerId !== ingressPeerId)
      .map((peerId) => connectedManagers.get(peerId))
      .filter(Boolean);

    if (egressManagers.length < 1) {
      relayState.droppedNoEgressCount += 1;
      relayState.lastRelayEvent = "no-egress-peer";
      emitState();
      return;
    }

    for (const manager of egressManagers) {
      await manager.sendMessage(message);
      relayState.forwardedCount += 1;
    }
    relayState.lastRelayEvent = "forwarded";
    emitState();
  }

  function registerConnection(manager, connected, device) {
    const peerId = device?.id || manager?.device?.id || "unknown-peer";
    if (connected) {
      connectedManagers.set(peerId, manager);
    } else {
      connectedManagers.delete(peerId);
    }
    emitState();
  }

  function createBleManager(overrides = {}) {
    const manager = new BLEManagerCtor({
      ...overrides,
      transportManager,
      router
    });
    manager.onForward = (message, ingressPeerId) => handleForward(message, ingressPeerId);
    return manager;
  }

  emitState();

  return {
    relayState,
    router,
    createBleManager,
    handleForward,
    registerConnection,
    updateLocalPeerId
  };
}
