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
  if (!Number.isFinite(incomingVersion)) {
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

  return getRecoveryMetadataScore(incomingState) >= getRecoveryMetadataScore(existingState);
}

export function filterSenderStateEntriesByMembers(entries, currentMembers, resolveMemberFp) {
  const memberSet = new Set(currentMembers || []);
  return (entries || []).filter((entry) => {
    const memberFp = resolveMemberFp(entry?.senderSignPK);
    return Boolean(memberFp && memberSet.has(memberFp));
  });
}
