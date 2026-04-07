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
        this._onWriteRequest(CHARACTERISTICS.MESSAGE_TX, bytes, {
          offset,
          withoutResponse
        });
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
  constructor({ onSubscribe = null, onUnsubscribe = null, onNotifyError = null } = {}) {
    super({
      uuid: RX_UUID,
      properties: ["notify"]
    });
    this._updateValueCallback = null;
    this._onSubscribe = onSubscribe;
    this._onUnsubscribe = onUnsubscribe;
    this._onNotifyError = onNotifyError;
  }

  onSubscribe(maxValueSize, updateValueCallback) {
    this._updateValueCallback = updateValueCallback;
    if (this._onSubscribe) {
      this._onSubscribe(maxValueSize);
    }
  }

  onUnsubscribe() {
    this._updateValueCallback = null;
    if (this._onUnsubscribe) {
      this._onUnsubscribe();
    }
  }

  /**
   * Send data to the subscribed central.
   * @param {Uint8Array} data
   * @returns {boolean} true if sent
   */
  notify(data) {
    if (!this._updateValueCallback) return false;
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    try {
      this._updateValueCallback(buf);
      return true;
    } catch (error) {
      if (this._onNotifyError) {
        this._onNotifyError(error);
      }
      return false;
    }
  }
}

// ─── BlenoBackend ─────────────────────────────────────────────────────────────

/**
 * IGATTBackend implementation using @abandonware/bleno.
 *
 * The constructor is cheap; call startAdvertising() to bring up the radio.
 */
export class BlenoBackend {
  constructor(options = {}) {
    /** @type {MessageRxCharacteristic|null} */
    this._rxChar = null;

    /** @type {string|null} — address of the currently connected central */
    this._clientId = null;

    this._diagnosticsEnabled = options.diagnosticsEnabled === true;
    this._logger = options.logger ?? console;

    // Assigned by GATTServer._wireBackendCallbacks()
    this.onWriteRequest = null;
    this.onClientConnected = null;
    this.onClientDisconnected = null;

    this._advertisingPromise = null;

    this._boundAccept = (clientAddress) => {
      this._clientId = clientAddress;
      console.log("[BlenoBackend] Central connected:", clientAddress);
      this._diag(`accept client=${clientAddress}`);
      if (this.onClientConnected) this.onClientConnected(clientAddress);
    };

    this._boundDisconnect = (clientAddress) => {
      const id = clientAddress || this._clientId;
      this._clientId = null;
      console.log("[BlenoBackend] Central disconnected:", id);
      this._diag(`disconnect client=${id ?? "unknown"}`);
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
        this._diag(`stateChange=${state} -> setup service`);
        this._setupService(serviceUuid, name, resolve, reject);
      };

      if (bleno.state === "poweredOn") {
        this._diag("state=poweredOn (immediate setup)");
        this._setupService(serviceUuid, name, resolve, reject);
      } else {
        this._diag(`waiting for poweredOn (current state=${bleno.state})`);
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
        this._diag("advertising stopped");
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
      this._diag(`notify failed client=${clientId} reason=no-subscriber-or-callback-error bytes=${data.byteLength}`);
      return Promise.reject(new Error("[BlenoBackend] notifyCharacteristic failed: no subscriber or callback error"));
    }
    this._diag(`notify ok client=${clientId} bytes=${data.byteLength}`);

    return Promise.resolve();
  }

  // ─── Internal helpers ───────────────────────────────────────────────────────

  _setupService(serviceUuid, name, resolve, reject) {
    this._rxChar = new MessageRxCharacteristic({
      onSubscribe: (maxValueSize) => {
        this._diag(`subscribe client=${this._clientId ?? "unknown"} maxValueSize=${maxValueSize}`);
      },
      onUnsubscribe: () => {
        this._diag(`unsubscribe client=${this._clientId ?? "unknown"}`);
      },
      onNotifyError: (error) => {
        const message = error instanceof Error ? error.message : String(error);
        this._diag(`notify callback error client=${this._clientId ?? "unknown"} error=${message}`);
      }
    });

    const txChar = new MessageTxCharacteristic((charUuid, bytes, meta = {}) => {
      this._diag(
        `write client=${this._clientId ?? "unknown"} char=${charUuid} bytes=${bytes.byteLength} withoutResponse=${meta.withoutResponse === true}`
      );
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
        this._diag(`advertising name=${name} service=${serviceUuid}`);
        resolve();
      });
    });
  }

  _diag(message) {
    if (!this._diagnosticsEnabled) {
      return;
    }
    this._logger.log(`[BlenoBackend][diag] ${message}`);
  }
}

export default BlenoBackend;
