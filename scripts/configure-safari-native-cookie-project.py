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
    shutil.copyfile(source, handlers[0])
    project = projects[0]
    contents = project.read_text()
    # The converter can derive the containing app ID from its display name.
    # Keep host/extension prefixes aligned, including independent validation apps.
    contents = re.sub(
        r"PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);",
        lambda match: 'PRODUCT_BUNDLE_IDENTIFIER = "'
        + bundle_identifier
        + (".Extension" if match.group(1).strip('"').endswith(".Extension") else "")
        + '";',
        contents,
    )
    contents = re.sub(
        r"(ENABLE_APP_SANDBOX = YES;)",
        r"\1\n\t\t\t\tENABLE_OUTGOING_NETWORK_CONNECTIONS = YES;",
        contents,
    )
    project.write_text(contents)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: configure-safari-native-cookie-project.py PROJECT_DIR BUNDLE_IDENTIFIER")
    configure_project(Path(sys.argv[1]), sys.argv[2])
