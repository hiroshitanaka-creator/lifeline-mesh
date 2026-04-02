# Release Go/No-Go Checklist

Use this checklist before tagging a release.

## 1) Mandatory test gate (must be green)
- [ ] `npm run lint`
- [ ] `npm run typecheck`
- [ ] `npm run test:unit`
- [ ] `npm run test:integration`
- [ ] `npm run test:e2e:playwright`
- [ ] CI required check `validate` is successful for the release commit.

## 2) Known-bug threshold
- [ ] Open `bug` issues are reviewed and triaged.
- [ ] No open **critical** bug remains.
- [ ] Open **high** bugs are either fixed or explicitly accepted with mitigation notes in release notes.
- [ ] Total unresolved bugs is within the currently agreed release threshold.

## 3) Compatibility confirmation
- [ ] IndexedDB migration (`lifelineMesh` → `lifelineMeshV2`) verified on an upgrade scenario.
- [ ] Backward/forward message compatibility checked against current protocol expectations.
- [ ] Browser compatibility smoke-check completed for supported targets (Chrome/Edge, Firefox, Safari).
- [ ] Any breaking behavior is documented and communicated before release.

## 4) Final sign-off
- [ ] Security periodic checklist completed (see `SECURITY.md`).
- [ ] Release notes include risks, mitigations, and rollback instructions.
- [ ] At least one maintainer approval recorded for go/no-go decision.


## 関連Runbook
- [OPERATIONS_RUNBOOK.md](./OPERATIONS_RUNBOOK.md)
- [VULNERABILITY_RESPONSE_JA.md](./VULNERABILITY_RESPONSE_JA.md)
- [MONITORING_POLICY_JA.md](./MONITORING_POLICY_JA.md)
- [RELEASE_GONOGO_AGENDA_JA.md](./RELEASE_GONOGO_AGENDA_JA.md)
- [BLE_SUPPORT_MATRIX.md](./BLE_SUPPORT_MATRIX.md)
