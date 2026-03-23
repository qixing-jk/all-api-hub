#!/usr/bin/env bash

set -euo pipefail

if ! command -v xcrun >/dev/null 2>&1; then
  echo "xcrun is required to prepare Safari release assets."
  exit 1
fi

PACKAGE_VERSION="${PACKAGE_VERSION:-}"
if [ -z "$PACKAGE_VERSION" ]; then
  PACKAGE_VERSION="$(node -p "JSON.parse(require('node:fs').readFileSync('package.json', 'utf8')).version")"
fi

EXTENSION_DIR="${SAFARI_EXTENSION_DIR:-.output/safari-mv2}"
RELEASE_ASSETS_DIR="${SAFARI_RELEASE_ASSETS_DIR:-.output/release-assets}"
APP_NAME="${SAFARI_APP_NAME:-All API Hub}"
BUNDLE_IDENTIFIER="${SAFARI_BUNDLE_IDENTIFIER:-com.yourCompany.allapihub}"
RELEASE_BASENAME="${SAFARI_RELEASE_BASENAME:-all-api-hub-${PACKAGE_VERSION}}"
ZIP_TARGET_NAME="${SAFARI_ZIP_TARGET_NAME:-}"
SAFARI_ZIP_PATH="${SAFARI_ZIP_PATH:-}"
PROJECT_NAME="${SAFARI_PROJECT_NAME:-$(basename "${SAFARI_PROJECT_DIR:-all-api-hub-safari-project}")}"
BUNDLE_ROOT="${SAFARI_BUNDLE_ROOT:-${RUNNER_TEMP:-/tmp}/${RELEASE_BASENAME}-safari-bundle}"
PROJECT_DIR="$BUNDLE_ROOT/$PROJECT_NAME"
EXTENSION_BUNDLE_DIR="$BUNDLE_ROOT/safari-mv2"
BUNDLE_ZIP_NAME="${SAFARI_BUNDLE_ZIP_NAME:-${RELEASE_BASENAME}-safari-xcode-bundle.zip}"

if [ ! -d "$EXTENSION_DIR" ]; then
  echo "Safari extension directory not found: $EXTENSION_DIR"
  exit 1
fi

if [ -z "$SAFARI_ZIP_PATH" ]; then
  shopt -s nullglob
  safari_zips=(.output/*-safari.zip)

  if [ "${#safari_zips[@]}" -ne 1 ]; then
    echo "Expected exactly one Safari zip in .output."
    ls -la .output
    exit 1
  fi

  SAFARI_ZIP_PATH="${safari_zips[0]}"
fi

mkdir -p "$RELEASE_ASSETS_DIR"
rm -rf "$BUNDLE_ROOT"
mkdir -p "$BUNDLE_ROOT"

ditto "$EXTENSION_DIR" "$EXTENSION_BUNDLE_DIR"
cp "$SAFARI_ZIP_PATH" "$BUNDLE_ROOT/$(basename "$SAFARI_ZIP_PATH")"

# Generate the Xcode project next to the compiled Safari build so the extracted bundle keeps working.
xcrun safari-web-extension-converter "$EXTENSION_BUNDLE_DIR" \
  --project-location "$PROJECT_DIR" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_IDENTIFIER" \
  --no-open \
  --no-prompt \
  --force

if [ -n "$ZIP_TARGET_NAME" ]; then
  cp "$SAFARI_ZIP_PATH" "$RELEASE_ASSETS_DIR/$ZIP_TARGET_NAME"
fi

ditto -c -k --sequesterRsrc --keepParent "$BUNDLE_ROOT" \
  "$RELEASE_ASSETS_DIR/$BUNDLE_ZIP_NAME"
