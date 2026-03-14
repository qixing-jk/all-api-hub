## Why

Veloera cannot reliably search channels by account base URL, but the current "Locate channel" and managed-site key status flows both depend on that lookup. Leaving those affordances enabled on Veloera creates misleading review paths and suggests a level of channel verification the backend cannot actually support.

## What Changes

- Disable the account-level "Locate channel" action for Veloera managed sites instead of attempting URL-filtered channel navigation.
- Disable Veloera managed-site channel status verification and review affordances in Key Management, replacing them with a clear unsupported hint.
- Add localized user-facing explanations wherever these features are suppressed so users understand the limitation comes from Veloera backend behavior rather than local configuration.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `account-menu-jump-filtered-channel-management`: Veloera accounts no longer expose the locate-channel action and instead explain that Veloera does not support reliable base-URL channel lookup.
- `key-management-managed-site-channel-status`: Veloera no longer presents actionable channel verification or review flows for account keys; the UI shows an unsupported hint instead of status-derived channel actions.

## Impact

- Veloera-specific gating in account actions and managed-site navigation entry points
- Key Management managed-site status rendering, refresh behavior, and unsupported-state messaging
- Managed-site status resolution logic for Veloera
- Locale strings and targeted tests covering Veloera account and key-management UX
