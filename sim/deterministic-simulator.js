export function createSeededRng(seed = 1) {
  let state = seed >>> 0;
  return function next() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

export function simulateThreeNodeRelay(options = {}) {
  const rng = createSeededRng(options.seed ?? 42);
  const rounds = options.rounds ?? 80;
  const dropRate = options.dropRate ?? 0.08;
  const replayRate = options.replayRate ?? 0.12;
  const nodes = {
    A: { inbox: [], seen: new Set(), sent: 0, delivered: 0, duplicatesDropped: 0 },
    B: { inbox: [], seen: new Set(), sent: 0, delivered: 0, duplicatesDropped: 0 },
    C: { inbox: [], seen: new Set(), sent: 0, delivered: 0, duplicatesDropped: 0 }
  };

  const queue = [];
  let nextMsgId = 1;

  function enqueue(src, dst, payload) {
    queue.push({ src, dst, payload: { ...payload } });
  }

  enqueue("A", "B", { msgId: `m-${nextMsgId++}`, body: "critical-1" });
  enqueue("B", "C", { msgId: `m-${nextMsgId++}`, body: "critical-2" });
  enqueue("A", "C", { msgId: `m-${nextMsgId++}`, body: "critical-3" });

  for (let i = 0; i < rounds && queue.length > 0; i += 1) {
    const idx = Math.floor(rng() * queue.length);
    const [edge] = queue.splice(idx, 1);

    if (rng() < dropRate) continue;

    nodes[edge.src].sent += 1;

    const target = nodes[edge.dst];
    if (target.seen.has(edge.payload.msgId)) {
      target.duplicatesDropped += 1;
      continue;
    }

    target.seen.add(edge.payload.msgId);
    target.inbox.push(edge.payload.msgId);
    target.delivered += 1;

    if (edge.dst === "B") {
      enqueue("B", "A", edge.payload);
      enqueue("B", "C", edge.payload);
    }

    if (rng() < replayRate) {
      enqueue(edge.src, edge.dst, edge.payload);
    }
  }

  const allDelivered = new Set([...nodes.A.inbox, ...nodes.B.inbox, ...nodes.C.inbox]);
  return {
    seed: options.seed ?? 42,
    rounds,
    dropRate,
    replayRate,
    uniqueDelivered: allDelivered.size,
    queueRemaining: queue.length,
    nodes
  };
}
