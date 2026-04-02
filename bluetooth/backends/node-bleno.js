/**
 * Lifeline Mesh - Node.js BLE Peripheral Backend (bleno)
 *
 * Implements IGATTBackend using @abandonware/bleno for Linux / Raspberry Pi.
 * Register with GATTServer via: server.setBackend(new BlenoBackend())
 *
 * Requires: @abandonware/bleno  (install in node-server/, not root)
 * Platform: Linux with BlueZ (tested on Raspberry Pi OS / Ubuntu)
 */

import bleno from "@abandonware/bleno";
import { CHARACTERISTICS } from "../constants.js";

// bleno requires UUIDs without hyphens
function bleUuid(uuid) {
  return uuid.replace(/-/g, "");
}

const TX_UUID = bleUuid(CHARACTERISTICS.MESSAGE_TX);
const RX_UUID = bleUuid(CHARACTERISTICS.MESSAGE_RX);

// ─── TX Characteristic (WriteWithoutResponse + Write) ────────────────────────

class MessageTxCharacteristic extends bleno.Characteristic {
  constructor(onWriteRequest) {
    super({
      uuid: TX_UUID,
      properties: ["write", "writeWithoutResponse"]
    });
    this._onWriteRequest = onWriteRequest;
  }

  onWriteRequest(data, offset, withoutResponse, callback) {
    try {
      // Normalise to Uint8Array regardless of whether bleno passes Buffer
      const bytes = data instanceof Uint8Array ? data : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
      if (this._onWriteRequest) {
        this._onWriteRequest(CHARACTERISTICS.MESSAGE_TX, bytes);
      }
      callback(this.RESULT_SUCCESS);
    } catch (err) {
      console.error("[BlenoBackend] TX write error:", err);
      callback(this.RESULT_UNLIKELY_ERROR);
    }
  }
}

// ─── RX Characteristic (Notify) ──────────────────────────────────────────────

class MessageRxCharacteristic extends bleno.Characteristic {
  constructor() {
    super({
      uuid: RX_UUID,
      properties: ["notify"]
    });
    this._updateValueCallback = null;
  }

  onSubscribe(_maxValueSize, updateValueCallback) {
    this._updateValueCallback = updateValueCallback;
  }

  onUnsubscribe() {
    this._updateValueCallback = null;
  }

  /**
   * Send data to the subscribed central.
   * @param {Uint8Array} data
   * @returns {boolean} true if sent
   */
  notify(data) {
    if (!this._updateValueCallback) return false;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    this._updateValueCallback(buf);
    return true;
  }
}

// ─── BlenoBackend ─────────────────────────────────────────────────────────────

/**
 * IGATTBackend implementation using @abandonware/bleno.
 *
 * The constructor is cheap; call startAdvertising() to bring up the radio.
 */
export class BlenoBackend {
  constructor() {
    /** @type {MessageRxCharacteristic|null} */
    this._rxChar = null;

    /** @type {string|null} — address of the currently connected central */
    this._clientId = null;

    // Assigned by GATTServer._wireBackendCallbacks()
    this.onWriteRequest = null;
    this.onClientConnected = null;
    this.onClientDisconnected = null;

    this._advertisingPromise = null;
    this._stopPromise = null;

    this._boundAccept = (clientAddress) => {
      this._clientId = clientAddress;
      console.log("[BlenoBackend] Central connected:", clientAddress);
      if (this.onClientConnected) this.onClientConnected(clientAddress);
    };

    this._boundDisconnect = (clientAddress) => {
      const id = clientAddress || this._clientId;
      this._clientId = null;
      console.log("[BlenoBackend] Central disconnected:", id);
      if (id && this.onClientDisconnected) this.onClientDisconnected(id);
    };
  }

  // ─── IGATTBackend API ───────────────────────────────────────────────────────

  /**
   * Start BLE advertisement so centrals can discover and connect.
   * @param {string} serviceUuid - Full UUID (with hyphens); bleno strips them internally.
   * @param {string} name        - Advertised device name.
   * @returns {Promise<void>}
   */
  startAdvertising(serviceUuid, name) {
    if (this._advertisingPromise) return this._advertisingPromise;

    this._advertisingPromise = new Promise((resolve, reject) => {
      const onStateChange = (state) => {
        if (state !== "poweredOn") return; // wait for radio
        bleno.removeListener("stateChange", onStateChange);
        this._setupService(serviceUuid, name, resolve, reject);
      };

      if (bleno.state === "poweredOn") {
        this._setupService(serviceUuid, name, resolve, reject);
      } else {
        bleno.on("stateChange", onStateChange);
      }

      bleno.removeListener("accept", this._boundAccept);
      bleno.removeListener("disconnect", this._boundDisconnect);
      bleno.on("accept", this._boundAccept);
      bleno.on("disconnect", this._boundDisconnect);
    });

    return this._advertisingPromise;
  }

  /**
   * Stop advertisement and disconnect the active client.
   * @returns {Promise<void>}
   */
  stopAdvertising() {
    return new Promise((resolve) => {
      bleno.stopAdvertising(() => {
        this._advertisingPromise = null;
        this._clientId = null;
        bleno.removeListener("accept", this._boundAccept);
        bleno.removeListener("disconnect", this._boundDisconnect);
        console.log("[BlenoBackend] Advertising stopped");
        resolve();
      });
    });
  }

  /**
   * Send data to the connected central via RX notify.
   * @param {string}     clientId  - Must match the active connected central.
   * @param {string}     charUuid  - Must be CHARACTERISTICS.MESSAGE_RX.
   * @param {Uint8Array} data
   * @returns {Promise<void>}
   */
  notifyCharacteristic(clientId, charUuid, data) {
    if (charUuid !== CHARACTERISTICS.MESSAGE_RX) {
      return Promise.resolve();
    }
    if (!this._rxChar) {
      return Promise.reject(new Error("[BlenoBackend] RX characteristic not initialised"));
    }
    if (!this._clientId || this._clientId !== clientId) {
      return Promise.reject(new Error(`[BlenoBackend] Unknown client: ${clientId}`));
    }

    const sent = this._rxChar.notify(data);
    if (!sent) {
      console.warn("[BlenoBackend] notifyCharacteristic: no subscriber");
    }
    return Promise.resolve();
  }

  // ─── Internal helpers ───────────────────────────────────────────────────────

  _setupService(serviceUuid, name, resolve, reject) {
    this._rxChar = new MessageRxCharacteristic();

    const txChar = new MessageTxCharacteristic((charUuid, bytes) => {
      // Forward to GATTServer; supply the connected client's address as clientId
      if (this.onWriteRequest) {
        this.onWriteRequest(this._clientId ?? "unknown", charUuid, bytes);
      }
    });

    const service = new bleno.PrimaryService({
      uuid: bleUuid(serviceUuid),
      characteristics: [txChar, this._rxChar]
    });

    bleno.setServices([service], (err) => {
      if (err) {
        reject(new Error(`[BlenoBackend] setServices failed: ${err}`));
        return;
      }
      bleno.startAdvertising(name, [bleUuid(serviceUuid)], (adErr) => {
        if (adErr) {
          reject(new Error(`[BlenoBackend] startAdvertising failed: ${adErr}`));
          return;
        }
        console.log("[BlenoBackend] Advertising as", name, "service", serviceUuid);
        resolve();
      });
    });
  }
}

export default BlenoBackend;
