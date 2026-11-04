"""Prepare the generated extension in a disposable, stopped Safari CI profile.

The state bootstrap follows btecu/safari-ad's enable_in_safari.py. Actual
activation and native requests are verified separately by the maintained smoke.
"""

import copy
import datetime
import json
import os
import plistlib
import re
import subprocess
import sys
from pathlib import Path

FIXTURE_ORIGINS = ("http://127.0.0.1/*", "http://localhost/*")
FOREVER = datetime.datetime(4001, 1, 1)


def prepare_registration_state(state, identifier, permissions, now):
    if not re.fullmatch(
        r"io\.github\.qixingjk\.allapihub\.nativeCookieTrial\.run\d{17}\.Extension",
        identifier,
    ):
        raise ValueError("Expected a generated CI trial extension")
    keys = [
        key for key in state
        if key == identifier or (key.startswith(identifier + " (") and key.endswith(")"))
    ]
    if len(keys) != 1:
        raise ValueError("Expected exactly one registered trial extension")
    key = keys[0]
    if not isinstance(state[key], dict) or "RemovedDate" in state[key]:
        raise ValueError("Invalid registered trial extension state")
    if not all(permission in permissions for permission in ("cookies", "nativeMessaging")):
        raise ValueError("Missing CI fixture permissions")
    result = copy.deepcopy(state)
    entry = result[key]
    entry.update({
        "Enabled": True,
        "EnabledByUserGesture": True,
        "EnabledModificationDate": now,
        "Permissions": permissions,
        "AccessibleOrigins": list(FIXTURE_ORIGINS),
    })
    granted = entry.setdefault("GrantedPermissions", {})
    revoked = entry.setdefault("RevokedPermissions", {})
    for permission in permissions:
        if "://" not in permission and permission != "<all_urls>":
            granted[permission] = FOREVER
            revoked.pop(permission, None)
    granted_origins = entry.setdefault("GrantedPermissionOrigins", {})
    revoked_origins = entry.setdefault("RevokedPermissionOrigins", {})
    for origin in FIXTURE_ORIGINS:
        granted_origins[origin] = FOREVER
        revoked_origins.pop(origin, None)
    return result


def main():
    if not (
        sys.platform == "darwin"
        and os.environ.get("GITHUB_ACTIONS") == "true"
        and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted"
    ):
        raise RuntimeError("Trial activation requires a disposable GitHub-hosted Mac")
    if subprocess.run(["pgrep", "-x", "Safari"], stdout=subprocess.DEVNULL).returncode != 1:
        raise RuntimeError("Safari must be stopped before preparing its trial state")
    extension = Path(sys.argv[1]).resolve()
    with (extension / "Contents/Info.plist").open("rb") as source:
        info = plistlib.load(source)
    if info.get("NSExtension", {}).get("NSExtensionPointIdentifier") != "com.apple.Safari.web-extension":
        raise ValueError("Expected a native Safari web extension")
    manifest = json.loads((extension / "Contents/Resources/manifest.json").read_text())
    state_path = Path.home() / "Library/Containers/com.apple.Safari/Data/Library/Safari/WebExtensions/Extensions.plist"
    with state_path.open("rb") as source:
        original = plistlib.load(source)
    prepared = prepare_registration_state(
        original, info["CFBundleIdentifier"], manifest["permissions"],
        datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None),
    )
    temporary = state_path.with_suffix(".ci-tmp")
    with temporary.open("wb") as target:
        plistlib.dump(prepared, target, fmt=plistlib.FMT_BINARY)
    temporary.replace(state_path)
    with state_path.open("rb") as source:
        if plistlib.load(source) != prepared:
            raise RuntimeError("Prepared Safari trial state did not persist")
    changed = [key for key in prepared if prepared[key] != original[key]]
    print(json.dumps({
        "changed": changed,
        "before": {key: original[key] for key in changed},
        "after": {key: prepared[key] for key in changed},
    }, default=lambda value: value.isoformat()))


if __name__ == "__main__":
    main()
