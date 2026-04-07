/**
 * Lifeline Mesh - ESP32-C3 LoRa Firmware
 *
 * Target hardware:
 *   - ESP32-C3 (RISC-V, WiFi + BLE)
 *   - SX1276/SX1278 LoRa module (SPI)
 *   - USB-C with native USB support (CDC ACM)
 *
 * Features:
 *   - WebUSB CDC ACM interface for browser-side control via Web Serial API
 *   - Meshtastic-compatible serial framing protocol (JSON payload)
 *   - LoRa LongFast preset (SF9 / BW125 / CR4-5 / 915 MHz or 868 MHz)
 *   - MTU: 200 bytes per LoRa packet
 *   - Half-duplex radio management (TX/RX switching)
 *   - LED status indicators (connecting, TX, RX, error)
 *
 * Serial Protocol (from PROTOCOL.md §Relay and Mesh Routing):
 *   Frame: [START1=0x94][START2=0xc3][LEN_MSB][LEN_LSB][JSON payload]
 *   Payload kinds:
 *     ToRadio:   { kind: "lora-chunk", transferId, seq, total, data: "<b64>" }
 *     FromRadio: { kind: "lora-chunk", transferId, seq, total, data: "<b64>", rssi, snr }
 *     ACK:       { kind: "lora-ack", transferId }
 *     Status:    { kind: "status", rssi, snr, freqError, state }
 *
 * Dependencies (Arduino Library Manager):
 *   - RadioLib by Jan Gromeš (https://github.com/jgromes/RadioLib) >= 6.0.0
 *   - ArduinoJson by Benoit Blanchon >= 6.21.0
 *
 * Board configuration:
 *   - Arduino IDE: Tools → Board → ESP32C3 Dev Module
 *   - USB CDC On Boot: Enabled
 *   - Flash Mode: DIO
 *
 * Pin mapping (adjust for your specific board):
 *   NSS  = 7   (SPI chip select)
 *   DIO0 = 6   (LoRa interrupt)
 *   RST  = 5   (LoRa reset)
 *   BUSY = 4   (LoRa busy — SX126x only)
 *   SCK  = 8   MISO = 2   MOSI = 3
 *
 * @file lifeline-esp32.ino
 * @version 1.0.0
 */

#include <Arduino.h>
#include <RadioLib.h>
#include <ArduinoJson.h>
#include <SPI.h>

// ─── Pin Definitions ─────────────────────────────────────────────────────────

#define LORA_NSS   7
#define LORA_DIO0  6
#define LORA_RST   5
#define LORA_BUSY  4   // SX126x only; set -1 for SX127x
#define SPI_SCK    8
#define SPI_MISO   2
#define SPI_MOSI   3
#define LED_PIN    21  // Onboard LED (active HIGH)

// ─── LoRa Configuration (LongFast preset) ────────────────────────────────────

#define LORA_FREQ         915.0   // MHz (change to 868.0 for EU)
#define LORA_BW           125.0   // kHz
#define LORA_SF           9       // Spreading Factor 9 (LongFast)
#define LORA_CR           5       // Coding Rate 4/5
#define LORA_SYNC_WORD    0x34    // Meshtastic sync word
#define LORA_TX_POWER     20      // dBm (max for SX1278)
#define LORA_PREAMBLE_LEN 8
#define LORA_MTU          200     // bytes — max payload per packet

// ─── Serial Framing ──────────────────────────────────────────────────────────

#define FRAME_START1  0x94
#define FRAME_START2  0xC3
#define FRAME_BUF_LEN 4096

// ─── Radio Instance ──────────────────────────────────────────────────────────

// Use SX1276 — change to SX1278, SX1268, etc. as appropriate for your module
SX1276 radio = new Module(LORA_NSS, LORA_DIO0, LORA_RST, LORA_BUSY);

// ─── State ───────────────────────────────────────────────────────────────────

static uint8_t   rxFrame[FRAME_BUF_LEN];
static size_t    rxFrameLen = 0;
static bool      radioRxMode = true;
static volatile bool rxFlag = false;

// ─── Radio ISR ───────────────────────────────────────────────────────────────

void IRAM_ATTR onRadioRx() {
  rxFlag = true;
}

// ─── LED helpers ─────────────────────────────────────────────────────────────

void ledOn()  { digitalWrite(LED_PIN, HIGH); }
void ledOff() { digitalWrite(LED_PIN, LOW); }
void ledBlink(int n, int ms = 80) {
  for (int i = 0; i < n; i++) {
    ledOn();  delay(ms);
    ledOff(); delay(ms);
  }
}

// ─── Serial framing helpers ──────────────────────────────────────────────────

/**
 * Write a JSON object as a Meshtastic-compatible serial frame.
 * Frame: [0x94][0xC3][LEN_MSB][LEN_LSB][UTF-8 JSON]
 */
void writeFrame(const JsonDocument& doc) {
  String json;
  serializeJson(doc, json);
  uint16_t len = json.length();
  Serial.write(FRAME_START1);
  Serial.write(FRAME_START2);
  Serial.write((len >> 8) & 0xFF);
  Serial.write(len & 0xFF);
  Serial.print(json);
  Serial.flush();
}

/**
 * Send a status update frame to the host.
 * Includes last RSSI/SNR if available.
 */
void sendStatus(const char* state, float rssi = 0.0f, float snr = 0.0f) {
  StaticJsonDocument<256> doc;
  doc["kind"] = "status";
  doc["state"] = state;
  if (rssi != 0.0f) doc["rssi"] = rssi;
  if (snr != 0.0f) doc["snr"] = snr;
  writeFrame(doc);
}

/**
 * Send an ACK frame to the host.
 */
void sendAck(const char* transferId) {
  StaticJsonDocument<128> doc;
  doc["kind"] = "lora-ack";
  doc["transferId"] = transferId;
  writeFrame(doc);
}

/**
 * Forward a received LoRa packet to the host as a lora-chunk frame.
 */
void forwardLoRaPacket(uint8_t* data, size_t len, float rssi, float snr) {
  // Base64 encode the raw payload
  const char* b64chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  String b64;
  b64.reserve(((len + 2) / 3) * 4 + 4);
  for (size_t i = 0; i < len; i += 3) {
    uint8_t a = data[i];
    uint8_t b = i + 1 < len ? data[i + 1] : 0;
    uint8_t c = i + 2 < len ? data[i + 2] : 0;
    b64 += b64chars[(a >> 2) & 0x3F];
    b64 += b64chars[((a << 4) | (b >> 4)) & 0x3F];
    b64 += (i + 1 < len) ? b64chars[((b << 2) | (c >> 6)) & 0x3F] : '=';
    b64 += (i + 2 < len) ? b64chars[c & 0x3F] : '=';
  }

  // Parse the JSON payload from the LoRa packet to extract transferId
  DynamicJsonDocument rxDoc(1024);
  String jsonStr((char*)data, len);
  DeserializationError err = deserializeJson(rxDoc, jsonStr);

  StaticJsonDocument<512> outDoc;
  outDoc["kind"] = "lora-chunk";
  outDoc["rssi"] = rssi;
  outDoc["snr"] = snr;

  if (!err && rxDoc.containsKey("transferId")) {
    outDoc["transferId"] = rxDoc["transferId"].as<String>();
    outDoc["seq"] = rxDoc["seq"] | 0;
    outDoc["total"] = rxDoc["total"] | 1;
    outDoc["data"] = rxDoc["data"].as<String>();
  } else {
    // Raw packet — wrap as single-chunk with generated transferId
    char tid[32];
    snprintf(tid, sizeof(tid), "raw-%lu", millis());
    outDoc["transferId"] = tid;
    outDoc["seq"] = 0;
    outDoc["total"] = 1;
    outDoc["data"] = b64;
  }

  writeFrame(outDoc);
}

// ─── LoRa TX ─────────────────────────────────────────────────────────────────

/**
 * Transmit a base64-decoded payload over LoRa.
 * Returns true on success.
 */
bool transmitLoRa(const char* b64data) {
  // Base64 decode
  static uint8_t txBuf[LORA_MTU];
  size_t txLen = 0;
  const char* p = b64data;
  uint8_t tmp[4];
  int idx = 0;

  while (*p) {
    char c = *p++;
    uint8_t v;
    if (c >= 'A' && c <= 'Z') v = c - 'A';
    else if (c >= 'a' && c <= 'z') v = c - 'a' + 26;
    else if (c >= '0' && c <= '9') v = c - '0' + 52;
    else if (c == '+') v = 62;
    else if (c == '/') v = 63;
    else if (c == '=') break;
    else continue;
    tmp[idx++] = v;
    if (idx == 4) {
      if (txLen + 3 > LORA_MTU) break;
      txBuf[txLen++] = (tmp[0] << 2) | (tmp[1] >> 4);
      txBuf[txLen++] = (tmp[1] << 4) | (tmp[2] >> 2);
      txBuf[txLen++] = (tmp[2] << 6) | tmp[3];
      idx = 0;
    }
  }
  // Flush remaining
  if (idx >= 2) txBuf[txLen++] = (tmp[0] << 2) | (tmp[1] >> 4);
  if (idx >= 3) txBuf[txLen++] = (tmp[1] << 4) | (tmp[2] >> 2);

  if (txLen == 0) return false;

  // Switch to TX mode
  ledOn();
  int state = radio.transmit(txBuf, txLen);
  ledOff();

  // Re-enable RX after TX
  radio.startReceive();
  radioRxMode = true;

  return state == RADIOLIB_ERR_NONE;
}

// ─── Serial frame parser ─────────────────────────────────────────────────────

/**
 * Parse and dispatch a complete serial frame from the host.
 * Handles lora-chunk (transmit) and other control messages.
 */
void dispatchFrame(uint8_t* payload, uint16_t len) {
  DynamicJsonDocument doc(1024);
  DeserializationError err = deserializeJson(doc, (char*)payload, len);
  if (err) {
    sendStatus("error:json-parse");
    return;
  }

  const char* kind = doc["kind"] | "";

  if (strcmp(kind, "lora-chunk") == 0) {
    const char* transferId = doc["transferId"] | "unknown";
    const char* data = doc["data"] | "";

    if (strlen(data) == 0) {
      sendStatus("error:empty-data");
      return;
    }

    // Re-serialize chunk as JSON to transmit over LoRa (preserving framing)
    String chunkJson;
    serializeJson(doc, chunkJson);
    uint8_t* rawPayload = (uint8_t*)chunkJson.c_str();
    size_t rawLen = chunkJson.length();

    if (rawLen > LORA_MTU) {
      sendStatus("error:payload-too-large");
      return;
    }

    ledOn();
    int txState = radio.transmit(rawPayload, rawLen);
    ledOff();
    radio.startReceive();
    radioRxMode = true;

    if (txState == RADIOLIB_ERR_NONE) {
      sendAck(transferId);
    } else {
      sendStatus("error:tx-failed");
    }
    return;
  }

  if (strcmp(kind, "get-status") == 0) {
    sendStatus("idle");
    return;
  }

  sendStatus("error:unknown-kind");
}

// ─── Setup ───────────────────────────────────────────────────────────────────

void setup() {
  Serial.begin(921600);
  while (!Serial && millis() < 3000) delay(10); // Wait for USB enumeration

  pinMode(LED_PIN, OUTPUT);
  ledBlink(3, 100); // Startup indicator

  // Initialize SPI
  SPI.begin(SPI_SCK, SPI_MISO, SPI_MOSI, LORA_NSS);

  // Initialize LoRa radio
  int state = radio.begin(
    LORA_FREQ,
    LORA_BW,
    LORA_SF,
    LORA_CR,
    LORA_SYNC_WORD,
    LORA_TX_POWER,
    LORA_PREAMBLE_LEN
  );

  if (state != RADIOLIB_ERR_NONE) {
    // Radio init failed — blink error pattern
    while (true) {
      ledBlink(5, 50);
      delay(500);
    }
  }

  // Set RX interrupt callback
  radio.setDio0Action(onRadioRx, RISING);

  // Start in RX mode
  radio.startReceive();
  radioRxMode = true;

  sendStatus("ready");
  ledBlink(2, 200); // Ready indicator
}

// ─── Main Loop ───────────────────────────────────────────────────────────────

// Serial receive state machine
static uint8_t  serialBuf[FRAME_BUF_LEN];
static size_t   serialBufPos = 0;
static enum { WAIT_START1, WAIT_START2, READ_LEN_MSB, READ_LEN_LSB, READ_PAYLOAD }
  serialState = WAIT_START1;
static uint16_t serialPayloadLen = 0;
static uint16_t serialPayloadPos = 0;

void loop() {
  // ── Handle received LoRa packet ──────────────────────────────────────────
  if (rxFlag) {
    rxFlag = false;
    radioRxMode = false;

    uint8_t rxBuf[LORA_MTU + 4];
    size_t rxLen = 0;
    int state = radio.readData(rxBuf, sizeof(rxBuf));

    if (state == RADIOLIB_ERR_NONE) {
      rxLen = radio.getPacketLength();
      float rssi = radio.getRSSI();
      float snr  = radio.getSNR();

      ledBlink(1, 30); // RX indicator
      forwardLoRaPacket(rxBuf, rxLen, rssi, snr);
    }

    // Re-arm RX
    radio.startReceive();
    radioRxMode = true;
  }

  // ── Parse incoming serial frames from host ───────────────────────────────
  while (Serial.available() > 0) {
    uint8_t byte = Serial.read();

    switch (serialState) {
      case WAIT_START1:
        if (byte == FRAME_START1) serialState = WAIT_START2;
        break;

      case WAIT_START2:
        if (byte == FRAME_START2) serialState = READ_LEN_MSB;
        else serialState = WAIT_START1; // false start
        break;

      case READ_LEN_MSB:
        serialPayloadLen = (uint16_t)byte << 8;
        serialState = READ_LEN_LSB;
        break;

      case READ_LEN_LSB:
        serialPayloadLen |= byte;
        serialPayloadPos = 0;
        if (serialPayloadLen == 0 || serialPayloadLen > FRAME_BUF_LEN - 1) {
          serialState = WAIT_START1; // invalid length
        } else {
          serialState = READ_PAYLOAD;
        }
        break;

      case READ_PAYLOAD:
        serialBuf[serialPayloadPos++] = byte;
        if (serialPayloadPos >= serialPayloadLen) {
          serialBuf[serialPayloadPos] = '\0';
          dispatchFrame(serialBuf, serialPayloadLen);
          serialState = WAIT_START1;
          serialPayloadPos = 0;
          serialPayloadLen = 0;
        }
        break;
    }
  }

  // Small delay to prevent tight loop on empty buffers
  delay(1);
}
