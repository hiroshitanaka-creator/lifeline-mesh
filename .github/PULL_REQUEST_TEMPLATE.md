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
