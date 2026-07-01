from pathlib import Path
import subprocess


def test_ai_governance_validator_passes():
    root = Path(__file__).resolve().parents[1]
    result = subprocess.run(
        ["python", "tools/validate_ai_governance.py"],
        cwd=root,
        text=True,
        capture_output=True,
        check=False,
    )
    assert result.returncode == 0, result.stdout + result.stderr
