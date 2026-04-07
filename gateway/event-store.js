import fs from "node:fs";
import path from "node:path";

export class GatewayEventStore {
  constructor({ filePath = null, logger = console } = {}) {
    this.events = [];
    this.eventIndex = new Map();
    this.filePath = filePath;
    this.logger = logger;

    if (this.filePath) {
      this.#ensureDataFile();
      this.#loadFromDisk();
    }
  }

  append(event) {
    if (!event?.eventId) {
      throw new Error("GatewayEventStore.append requires eventId");
    }
    if (this.eventIndex.has(event.eventId)) {
      return { inserted: false, event: this.eventIndex.get(event.eventId) };
    }

    const record = {
      ...event,
      storedAt: event.storedAt ?? Date.now()
    };

    if (this.filePath) {
      fs.appendFileSync(this.filePath, `${JSON.stringify(record)}\n`, "utf8");
    }

    this.events.push(record);
    this.eventIndex.set(record.eventId, record);
    return { inserted: true, event: record };
  }

  listSince(cursor = 0) {
    const normalizedCursor = Number.isFinite(cursor) && cursor > 0 ? cursor : 0;
    return this.events.slice(normalizedCursor);
  }

  snapshot() {
    return {
      totalEvents: this.events.length,
      newestStoredAt: this.events.length > 0 ? this.events[this.events.length - 1].storedAt : null,
      persistencePath: this.filePath
    };
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
      const isLastLine = index === lines.length - 1;
      const isPartialTail = isLastLine && !hasFinalNewline;

      try {
        const parsed = JSON.parse(line);
        if (parsed?.eventId && !this.eventIndex.has(parsed.eventId)) {
          this.events.push(parsed);
          this.eventIndex.set(parsed.eventId, parsed);
        }
        consumedBytes += Buffer.byteLength(line, "utf8") + 1;
      } catch (error) {
        if (!isPartialTail) {
          throw new Error(`GatewayEventStore persistence is corrupt at line ${index + 1}: ${error.message}`);
        }
        fs.truncateSync(this.filePath, consumedBytes);
        this.logger.warn?.(`[GatewayEventStore] truncated partial record in ${this.filePath}`);
        return;
      }
    }
  }
}

export default GatewayEventStore;
