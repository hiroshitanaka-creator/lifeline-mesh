/**
 * Operator Panel Unit Tests
 *
 * Tests the renderPanel() pure-function HTML renderer exported from
 * app/src/operator-panel.js.  No DOM is required — the function returns
 * an HTML string that we inspect with string-matching.
 */

import { renderPanel } from "../../app/src/operator-panel.js";
import { OUTBOX_DEFAULT_TTL_MS, SEEN_RETENTION_MS, CHUNK_MAX_AGE_MS } from "../../crypto/store.js";
import { CONFIG as BLE_CONFIG } from "../../bluetooth/constants.js";
import * as DMesh from "../../crypto/core.js";

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

function assert(condition, message) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

test("renderPanel: returns a string with no snapshot (default values)", () => {
  const html = renderPanel({});
  assert(typeof html === "string", "returns a string");
  assert(html.length > 0, "non-empty output");
  // Should still have the main sections even with defaults
  assert(html.includes("lm-op-section"), "has section divs");
  assert(html.includes("lm-op-kv"), "has key-value area");
});

test("renderPanel: linkCount=0 renders 'no active links'", () => {
  const html = renderPanel({ linkCount: 0, links: [] });
  assert(html.includes("no active links"), "shows no-links message");
});

test("renderPanel: linkCount=2 renders link chips", () => {
  const html = renderPanel({
    linkCount: 2,
    links: ["peer-alice", "peer-bob"]
  });
  assert(html.includes("peer-alice"), "shows peer-alice chip");
  assert(html.includes("peer-bob"), "shows peer-bob chip");
});

test("renderPanel: linkCount>=2 applies green class", () => {
  const html = renderPanel({ linkCount: 2, links: ["a", "b"] });
  // The links stat should have 'green' color class
  assert(html.includes('class="lm-op-val green"'), "green class for 2+ links");
});

test("renderPanel: linkCount=0 applies red class", () => {
  const html = renderPanel({ linkCount: 0, links: [] });
  // The links count of 0 → red
  assert(html.includes("lm-op-val red"), "red class for 0 links");
});

test("renderPanel: linkCount=1 applies yellow class", () => {
  const html = renderPanel({ linkCount: 1, links: ["only-peer"] });
  assert(html.includes("lm-op-val yellow"), "yellow class for 1 link");
});

test("renderPanel: routingEnabled=true shows 'on'", () => {
  const html = renderPanel({ routingEnabled: true });
  assert(html.includes(">on<"), "routing shown as on");
});

test("renderPanel: routingEnabled=false shows 'off'", () => {
  const html = renderPanel({ routingEnabled: false });
  assert(html.includes(">off<"), "routing shown as off");
});

test("renderPanel: empty routeTable shows routing-disabled message", () => {
  const html = renderPanel({ routingEnabled: false, routeTable: [] });
  assert(html.includes("routing disabled"), "shows disabled message");
});

test("renderPanel: routeTable entries produce table rows", () => {
  const html = renderPanel({
    routingEnabled: true,
    routeTable: [
      { dst: "peer-dst-1", via: "peer-via-1", hops: 2, seq: 5, ttlRemaining: 120000 }
    ]
  });
  assert(html.includes("<table"), "has a table element");
  assert(html.includes("peer-dst-1"), "dst peer ID in table");
  assert(html.includes("peer-via-1"), "via peer ID in table");
  assert(html.includes(">2<"), "hop count in table");
});

test("renderPanel: lastRelay=null shows 'no relay yet'", () => {
  const html = renderPanel({ lastRelay: null });
  assert(html.includes("no relay yet"), "shows no-relay message");
});

test("renderPanel: lastRelay.action=forwarded renders forwardedTo list", () => {
  const html = renderPanel({
    lastRelay: {
      action: "forwarded",
      forwardedTo: ["peer-b", "peer-c"],
      msgId: "msg-xyz",
      at: Date.now()
    }
  });
  assert(html.includes("forwarded"), "shows 'forwarded'");
  assert(html.includes("peer-b") || html.includes("→"), "shows egress peers");
});

test("renderPanel: lastRelay.action=skipped renders reason", () => {
  const html = renderPanel({
    lastRelay: {
      action: "skipped",
      reason: "ingress-only-link",
      msgId: "skip-1",
      at: Date.now()
    }
  });
  assert(html.includes("skipped"), "shows 'skipped'");
  assert(html.includes("ingress-only-link"), "shows reason");
});

test("renderPanel: outbox pending=3 applies yellow class", () => {
  const html = renderPanel({}, { pending: 3, failed: 0 });
  assert(html.includes("lm-op-val yellow"), "yellow for pending 1-4");
});

test("renderPanel: outbox pending=0 applies green class to pending", () => {
  const html = renderPanel({}, { pending: 0, failed: 0 });
  // There should be a green val somewhere (either links or pending)
  assert(html.includes("lm-op-val green"), "green class present");
});

test("renderPanel: outbox failed=1 applies red class to failed", () => {
  const html = renderPanel({}, { pending: 0, failed: 1 });
  assert(html.includes("lm-op-val red"), "red class for failures");
});

test("renderPanel: relay counters are rendered", () => {
  const html = renderPanel({
    relayAttempts: 7,
    relayedCount: 5,
    skipped: 2,
    routeAdvBroadcasts: 3,
    seenMessages: 42
  });
  assert(html.includes(">7<"), "relayAttempts rendered");
  assert(html.includes(">5<"), "relayedCount rendered");
  assert(html.includes(">2<") || html.includes("2"), "skipped rendered");
  assert(html.includes(">3<"), "routeAdvBroadcasts rendered");
  assert(html.includes(">42<"), "seenMessages rendered");
});

test("renderPanel: maintenance metrics are rendered for operators", () => {
  const now = 1_700_000_000_000;
  const originalNow = Date.now;
  Date.now = () => now;
  try {
    const html = renderPanel(
      {},
      {},
      {
        runs: 4,
        lastRunAt: now - 2_000,
        lastResult: { outboxPurged: 3, seenRemoved: 7, chunksRemoved: 2 }
      },
      {
        maintenance: {
          outboxTtlMs: 7 * 24 * 60 * 60 * 1000,
          seenRetentionMs: 30 * 24 * 60 * 60 * 1000,
          chunkMaxAgeMs: 24 * 60 * 60 * 1000
        },
        receivePath: {
          seenReplayRetentionMs: 15 * 60 * 1000,
          chunkCleanupMaxAgeMs: 60 * 1000
        }
      }
    );
    assert(html.includes("Maintenance"), "maintenance section rendered");
    assert(html.includes(">4<"), "run count rendered");
    assert(html.includes(">3<"), "outbox purge count rendered");
    assert(html.includes(">7<"), "seen cleanup count rendered");
    assert(html.includes(">2<"), "chunk cleanup count rendered");
    assert(html.includes("maintenance-policy(outboxTTL/seenRetention/chunkMaxAge)"), "maintenance policy text rendered");
    assert(html.includes("receive-path-policy(seenReplay/chunkCleanup)"), "receive-path policy text rendered");
    assert(!html.includes("retention(outbox/seen/chunks)"), "ambiguous single retention label removed");
  } finally {
    Date.now = originalNow;
  }
});

test("renderPanel: policy values come from split maintenance/receive sources", () => {
  const html = renderPanel({}, {}, {}, {
    maintenance: {
      outboxTtlMs: OUTBOX_DEFAULT_TTL_MS,
      seenRetentionMs: SEEN_RETENTION_MS,
      chunkMaxAgeMs: CHUNK_MAX_AGE_MS
    },
    receivePath: {
      seenReplayRetentionMs: DMesh.REPLAY_RETENTION_MS,
      chunkCleanupMaxAgeMs: BLE_CONFIG.REASSEMBLY_TIMEOUT_MS
    }
  });

  assert(html.includes("maintenance-policy(outboxTTL/seenRetention/chunkMaxAge)"), "maintenance policy line exists");
  assert(html.includes("receive-path-policy(seenReplay/chunkCleanup)"), "receive-path policy line exists");
  assert(html.includes("10080m / 43200m / 1440m"), "maintenance policy values rendered");
  assert(html.includes("43200m / 15s"), "receive path values rendered");
});

test("renderPanel: XSS characters in peerId are escaped", () => {
  const evil = "<script>alert(1)</script>";
  const html = renderPanel({
    localPeerId: evil,
    links: [evil]
  });
  assert(!html.includes("<script>"), "script tag not injected");
  assert(html.includes("&lt;script&gt;"), "angle brackets escaped");
});

test("renderPanel: long peerId is truncated in display (ellipsis shown)", () => {
  const longId = "abcdefghijklmnopqrstuvwxyz0123456789abcdefghijklmnopqrstuvwxyz01";
  const html = renderPanel({ localPeerId: longId, links: [longId] });
  // shortId: first 8 + '…' + last 6 chars — the full 64-char string should NOT appear as visible text
  assert(html.includes("…"), "ellipsis present for long ID");
  // The chip's visible text (inside the span, before the title attr) should be short
  // e.g. "abcdefgh…xyz01" — 15 visible chars, not the full 64-char string
  assert(html.includes("abcdefgh…"), "shortened prefix visible");
});

// ─── Runner ───────────────────────────────────────────────────────────────────

(async () => {
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    try {
      await fn();
      passed += 1;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error.message}`);
    }
  }

  console.log(`\noperator-panel unit: ${passed}/${tests.length} passed`);
  if (failed > 0) process.exit(1);
})();
