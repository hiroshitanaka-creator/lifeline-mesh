/**
 * Single-client relay coordinator for node-server.
 *
 * Truthful design constraints:
 * - Only one active BLE central client at a time (enforced by GATTServer/backend).
 * - Received messages are persisted as pending relay entries.
 * - Pending entries are replayed only when a client connection exists.
 */
export class SingleClientRelayNode {
  constructor({ server, store, logger = console } = {}) {
    if (!server) {
      throw new Error("SingleClientRelayNode requires a GATTServer instance");
    }
    if (!store) {
      throw new Error("SingleClientRelayNode requires a persistent store instance");
    }

    this.server = server;
    this.store = store;
    this.logger = logger;
    this.flushPromise = null;
  }

  async init() {
    await this.store.init();
  }

  async onInboundMessage(message, clientId) {
    const entry = await this.store.addInboundMessage(message, clientId);
    this.logger.log(
      `[RelayNode] queued inbound message ${entry.msgId} from ${clientId}; awaiting next connected client for replay`
    );
  }

  async onClientConnected(clientId) {
    this.logger.log(`[RelayNode] client connected ${clientId}; replaying pending messages`);
    await this.flushPending(clientId);
  }

  async flushPending(clientId) {
    if (!clientId) return;

    if (this.flushPromise) {
      await this.flushPromise;
      return;
    }

    this.flushPromise = (async () => {
      const pending = await this.store.listPending();
      for (const entry of pending) {
        try {
          await this.server.sendMessage(entry.message, clientId);
          await this.store.markDelivered(entry.id, clientId);
          this.logger.log(`[RelayNode] replayed pending message ${entry.msgId} to ${clientId}`);
        } catch (error) {
          await this.store.markSendFailed(entry.id, error);
          this.logger.warn(
            `[RelayNode] replay failed for ${entry.msgId} to ${clientId}: ${error instanceof Error ? error.message : String(error)}`
          );
          break;
        }
      }
    })();

    try {
      await this.flushPromise;
    } finally {
      this.flushPromise = null;
    }
  }

  async getSnapshot() {
    const serverSnap = this.server.getSnapshot();
    const storeSnap = await this.store.getSnapshot();
    return {
      mode: "single-client-relay",
      server: serverSnap,
      store: storeSnap
    };
  }
}

export default SingleClientRelayNode;
