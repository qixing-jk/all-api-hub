## Why

Many users run a self-hosted **Done Hub** instance as their AI aggregation backend. Today, All API Hub’s unified “managed site” admin experience primarily targets the New-API family, so Done Hub users must manage channels/models manually outside the extension. This is time-consuming and error-prone as the number of channels/models grows.

## What Changes

- Add **Done Hub** to the extension’s unified management experience (similar to existing New-API management).
- Support Done Hub admin operations, including:
  - Channel management (create/update/enable/disable/delete as supported by Done Hub)
  - Model synchronization (sync models from upstream / refresh model list as supported)
  - Model redirection / mapping (configure redirect rules as supported)
- Implement a Done Hub-specific API adapter and wire it into the existing management flow and UI.
- Add a settings shortcut link to the Done Hub profile page to help users locate admin credentials.
- Add/update i18n strings and tests for the new behavior.

## Capabilities

### New Capabilities

- `done-hub-admin-management`: Provide unified management for self-hosted Done Hub instances inside All API Hub, including channel management, model synchronization, and model redirection.

### Modified Capabilities

<!-- None -->

## Impact

- `constants/siteType.ts` and site-type detection/routing may need updates so Done Hub can participate in the managed-site admin flow.
- `services/apiService/**` will need a Done Hub admin adapter (and wiring in the service index) for channels/models/redirect operations.
- Options/admin UI surfaces (e.g. `/panel/*`) will require Done Hub enablement, copy updates, and tests.
