#!/usr/bin/env bash
set -euo pipefail
# Local experiment only; create a new directory and never replace a release app.
EXTENSION_DIR="${SAFARI_EXTENSION_DIR:-.output/safari-mv2}"
PROJECT_DIR="${SAFARI_PROJECT_DIR:?Set SAFARI_PROJECT_DIR to a fresh experiment directory}"
APP_NAME="${SAFARI_APP_NAME:-All API Hub Native Cookie Trial}"
BUNDLE_IDENTIFIER="${SAFARI_BUNDLE_IDENTIFIER:-io.github.qixingjk.allapihub.nativeCookieTrial}"
if [ "$BUNDLE_IDENTIFIER" = "io.github.qixingjk.allapihub" ] || [ -e "$PROJECT_DIR" ]; then
  echo "Use a distinct bundle identifier and a fresh project directory." >&2
  exit 1
fi
node --input-type=module - "$EXTENSION_DIR/manifest.json" <<'JS'
import fs from 'node:fs'
const manifest = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
if (!manifest.permissions?.includes('nativeMessaging')) throw new Error('Build the current Safari version first')
JS
xcrun safari-web-extension-converter "$EXTENSION_DIR" --project-location "$PROJECT_DIR" --app-name "$APP_NAME" --bundle-identifier "$BUNDLE_IDENTIFIER" --macos-only --copy-resources --no-open --no-prompt
python3 scripts/configure-safari-native-cookie-project.py "$PROJECT_DIR" "$BUNDLE_IDENTIFIER"
XCODE_PROJECT="$(find "$PROJECT_DIR" -name '*.xcodeproj' -type d -print -quit)"
xcodebuild -list -project "$XCODE_PROJECT"
