## Why

API verification probes currently exist as session-only dialog state. Once the user closes the dialog or content-script modal, the latest probe outcome is lost, which makes it difficult to compare retries, confirm whether a profile or model was already checked, or triage failures across multiple accounts and profiles.

This change adds a durable, sanitized verification summary so the extension can surface the most recent verification result the next time the user opens related screens, without storing raw API keys or unsafe provider error payloads.

## What Changes

- Persist the latest AI API verification result as a sanitized summary keyed to the verification target instead of keeping results only in transient dialog state.
- Save probe-level status, latency, summary key, summary params, timestamps, resolved model id, and other non-secret metadata needed to render a “last verified” summary later.
- Expose the latest verification status and timestamp in relevant list/detail surfaces, including stored API credential profiles and verification dialogs that already run probes.
- Provide a user action to clear persisted verification history for a verification target.
- Ensure persisted verification records never include raw API keys or unsanitized provider error bodies.

## Capabilities

### New Capabilities
- `verification-result-history`: Persist sanitized AI API verification summaries and expose the latest verification status, timestamp, and clear-history controls across supported verification surfaces.

### Modified Capabilities

## Impact

- Affected code: `src/services/verification/**`, a new storage service under `src/services/**`, verification dialogs, API credential profiles list/detail UI, related shared types, and locale strings.
- Affected systems: extension local storage and cross-context read/write coordination for persisted verification summaries.
- Dependencies: reuses existing probe result types, summary translation helpers, and storage locking patterns instead of introducing a separate verification pipeline.
