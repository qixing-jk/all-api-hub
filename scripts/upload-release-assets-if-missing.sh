#!/usr/bin/env bash

set -euo pipefail

if [ $# -gt 0 ] && [ -z "${RELEASE_TAG:-}" ]; then
  RELEASE_TAG="$1"
  shift
else
  RELEASE_TAG="${RELEASE_TAG:-}"
fi

REPOSITORY="${GH_REPO:-${GITHUB_REPOSITORY:-}}"

if [ -z "$RELEASE_TAG" ]; then
  echo "RELEASE_TAG is required." >&2
  exit 1
fi

if [ -z "$REPOSITORY" ]; then
  echo "GH_REPO or GITHUB_REPOSITORY is required." >&2
  exit 1
fi

if [ "$#" -eq 0 ]; then
  echo "At least one release asset path is required." >&2
  exit 1
fi

files=("$@")
existing_assets="$(
  gh release view "$RELEASE_TAG" \
    --repo "$REPOSITORY" \
    --json assets \
    --jq '.assets[].name'
)"

asset_exists_in_list() {
  local asset_name="$1"
  printf '%s\n' "$existing_assets" | grep -F -x "$asset_name" >/dev/null 2>&1
}

asset_exists_in_release() {
  local asset_name="$1"
  gh release view "$RELEASE_TAG" \
    --repo "$REPOSITORY" \
    --json assets \
    --jq '.assets[].name' | grep -F -x "$asset_name" >/dev/null 2>&1
}

record_existing_asset() {
  local asset_name="$1"
  if [ -z "$existing_assets" ]; then
    existing_assets="$asset_name"
  else
    existing_assets="${existing_assets}"$'\n'"$asset_name"
  fi
}

# A rerun must never combine an existing pair member with a new build's other
# member. Inspect the complete input before uploading even unrelated ZIPs.
crx_name=""
has_updates_manifest=0
for file_path in "${files[@]}"; do
  case "$(basename "$file_path")" in
    *.crx) crx_name="$(basename "$file_path")" ;;
    updates.xml) has_updates_manifest=1 ;;
  esac
done

if [ -n "$crx_name" ] && [ "$has_updates_manifest" -eq 1 ]; then
  crx_exists=0
  manifest_exists=0
  if asset_exists_in_list "$crx_name"; then crx_exists=1; fi
  if asset_exists_in_list "updates.xml"; then manifest_exists=1; fi
  if [ "$crx_exists" -ne "$manifest_exists" ]; then
    echo "CRX and updates.xml must already exist as a complete pair on $RELEASE_TAG; repair the partial release before retrying." >&2
    exit 1
  fi
fi

uploaded_count=0

for file_path in "${files[@]}"; do
  if [ ! -f "$file_path" ]; then
    echo "Release asset file not found: $file_path" >&2
    exit 1
  fi

  asset_name="$(basename "$file_path")"

  if asset_exists_in_list "$asset_name"; then
    echo "Skipping existing release asset: $asset_name"
    continue
  fi

  # Re-check against the live release immediately before upload to reduce races
  # with other workflow runs targeting the same release.
  if asset_exists_in_release "$asset_name"; then
    echo "Skipping concurrently uploaded release asset: $asset_name"
    record_existing_asset "$asset_name"
    continue
  fi

  upload_log="$(mktemp)"
  if gh release upload "$RELEASE_TAG" "$file_path" --repo "$REPOSITORY" >"$upload_log" 2>&1; then
    echo "Uploaded release asset: $asset_name"
    record_existing_asset "$asset_name"
    uploaded_count=$((uploaded_count + 1))
    rm -f "$upload_log"
    continue
  fi

  if asset_exists_in_release "$asset_name"; then
    echo "Treating duplicate upload as success after concurrent publish: $asset_name"
    record_existing_asset "$asset_name"
    rm -f "$upload_log"
    continue
  fi

  echo "Failed to upload release asset: $asset_name" >&2
  cat "$upload_log" >&2
  rm -f "$upload_log"
  exit 1
done

if [ "$uploaded_count" -eq 0 ]; then
  echo "All release assets already exist on $RELEASE_TAG. Nothing to upload."
  exit 0
fi

echo "Uploaded $uploaded_count new release asset(s) to $RELEASE_TAG"
