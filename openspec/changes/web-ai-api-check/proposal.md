## Why

Users often receive API relay credentials (base URL + API key) while browsing provider dashboards, docs, or chat messages. Today they must switch into extension pages and rely on manual trial-and-error to validate endpoints/models, which is slow and error-prone. This change adds an in-page recognition + verification workflow that keeps automatic detection opt-in (default off) and gated by a user-defined whitelist.

## What Changes

- Add a new manual workflow triggered from a right-click context menu to open an in-page API check modal.
- Add an in-page modal that can parse a pasted/selected text blob to extract `baseUrl` + `apiKey`, while always allowing manual edits for:
  - `baseUrl` (including path)
  - `apiKey`
  - `apiType` (OpenAI-compatible / OpenAI / Anthropic / Google)
  - `modelId`
- Provide quick actions inside the modal:
  - Fetch model list for OpenAI/OpenAI-compatible endpoints when supported.
  - Run API verification probes for all supported API types by reusing the existing `aiApiVerification` suite/probe runners.
- Add an optional auto-detect mode (default off) that:
  - Only runs on user-configured whitelist URL patterns.
  - Shows a top-right confirmation toast first and only opens the modal after user confirmation.
- Ensure all UI and logs treat API keys as secrets (mask in UI, redact in errors/log output).

## Capabilities

### New Capabilities

- `web-ai-api-check`: In-page extraction of API `baseUrl` + `apiKey` from user-provided text (selection/paste), with a manual context-menu trigger and an optional whitelist-gated auto-detection path that requires explicit user confirmation before running verification actions.

### Modified Capabilities

- (none)

## Impact

- Background scripts: context menu wiring and runtime message routing for API check actions.
- Content scripts: in-page overlay UI (top-right confirm toast + centered modal) and text extraction/normalization.
- Services: reuse `services/aiApiVerification/*` and `services/apiService/openaiCompatible`; add glue code to execute probes and return results to the content UI.
- Preferences & Options UI: add settings to control auto-detection and manage whitelist patterns.
- Localization: new manifest context-menu strings and UI i18n keys.
- Tests: add unit tests for extraction/whitelist gating and service-level runner behavior.
