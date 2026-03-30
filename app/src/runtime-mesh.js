import { MeshRouter } from '../../bluetooth/mesh-router.js';

export function createMeshRuntime(localPeerId = 'unknown') {
  const router = new MeshRouter({ localPeerId, defaultMaxHops: 1 });
  const state = {
    localPeerId,
    connectedPeerId: null,
    relayAttempts: 0,
    skipped: 0,
    lastRelay: null
  };

  const sync = () => {
    state.localPeerId = router.localPeerId;
  };

  return {
    router,
    state,
    setLocalPeerId(peerId) {
      router.localPeerId = peerId || 'unknown';
      sync();
    },
    onConnectionChange(connected, device) {
      const nextPeerId = connected ? (device?.id || null) : null;
      if (state.connectedPeerId && state.connectedPeerId !== nextPeerId) {
        router.removeNeighbor(state.connectedPeerId);
      }
      state.connectedPeerId = nextPeerId;
      if (state.connectedPeerId) {
        router.addNeighbor(state.connectedPeerId);
      }
    },
    async onForward({ message, ingressPeerId }) {
      state.relayAttempts += 1;

      if (!state.connectedPeerId) {
        state.skipped += 1;
        state.lastRelay = {
          action: 'skipped',
          reason: 'no-connected-peer',
          ingressPeerId,
          msgId: message?.msgId || null,
          at: Date.now()
        };
        return state.lastRelay;
      }

      // App runtime currently has a single active BLE link, and BLEManager
      // derives ingressPeerId from that same active device id.
      // Observability only: no distinct egress link exists in this runtime.
      state.skipped += 1;
      state.lastRelay = {
        action: 'skipped',
        reason: state.connectedPeerId === ingressPeerId
          ? 'ingress-only-link'
          : 'single-link-no-egress',
        ingressPeerId,
        msgId: message?.msgId || null,
        at: Date.now()
      };
      return state.lastRelay;
    },
    getSnapshot() {
      return {
        localPeerId: state.localPeerId,
        connectedPeerId: state.connectedPeerId,
        relayAttempts: state.relayAttempts,
        skipped: state.skipped,
        lastRelay: state.lastRelay,
        seenMessages: router.seenCount,
        neighborCount: router.neighbors.size,
        routeTable: router.getRouteTable()
      };
    }
  };
}
