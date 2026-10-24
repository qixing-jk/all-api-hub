#!/usr/bin/env python3
"""Embed the isolated Cookie handler in a converter-generated Safari project."""

from pathlib import Path
import re
import shutil
import sys


def configure_project(project_root: Path, bundle_identifier: str) -> None:
    handlers = list(project_root.rglob("SafariWebExtensionHandler.swift"))
    projects = list(project_root.rglob("project.pbxproj"))
    if len(handlers) != 1 or len(projects) != 1:
        raise RuntimeError("Unexpected Safari converter project layout")

    source = Path(__file__).resolve().parent.parent / "safari/native/SafariWebExtensionHandler.swift"
    project = projects[0]
    contents = project.read_text(encoding="utf-8")
    # The converter can derive the containing app ID from its display name.
    # Keep host/extension prefixes aligned, including independent validation apps.
    contents, bundle_count = re.subn(
        r"PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);",
        lambda match: 'PRODUCT_BUNDLE_IDENTIFIER = "'
        + bundle_identifier
        + (".Extension" if match.group(1).strip('"').endswith(".Extension") else "")
        + '";',
        contents,
    )
    contents, sandbox_count = re.subn(
        r"(ENABLE_APP_SANDBOX = YES;)",
        r"\1\n\t\t\t\tENABLE_OUTGOING_NETWORK_CONNECTIONS = YES;",
        contents,
    )
    # New Xcode converters default the containing app to the build machine's
    # macOS version (for example 26.6), even when the extension targets 12.0.
    # Pin both targets so a newly packaged app still installs on supported Macs.
    contents = re.sub(
        r"MACOSX_DEPLOYMENT_TARGET = [^;]+;",
        "MACOSX_DEPLOYMENT_TARGET = 12.0;",
        contents,
    )
    if bundle_count == 0 or sandbox_count == 0:
        raise RuntimeError(
            "Safari converter project lacks expected bundle identifier or sandbox settings"
        )
    shutil.copyfile(source, handlers[0])
    project.write_text(contents, encoding="utf-8")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: configure-safari-native-cookie-project.py PROJECT_DIR BUNDLE_IDENTIFIER")
    configure_project(Path(sys.argv[1]), sys.argv[2])
