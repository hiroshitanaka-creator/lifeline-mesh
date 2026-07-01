#!/usr/bin/env python3
"""Validate Project Echo AI governance documents."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    "AGENTS.md",
    ".github/copilot-instructions.md",
    ".github/instructions/po-echo-core.instructions.md",
    ".github/instructions/tests.instructions.md",
    ".github/pull_request_template.md",
    ".github/ISSUE_TEMPLATE/ai_task.yml",
    "docs/AI_OPERATING_MODEL.md",
    "docs/AI_AUDIT_POLICY.md",
    "docs/MISSION_INTEGRITY_POLICY.md",
    "docs/AI_TASK_PROTOCOL.md",
    "docs/templates/ai_audit_log.md",
    "docs/templates/mission_integrity_review.md",
    "prompts/README.md",
    "prompts/tasks/feature.md",
    "prompts/tasks/bugfix.md",
    "prompts/tasks/audit.md",
    "prompts/tasks/docs.md",
    "prompts/tasks/refactor.md",
]
INSTRUCTION_HEADERS = {
    ".github/instructions/po-echo-core.instructions.md": '---\napplyTo: "src/po_echo/**/*.py"\n---',
    ".github/instructions/tests.instructions.md": '---\napplyTo: "tests/**/*.py"\n---',
}
FORBIDDEN_PHRASES = [
    "AI may recommend",
    "AI should recommend",
    "AI should choose the best option",
    "AI may choose the best option",
    "AI makes the final decision",
]
SECRET_PATTERNS = [
    re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----"),
    re.compile(r"https://hooks\.slack\.com/services/[A-Za-z0-9/]+"),
    re.compile(r"ghp_[A-Za-z0-9]{20,}"),
    re.compile(r"xox[baprs]-[A-Za-z0-9-]{20,}"),
]

def fail(msg):
    print(f"ERROR: {msg}")
    return 1

def main():
    errors = 0
    for rel in REQUIRED:
        if not (ROOT / rel).is_file():
            errors += fail(f"missing required file: {rel}")
    if errors:
        return 1

    for rel, header in INSTRUCTION_HEADERS.items():
        text = (ROOT / rel).read_text(encoding="utf-8")
        if not text.startswith(header):
            errors += fail(f"bad frontmatter: {rel}")

    checks = {
        "AGENTS.md": "Mission reduction is a regression",
        ".github/pull_request_template.md": "## Mission Integrity Check",
        ".github/ISSUE_TEMPLATE/ai_task.yml": "Out of scope",
        "docs/MISSION_INTEGRITY_POLICY.md": "less critical, less auditable, less resistant to commercial bias",
    }
    for rel, needle in checks.items():
        if needle not in (ROOT / rel).read_text(encoding="utf-8"):
            errors += fail(f"{rel} lacks required text: {needle}")
    issue_text = (ROOT / ".github/ISSUE_TEMPLATE/ai_task.yml").read_text(encoding="utf-8")
    if "Human decision point" not in issue_text:
        errors += fail("issue template lacks Human decision point")

    scan_files = [ROOT / rel for rel in REQUIRED]
    for path in scan_files:
        text = path.read_text(encoding="utf-8")
        for phrase in FORBIDDEN_PHRASES:
            if phrase in text:
                errors += fail(f"forbidden phrase in {path.relative_to(ROOT)}: {phrase}")
        for pattern in SECRET_PATTERNS:
            if pattern.search(text):
                errors += fail(f"possible secret in {path.relative_to(ROOT)}")

    if errors:
        return 1
    print("AI governance validation passed")
    return 0

if __name__ == "__main__":
    sys.exit(main())
