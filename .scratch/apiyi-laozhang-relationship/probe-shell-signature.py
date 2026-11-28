"""Research-only Shell protocol fingerprint probe; never sends credentials.

Run --self-test for malformed/partial-response checks, or pass saved status
JSON paths. A match means the observed commercial Shell-compatible status
schema; absence is unknown, including old Shell versions without these fields.
"""
import argparse
import copy
import gzip
import json
from pathlib import Path


def identify_shell_status(payload):
    if not isinstance(payload, dict) or payload.get("success") is not True:
        return False
    data = payload.get("data")
    if not isinstance(data, dict):
        return False
    if any(key in data for key in (
        "rix_version_message", "rixapi_license_type", "rix_license_enabled"
    )):
        return False
    if type(data.get("ShellApiLogOptimizerEnabled")) is not bool:
        return False
    for key in ("CustomThemeConfig", "CustomDarkThemeConfig"):
        value = data.get(key)
        if not isinstance(value, str):
            return False
        if value.strip():
            try:
                if not isinstance(json.loads(value), dict):
                    return False
            except ValueError:
                return False
    apps = data.get("CustomAppList")
    if not isinstance(apps, str):
        return False
    try:
        return isinstance(json.loads(apps), list)
    except ValueError:
        return False


def self_test():
    base = {
        "success": True,
        "data": {
            "ShellApiLogOptimizerEnabled": False,
            "CustomThemeConfig": "",
            "CustomDarkThemeConfig": "",
            "CustomAppList": "[]",
        },
    }
    cases = [("disabled marker still identifies protocol", base, True)]
    enabled = copy.deepcopy(base)
    enabled["data"]["ShellApiLogOptimizerEnabled"] = True
    cases.append(("enabled marker", enabled, True))
    configured = copy.deepcopy(base)
    configured["data"].update(
        CustomThemeConfig='{"token":{"colorPrimary":"#ffffff"}}',
        CustomDarkThemeConfig="{}",
        CustomAppList='[{"url":"https://example.invalid"}]',
    )
    cases.append(("configured themes and app list", configured, True))
    for key in base["data"]:
        missing = copy.deepcopy(base)
        del missing["data"][key]
        cases.append(("missing " + key, missing, False))
    for label, key, value in [
        ("string flag", "ShellApiLogOptimizerEnabled", "false"),
        ("numeric flag", "ShellApiLogOptimizerEnabled", 0),
        ("object theme instead of string", "CustomThemeConfig", {}),
        ("invalid JSON theme", "CustomThemeConfig", "{broken"),
        ("theme JSON is an array", "CustomThemeConfig", "[]"),
        ("app list JSON is an object", "CustomAppList", "{}"),
        ("app list is not serialized", "CustomAppList", []),
    ]:
        invalid = copy.deepcopy(base)
        invalid["data"][key] = value
        cases.append((label, invalid, False))
    failed = copy.deepcopy(base)
    failed["success"] = False
    cases.append(("failed envelope cannot identify", failed, False))
    conflict = copy.deepcopy(base)
    conflict["data"]["rixapi_license_type"] = "premium"
    cases.append(("conflicting known-family signature", conflict, False))
    cases.extend([
        ("branding only", {"success": True, "data": {
            "system_name": "Shell API", "version": "v33.5.5"
        }}, False),
        ("ordinary One API-shaped data", {"success": True, "data": {
            "system_name": "One API", "version": "v0.6.11",
            "quota_per_unit": 500000
        }}, False),
        ("HTML/blocked response", "<html>Shell API</html>", False),
    ])
    for label, payload, expected in cases:
        result = identify_shell_status(payload)
        assert result == expected, f"{label}: expected {expected}, got {result}"
    print(json.dumps({"self_test_cases": len(cases), "result": "passed"}))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("status_files", nargs="*", type=Path)
    args = parser.parse_args()
    if args.self_test:
        self_test()
    for path in args.status_files:
        captured = path.read_bytes()
        if captured.startswith(b"\x1f\x8b"):
            captured = gzip.decompress(captured)
        try:
            payload = json.loads(captured.decode("utf-8"))
            capture_kind = "json"
        except (ValueError, UnicodeDecodeError):
            payload = None
            capture_kind = "non-status-json"
        data = payload.get("data", {}) if isinstance(payload, dict) else {}
        if not isinstance(data, dict):
            data = {}
        print(json.dumps({
            "path": str(path),
            "capture_kind": capture_kind,
            "system_name": data.get("system_name"),
            "version": data.get("version"),
            "classification": (
                "shell-compatible" if identify_shell_status(payload) else "unknown"
            ),
        }, ensure_ascii=False))
    if not args.self_test and not args.status_files:
        parser.error("pass --self-test or captured status JSON paths")


if __name__ == "__main__":
    main()
