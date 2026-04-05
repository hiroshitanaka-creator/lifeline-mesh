export function getRecoveryMetadataScore(state) {
  if (!state || typeof state !== "object") {
    return 0;
  }
  let score = 0;
  if (Number.isFinite(Number(state.prevVersion))) {
    score += 1;
  }
  if (typeof state.prevChainKey === "string" && state.prevChainKey.length > 0) {
    score += 1;
  }
  return score;
}

export function shouldAcceptIncomingSenderState(existingState, incomingState) {
  if (!incomingState || typeof incomingState !== "object") {
    return false;
  }

  const incomingVersion = Number(incomingState.version);
  const incomingChainKey = typeof incomingState.chainKey === "string" ? incomingState.chainKey : "";
  if (!Number.isFinite(incomingVersion) || !incomingChainKey) {
    return false;
  }

  if (!existingState || typeof existingState !== "object") {
    return true;
  }

  const existingVersion = Number(existingState.version);
  if (!Number.isFinite(existingVersion)) {
    return true;
  }

  if (incomingVersion > existingVersion) {
    return true;
  }
  if (incomingVersion < existingVersion) {
    return false;
  }

  const existingChainKey = typeof existingState.chainKey === "string" ? existingState.chainKey : "";
  if (!existingChainKey) {
    return true;
  }

  // Same version with different active chain is conflicting state and must be rejected.
  if (incomingChainKey !== existingChainKey) {
    return false;
  }

  // Same active state: only accept strict metadata enrichment.
  return getRecoveryMetadataScore(incomingState) > getRecoveryMetadataScore(existingState);
}

export function filterSenderStateEntriesByMembers(entries, currentMembers, resolveMemberFp) {
  const memberSet = new Set(currentMembers || []);
  return (entries || []).filter((entry) => {
    const memberFp = resolveMemberFp(entry?.senderSignPK);
    return Boolean(memberFp && memberSet.has(memberFp));
  });
}
