## Why

Today the changelog is effectively shown immediately after an extension update, which can be disruptive because it may happen without any explicit user action (e.g., background auto-updates creating an unexpected new tab). We want to keep update visibility while making the timing user-initiated: only show it the first time the user opens the extension after the update.

## What Changes

- After an extension update, persist a “changelog pending” marker tied to the updated version
- On the first user-open of the extension after the update (any UI entrypoint such as popup/options/sidepanel), show the changelog
- Clear the marker after showing so the same version is shown at most once
- Keep changelog content and UI unchanged; only adjust trigger timing and persistence

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `changelog-on-update`

## Impact

- Affects: update detection/version tracking, changelog trigger points, and new Storage state (possible migration considerations)
- Tests: add/adjust tests to verify “shown only once on first open after update” plus marker write/clear behavior

