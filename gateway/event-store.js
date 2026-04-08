import fs from "node:fs";
import path from "node:path";

export class GatewayEventStore {
  constructor({ filePath = null, logger = console } = {}) {
    this.filePath = filePath;
    this.logger = logger;

    this.events = [];
    this.eventIndex = new Map();
    this.lineOffsets = [];
    this.lineLengths = [];
    this.pendingRecords = new Map();
    this.totalEvents = 0;
    this.newestStoredAt = null;
    this.logicalSize = 0;
    this.writeFailure = null;
    this.writeChain = Promise.resolve();

    if (this.filePath) {
      this.#ensureDataFile();
      this.#loadFromDisk();
    }
  }

  append(event) {
    if (!event?.eventId) {
      throw new Error("GatewayEventStore.append requires eventId");
    }
    if (this.writeFailure) {
      throw new Error(`GatewayEventStore persistence unavailable: ${this.writeFailure.message}`);
    }

    const existingOrdinal = this.eventIndex.get(event.eventId);
    if (existingOrdinal !== undefined) {
      return {
        inserted: false,
        event: this.filePath ? this.#readPersistentRecord(existingOrdinal) : this.events[existingOrdinal]
      };
    }

    const record = {
      ...event,
      storedAt: event.storedAt ?? Date.now()
    };

    const ordinal = this.totalEvents;
    this.eventIndex.set(record.eventId, ordinal);
    this.totalEvents += 1;
    this.newestStoredAt = record.storedAt;

    if (!this.filePath) {
      this.events.push(record);
      return { inserted: true, event: record };
    }

    const payload = `${JSON.stringify(record)}\n`;
    const byteLength = Buffer.byteLength(payload, "utf8");

    this.lineOffsets.push(this.logicalSize);
    this.lineLengths.push(byteLength);
    this.logicalSize += byteLength;
    this.pendingRecords.set(ordinal, record);

    this.#queueAppend({ ordinal, payload });

    return { inserted: true, event: record };
  }

  listSince(cursor = 0) {
    const normalizedCursor = Number.isFinite(cursor) && cursor > 0 ? cursor : 0;
    if (!this.filePath) {
      return this.events.slice(normalizedCursor);
    }

    const records = [];
    for (let ordinal = normalizedCursor; ordinal < this.totalEvents; ordinal += 1) {
      records.push(this.#readPersistentRecord(ordinal));
    }
    return records;
  }

  snapshot() {
    return {
      totalEvents: this.filePath ? this.totalEvents : this.events.length,
      newestStoredAt: this.newestStoredAt,
      persistencePath: this.filePath
    };
  }

  async flush() {
    await this.writeChain;
    if (this.writeFailure) {
      throw new Error(`GatewayEventStore persistence unavailable: ${this.writeFailure.message}`);
    }
  }

  #queueAppend({ ordinal, payload }) {
    this.writeChain = this.writeChain.then(async () => {
      if (this.writeFailure) return;
      try {
        await fs.promises.appendFile(this.filePath, payload, "utf8");
        this.pendingRecords.delete(ordinal);
      } catch (error) {
        this.writeFailure = error;
        this.logger.error?.(`[GatewayEventStore] append failed for ${this.filePath}: ${error.message}`);
      }
    });
  }

  #readPersistentRecord(ordinal) {
    const pending = this.pendingRecords.get(ordinal);
    if (pending) {
      return pending;
    }

    const offset = this.lineOffsets[ordinal];
    const length = this.lineLengths[ordinal];
    const fd = fs.openSync(this.filePath, "r");
    try {
      const buffer = Buffer.alloc(length);
      fs.readSync(fd, buffer, 0, length, offset);
      const line = buffer.toString("utf8").trimEnd();
      return JSON.parse(line);
    } finally {
      fs.closeSync(fd);
    }
  }

  #ensureDataFile() {
    const dirPath = path.dirname(this.filePath);
    fs.mkdirSync(dirPath, { recursive: true });
    if (!fs.existsSync(this.filePath)) {
      fs.writeFileSync(this.filePath, "", "utf8");
    }
  }

  #loadFromDisk() {
    const raw = fs.readFileSync(this.filePath, "utf8");
    if (!raw) return;

    const hasFinalNewline = raw.endsWith("\n");
    const lines = raw.split("\n");
    if (hasFinalNewline) {
      lines.pop();
    }

    let consumedBytes = 0;
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      if (!line) {
        consumedBytes += 1;
        continue;
      }

      try {
        const parsed = JSON.parse(line);
        const lineByteLength = Buffer.byteLength(line, "utf8") + 1;
        if (parsed?.eventId && !this.eventIndex.has(parsed.eventId)) {
          const ordinal = this.totalEvents;
          this.eventIndex.set(parsed.eventId, ordinal);
          this.lineOffsets.push(consumedBytes);
          this.lineLengths.push(lineByteLength);
          this.totalEvents += 1;
          this.newestStoredAt = parsed.storedAt ?? this.newestStoredAt;
        }
        consumedBytes += lineByteLength;
      } catch (error) {
        fs.truncateSync(this.filePath, consumedBytes);
        this.logger.warn?.(
          `[GatewayEventStore] truncated corrupt record in ${this.filePath} at line ${index + 1}: ${error.message}`
        );
        break;
      }
    }

    this.logicalSize = consumedBytes;
  }
}

export default GatewayEventStore;
