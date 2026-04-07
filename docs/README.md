# Documentation

User documentation, guides, and resources for Lifeline Mesh.

## Documents

### [USAGE.md](./USAGE.md)
Complete usage guide covering:
- Quick start (generate keys, add contacts, send/receive messages)
- Advanced features (TOFU, replay protection)
- Security best practices
- Troubleshooting
- Offline usage
- Integration with relay networks

### [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md)
Release decision checklist covering:
- Mandatory CI/test gates
- Known-bug acceptance threshold
- Compatibility verification
- Final go/no-go sign-off

### [FAQ.md](./FAQ.md)
Frequently asked questions about:
- General questions (what is it, who is it for)
- Security (crypto details, threat model, key management)
- Technical details (why certain design choices)
- Usage scenarios (offline, lost device, key verification)
- Development (integration, testing, contributing)

### [NEXT_PHASE_EXECUTION_JA.md](./NEXT_PHASE_EXECUTION_JA.md)
Post-merge execution roadmap (Japanese) covering:
- Phase 1-10 goals and deliverables
- Exit criteria per phase
- Go/No-Go release gates


### [TASK_KICKOFF_EXECUTION_TEMPLATE_JA.md](./TASK_KICKOFF_EXECUTION_TEMPLATE_JA.md)
Task kickoff template (Japanese) covering:
- One-sentence objective definition
- Definition of Done and scope boundaries
- Dependencies, risk controls, and validation plan
- Communication checkpoints and timeline guardrails

### [PHASE_A_TO_E_EXECUTION_JA.md](./PHASE_A_TO_E_EXECUTION_JA.md)
Legacy execution checklist for older A-E planning (Japanese).
- Historical reference only (non-authoritative)
- Superseded for completion evidence by `docs/IMPLEMENTATION_SERIES_STATUS.md` and `docs/REPO_TRUTH_AUDIT.md`


### [ISSUE_SYNC_REPORT.md](./ISSUE_SYNC_REPORT.md)
PR-17 synchronization report covering:
- code-vs-doc drift matrix
- issue edit permission status
- per-issue update proposals when direct GitHub edits are unavailable

### [GATEWAY_BRIDGE_PHASE4.md](./GATEWAY_BRIDGE_PHASE4.md)
Phase 4 gateway bridge runbook covering:
- dedicated gateway service scope
- shipped HTTP endpoints and bridge responsibilities
- duplicate/loop suppression semantics
- local-only behavior and policy-based metadata minimization

## Quick Links

**For Users**:
- [Quick Start](./USAGE.md#quick-start) - Get started in 5 minutes
- [Security Best Practices](./USAGE.md#security-best-practices)
- [Troubleshooting](./USAGE.md#troubleshooting)

**For Developers**:
- [Integration Guide](./FAQ.md#how-do-i-integrate-lifeline-mesh-into-my-app)
- [Build Your Own Relay](./FAQ.md#how-do-i-build-my-own-relay)
- [Run Tests](./FAQ.md#how-do-i-run-tests)
- [Release Checklist](./RELEASE_CHECKLIST.md)

**For Security Reviewers**:
- [Threat Model](../spec/THREAT_MODEL.md)
- [Protocol Specification](../spec/PROTOCOL.md)
- [Crypto Core API](../crypto/README.md)

## Contributing

Found an issue with documentation? Have suggestions?
- Open an issue: [GitHub Issues](https://github.com/hiroshitanaka-creator/lifeline-mesh/issues)
- Submit a PR: See [CONTRIBUTING.md](../CONTRIBUTING.md)

## Screenshots

(To be added - screenshots of UI in action)
