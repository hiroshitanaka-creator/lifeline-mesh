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

      // App runtime currently has a single active BLE link.
      // BLEManager derives ingressPeerId from that same active device id,
      // so forwarding is always skipped as ingress-only in this topology.
      state.skipped += 1;
      state.lastRelay = {
        action: 'skipped',
        reason: 'ingress-only-link',
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
