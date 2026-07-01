## What

## Why

## How to test
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:unit`
- [ ] `npm run test:integration`
- [ ] `npm run test:e2e` (if UI/flow changes)

## Required test perspectives
- [ ] TTL / expiration behavior verified
- [ ] Replay / resend behavior verified
- [ ] Chunk-missing robustness verified
- [ ] Encrypt → send → decrypt mainline validated

## Security notes
- [ ] signature / recipient-binding unchanged or updated in spec
- [ ] replay protection considered

<!-- ─── AI operations (see AGENTS.md / docs/ai/OPERATIONS.md) ─── -->

## AI usage
- [ ] AI was used for this PR. Tool(s): [Claude / Copilot / Coding Agent / other]
- [ ] No AI used.

## Verification run
Check the boxes under **How to test** above for commands you actually ran, and paste key
output/summary here. For security-relevant changes also run:
- [ ] `npm run check:security-audit`

Skipped commands + reason (REQUIRED if any required command was not run):
> e.g. "test:e2e skipped — no browser in sandbox"

## Impact & risk
- Areas touched: [crypto / protocol / BLE / transport / gateway / relay / storage / UI / docs / CI]
- [ ] Touches a high-risk area (crypto/protocol/BLE/gateway/security) → human review required per CODEOWNERS.

## Security impact
- [ ] No security impact, because: [reason]
- [ ] Possible security impact — described above and flagged for human review.
- [ ] I did NOT weaken any security/validation check to pass a test.

## Spec / docs sync
- [ ] Behavior in `spec/` or `docs/` changed → corresponding file updated in this PR.
- [ ] No spec/docs change needed, because: [reason]
