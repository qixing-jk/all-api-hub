## Why

Runtime message routing currently relies on ad-hoc string literals for `request.action` checks and prefix matching across background/services. As the number of actions grows, this makes changes error-prone (sender/receiver string mismatches), reduces discoverability/autocomplete, and encourages inconsistent prefix conventions.

## What Changes

- Define runtime message action identifiers in a single, typed registry instead of scattered magic strings.
- Define and reuse typed action prefixes (and a shared compose/match helper) so both individual actions and prefix-based routing are consistently expressed.
- Migrate existing runtime message send/handle sites to use the shared constants/helpers while preserving the current on-the-wire action values (no behavior change).
- Add/adjust tests to prevent regressions and ensure new actions/prefixes are added via the registry (not as inline strings).

## Capabilities

### New Capabilities
- `runtime-message-actions`: Canonical runtime message action IDs and prefixes (plus helpers for composing/matching them) to eliminate magic strings and keep message routing consistent across extension contexts.

### Modified Capabilities

## Impact

- Code: `constants/runtimeActions.ts` (and/or a new constants module), `entrypoints/background/runtimeMessages.ts`, and all feature message handlers that route by action/prefix (auto-refresh, auto-checkin, WebDAV auto-sync, model sync, external check-in, redemption assist, etc.), plus any senders in popup/options/content scripts.
- Tests: update existing Vitest coverage that references runtime actions and add coverage for the shared registry/helpers to keep action IDs stable over time.
