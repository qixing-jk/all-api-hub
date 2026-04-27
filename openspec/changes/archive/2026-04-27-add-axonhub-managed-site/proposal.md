## Why

AxonHub is a supported upstream users want to manage from All API Hub, but its admin channel surface is JWT-authenticated GraphQL rather than the New API-compatible REST shape used by the current managed-site providers. Adding AxonHub as a self-managed site lets users configure AxonHub once, manage its basic channels, and import existing account keys as AxonHub channels without requiring a separate migration project.

## What Changes

- Add AxonHub as a selectable managed site type.
- Add AxonHub admin configuration using base URL, email, and password credentials.
- Support validating AxonHub credentials through the upstream admin sign-in flow.
- Support basic AxonHub channel management from the managed-site channel UI: list, search, create, update, and delete.
- Support importing an existing account/token as an AxonHub OpenAI-compatible channel.
- Map AxonHub GraphQL channel data into the managed-site channel UI shape for the supported basic workflows.
- Exclude bulk channel migration or automatic conversion from other managed-site backends in this change.
- Preserve existing New API, Veloera, DoneHub, and Octopus managed-site behavior.

## Capabilities

### New Capabilities

- `axonhub-managed-site`: AxonHub can be configured as a managed site and used for basic channel management plus import-as-channel through its admin GraphQL API.

### Modified Capabilities

- None.

## Impact

- Managed-site type constants, preferences, and settings UI need to include AxonHub.
- Managed-site service resolution needs an AxonHub provider implementation.
- API service routing needs an AxonHub GraphQL-backed adapter for channel listing and mutations.
- Channel dialog and table code may need provider-specific normalization for AxonHub channel types, statuses, credentials, models, and unsupported New API-only fields.
- Locale resources need new user-facing strings for AxonHub configuration and errors.
- Tests should cover AxonHub credential validation, channel data mapping, channel CRUD operations, and import-as-channel behavior without exposing stored credentials.
