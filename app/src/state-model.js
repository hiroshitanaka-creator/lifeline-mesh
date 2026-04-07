export function mergeLwwRegister(current, candidate) {
  if (!current) return candidate;
  if (!candidate) return current;
  if ((candidate.ts || 0) > (current.ts || 0)) return candidate;
  if ((candidate.ts || 0) < (current.ts || 0)) return current;
  return String(candidate.authorFp || "").localeCompare(String(current.authorFp || "")) > 0 ? candidate : current;
}

export function orSetAdd(state, value, tag) {
  const next = state || { adds: {}, removes: {} };
  next.adds[value] = next.adds[value] || [];
  if (!next.adds[value].includes(tag)) {
    next.adds[value].push(tag);
  }
  return next;
}

export function orSetRemove(state, value, tags = []) {
  const next = state || { adds: {}, removes: {} };
  next.removes[value] = next.removes[value] || [];
  for (const tag of tags) {
    if (!next.removes[value].includes(tag)) {
      next.removes[value].push(tag);
    }
  }
  return next;
}

export function orSetValues(state) {
  if (!state) return [];
  return Object.keys(state.adds).filter((value) => {
    const added = state.adds[value] || [];
    const removed = new Set(state.removes[value] || []);
    return added.some((tag) => !removed.has(tag));
  }).sort();
}

export function pnCounterValue(state) {
  const positive = Object.values(state?.p || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  const negative = Object.values(state?.n || {}).reduce((sum, value) => sum + Number(value || 0), 0);
  return positive - negative;
}
