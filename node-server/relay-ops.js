export function parseRelayAdminArgs(argv = []) {
  const args = Array.isArray(argv) ? argv : [];
  const wantsStatus = args.includes("--relay-status");
  const wantsCleanup = args.includes("--relay-cleanup");
  const signalsDisabled = args.includes("--no-relay-signals");

  const mode = wantsCleanup ? "cleanup" : wantsStatus ? "status" : "serve";

  return {
    mode,
    signalsEnabled: !signalsDisabled
  };
}

export function formatRelayStatus(snapshot, context = {}) {
  return {
    mode: "single-client-relay",
    context: {
      generatedAt: new Date().toISOString(),
      ...context
    },
    status: snapshot
  };
}
