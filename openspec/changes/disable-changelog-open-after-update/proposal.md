## Why

The extension currently opens a changelog tab after every update, which can be disruptive and unexpected. Users should be able to opt out of this behavior while still being able to access release notes when they want.

## What Changes

- Add a user preference to control whether the changelog page is opened automatically after an extension update (default: enabled to preserve current behavior).
- Add a settings UI toggle for this preference and localize the label/description.
- Update the background update handler to respect the preference (when disabled, no changelog tab is created).
- Keep existing manual access to the changelog (e.g., via version/changelog links) unchanged.

## Capabilities

### New Capabilities

- `changelog-on-update`: Allow users to enable/disable automatic opening of the changelog page after an extension update.

### Modified Capabilities

## Impact

- Background lifecycle update handling (MV3 service worker / MV2 background) and tab-opening navigation.
- User preferences schema, defaults, persistence, and migration for existing installs.
- Options/settings UI and i18n resources for the new toggle.
- Automated tests covering update behavior and preference persistence.
