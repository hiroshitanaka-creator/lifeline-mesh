import http from "node:http";

import { GatewayBridge } from "./bridge.js";

const DEFAULT_MAX_BODY_BYTES = 256 * 1024;

class PayloadTooLargeError extends Error {
  constructor(message = "payload-too-large") {
    super(message);
    this.name = "PayloadTooLargeError";
  }
}

function jsonResponse(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

async function readJsonBody(req, { maxBytes = DEFAULT_MAX_BODY_BYTES } = {}) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      throw new PayloadTooLargeError();
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

export function createGatewayService({ bridge } = {}) {
  const gatewayBridge = bridge ?? new GatewayBridge({ islandId: "default-island" });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === "GET" && req.url === "/health") {
        return jsonResponse(res, 200, { ok: true, mode: "gateway-bridge" });
      }

      if (req.method === "POST" && req.url === "/gateway/local-ingest") {
        const body = await readJsonBody(req);
        const result = gatewayBridge.ingestLocalMesh(body.event, { ingressTransport: body.ingressTransport ?? "mesh" });
        return jsonResponse(res, 200, { inserted: result.inserted, eventId: body.event?.eventId ?? null });
      }

      if (req.method === "POST" && req.url === "/gateway/backhaul-ingest") {
        const body = await readJsonBody(req);
        const result = gatewayBridge.ingestBackhaul(body.event, { ingressTransport: body.ingressTransport ?? "backhaul" });
        return jsonResponse(res, 200, result);
      }

      if (req.method === "GET" && req.url?.startsWith("/gateway/export")) {
        const baseUrl = `http://localhost${req.url}`;
        const cursorRaw = Number(new URL(baseUrl).searchParams.get("cursor") ?? "0");
        return jsonResponse(res, 200, gatewayBridge.exportBackhaulBatch({ cursor: cursorRaw }));
      }

      if (req.method === "GET" && req.url === "/gateway/snapshot") {
        return jsonResponse(res, 200, gatewayBridge.snapshot());
      }

      return jsonResponse(res, 404, { error: "not-found" });
    } catch (error) {
      if (error instanceof PayloadTooLargeError) {
        return jsonResponse(res, 413, { error: error.message });
      }
      return jsonResponse(res, 400, {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  });

  return {
    bridge: gatewayBridge,
    server,
    listen(port = 0) {
      return new Promise((resolve) => {
        server.listen(port, () => {
          resolve(server.address());
        });
      });
    },
    close() {
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) return reject(error);
          resolve();
        });
      });
    }
  };
}

export default createGatewayService;
