# key-management-managed-site-channel-status Specification

## Purpose
Define requirements for showing managed-site channel status in Key Management, including automatic refresh behavior, invalidation rules, and secret-safe status feedback.

## Requirements

### Requirement: Key Management shows managed-site verification status and review signals for each loaded key
The system MUST display a managed-site channel status for each token rendered in Key Management when the currently configured managed-site provider supports reliable base-URL channel lookup for review/navigation flows.

When the active managed-site provider does not support reliable base-URL channel lookup, the system MUST suppress per-token managed-site status badges, signal badges, and channel review links, and MUST rely on page-level unsupported guidance instead of token-level verification output.

The status model MUST distinguish at least these outcomes:

- `added`
- `not added`
- `unknown`

When verification reaches the shared resolver, the system MUST capture and expose assessment metadata that includes:

- normalized search base URL and whether backend search completed
- URL-bucket evidence for the normalized `base_url`
- key evidence as `matched`, `no-key-provided`, `comparison-unavailable`, or `no-match`
- model evidence inside the normalized URL bucket ranked as:
  1. Exact normalized model-set equality
  2. Containment in either direction after normalization and de-duplication
  3. Similarity at or above the configured model-similarity threshold

The system MUST reserve `added` for tokens whose key evidence matches and whose model evidence is exact on the same channel.

The system MUST reserve `not added` for search-complete cases where no URL, key, or model signal was found and the token still had a non-empty comparable key.

All other verification-complete states that contain any URL, key, or model signal MUST resolve to `unknown` and require review.

When assessment metadata exists, the rendered Key Management row MUST:

- show URL, key, and model badges with tooltips derived from the assessment
- open channel management by `channelId=<id>` only for `added`
- otherwise provide a review affordance that opens channel management with `search=<searchBaseUrl>`

#### Scenario: Exact channel match is shown as added
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the active managed-site provider supports reliable base-url channel lookup
- **AND** the system can prepare comparable channel inputs
- **WHEN** the shared resolver finds that the same channel satisfies key matching and exact model equality
- **THEN** the system shows the token status as `added`
- **AND** the row links directly to `channelId=<id>` for that exact channel

#### Scenario: Search completes without any URL, key, or model signal
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the active managed-site provider supports reliable base-url channel lookup
- **AND** the token has a non-empty comparable key
- **AND** backend search completes without finding any URL-bucket, key, or model signal
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `not added`

#### Scenario: Secondary exact model-set review match is shown as unknown
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the active managed-site provider supports reliable base-url channel lookup
- **AND** no exact channel can be confirmed
- **AND** the managed-site status check finds a candidate whose normalized `url + models` exactly match the token inputs
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `unknown`
- **AND** the row shows model evidence for an exact model-set match
- **AND** the row provides a review action that opens channel management with `search=<searchBaseUrl>`

#### Scenario: Secondary model containment review match is shown as unknown
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the active managed-site provider supports reliable base-url channel lookup
- **AND** no exact channel or exact model-set match can be confirmed
- **AND** the managed-site status check finds a candidate whose normalized models contain the token models or are contained by them
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `unknown`
- **AND** the row shows model evidence for containment-based review
- **AND** the row provides a review action that opens channel management with `search=<searchBaseUrl>`

#### Scenario: Secondary model similarity review match is shown as unknown
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the active managed-site provider supports reliable base-url channel lookup
- **AND** no exact, exact-model, or containment-based match can be confirmed
- **AND** the managed-site status check finds a candidate whose normalized model similarity meets or exceeds the configured threshold
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `unknown`
- **AND** the row shows model evidence for similarity-based review
- **AND** the row provides a review action that opens channel management with `search=<searchBaseUrl>`

#### Scenario: URL-only evidence is shown as unknown review state
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the active managed-site provider supports reliable base-url channel lookup
- **AND** no exact or secondary model match can be confirmed
- **AND** the managed-site status check can only confirm that a normalized URL bucket exists
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `unknown`
- **AND** the row shows URL evidence plus a model no-match signal
- **AND** the row provides a review action that opens channel management with `search=<searchBaseUrl>`

#### Scenario: Key-only evidence is shown as unknown review state
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the active managed-site provider supports reliable base-url channel lookup
- **AND** a channel under the normalized URL bucket matches the comparable key
- **AND** no model-based match can be confirmed
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `unknown`
- **AND** the row shows key-matched evidence and model no-match evidence
- **AND** the row provides a review action that opens channel management with `search=<searchBaseUrl>`

#### Scenario: Exact verification is unavailable when no comparable key is available
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the active managed-site provider supports reliable base-url channel lookup
- **AND** the prepared comparable inputs do not include a non-empty key
- **AND** no URL, key, or model signal can be confirmed
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `unknown`
- **AND** the reason is `exact-verification-unavailable`

#### Scenario: New API key-unavailable tooltip includes hidden-key guidance
- **GIVEN** a token is rendered in Key Management
- **AND** the managed-site type is `new-api`
- **AND** the key assessment resolves to `comparison-unavailable`
- **WHEN** the system renders the key signal tooltip
- **THEN** the tooltip explains that managed-site channel keys may remain unavailable until backend verification is completed

#### Scenario: Managed-site configuration is missing
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is missing or invalid
- **WHEN** the system determines the token's managed-site channel status
- **THEN** the system shows the token status as `unknown`
- **AND** the reason is `config-missing`

#### Scenario: Veloera suppresses per-token status UI and short-circuits verification
- **GIVEN** a token is rendered in Key Management
- **AND** the managed-site type is `Veloera`
- **WHEN** the system determines whether managed-site verification is available for that token
- **THEN** the system does not show per-token managed-site status badges, signal badges, or review links for that token
- **AND** the system does not attempt the shared base-URL search flow for that token
- **AND** any defensive token-status resolution is classified as `unknown` with reason `veloera-base-url-search-unsupported`

#### Scenario: Backend search fails unexpectedly
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the active managed-site provider supports reliable base-url channel lookup
- **WHEN** backend search does not return a usable result
- **THEN** the system shows the token status as `unknown`
- **AND** the reason is `backend-search-failed`

#### Scenario: Comparable channel inputs cannot be prepared
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the active managed-site provider supports reliable base-url channel lookup
- **WHEN** input preparation fails or omits required comparable base URL or models data
- **THEN** the system shows the token status as `unknown`
- **AND** the reason is `input-preparation-failed`

### Requirement: Status checks run automatically and support manual refresh
The system MUST begin managed-site status checks for the tokens in the current Key Management selection after their token inventory is available when the active managed-site provider supports reliable base-URL channel lookup for review/navigation flows.

The system MUST provide a page-level manual refresh action that reruns managed-site status checks for the current Key Management selection when the active managed-site provider supports reliable base-URL channel lookup for review/navigation flows.

The system MUST reuse in-memory status results for unchanged tokens until a refresh or invalidation event occurs.

The system MUST use bounded concurrency for bulk status checks so the managed-site backend is not flooded with one request per rendered token at once.

When the active managed-site provider does not support reliable base-URL channel lookup, the system MUST skip automatic status checks, MUST suppress the managed-site status refresh action, and MUST show localized page-level guidance that the verification flow is unsupported for that provider.

#### Scenario: Status checks start after token inventory loads
- **GIVEN** Key Management finishes loading token inventory for the current selection
- **AND** the active managed-site provider supports reliable base-url channel lookup
- **WHEN** the token list is rendered
- **THEN** the system begins managed-site status checks for those tokens without requiring the user to start an import flow

#### Scenario: Manual refresh reruns current-selection checks
- **GIVEN** Key Management is showing managed-site status results for the current selection
- **AND** the active managed-site provider supports reliable base-url channel lookup
- **WHEN** the user triggers the refresh action for managed-site status checks
- **THEN** the system reruns status checks for the tokens in the current selection
- **AND** the system replaces the prior results with the refreshed results when the rerun completes

#### Scenario: Unchanged tokens reuse cached results in the current session
- **GIVEN** a token already has a completed managed-site status result in the current Key Management session
- **AND** the token data and managed-site configuration have not changed
- **WHEN** Key Management rerenders without a refresh or invalidation event
- **THEN** the system reuses the existing managed-site status result for that token

#### Scenario: Veloera selection shows unsupported guidance instead of running checks
- **GIVEN** Key Management finishes loading token inventory for the current selection
- **AND** the active managed-site provider is `Veloera`
- **WHEN** the page renders its managed-site status controls
- **THEN** the system does not start managed-site status checks for the current selection
- **AND** the system does not show a managed-site status refresh action
- **AND** the page shows localized guidance that managed-site channel verification is unsupported for Veloera

### Requirement: Status results stay in sync with token and managed-site changes
The system MUST invalidate affected managed-site status results when local token state or managed-site configuration changes could make those results stale.

When the active managed-site provider changes to one that does not support reliable base-URL channel lookup, the system MUST clear previously rendered per-token managed-site status results and switch to the unsupported guidance state instead of rerunning verification checks.

#### Scenario: Successful managed-site import refreshes the affected token
- **GIVEN** a token is shown with managed-site status `not added` or `unknown`
- **WHEN** the user successfully imports that token to the managed site from Key Management
- **THEN** the system invalidates the cached managed-site status for that token
- **AND** the system refreshes the token's managed-site status without requiring a full-page reload

#### Scenario: Token edits or deletion invalidate prior status
- **GIVEN** a token already has a managed-site status result
- **WHEN** the token is edited or deleted in Key Management
- **THEN** the system invalidates the affected managed-site status result
- **AND** the system does not continue to show the stale result as final

#### Scenario: Managed-site preference changes invalidate prior results for supported providers
- **GIVEN** one or more tokens already have managed-site status results
- **AND** the updated managed-site provider supports reliable base-url channel lookup
- **WHEN** the managed-site type or managed-site admin configuration changes
- **THEN** the system invalidates the affected managed-site status results
- **AND** the system reruns managed-site status checks before showing refreshed final results

#### Scenario: Managed-site preference changes to Veloera clear prior results
- **GIVEN** one or more tokens already have managed-site status results
- **WHEN** the managed-site type changes to `Veloera`
- **THEN** the system clears the affected per-token managed-site status results
- **AND** the system stops showing token-level managed-site verification output
- **AND** the page shows localized guidance that managed-site channel verification is unsupported for Veloera

### Requirement: Status feedback does not expose secrets
The system MUST NOT include raw token keys, managed-site admin tokens, or other plaintext credentials in managed-site status labels, explanations, error messages, toasts, or logs emitted for this feature.

#### Scenario: Verification failure is reported without secret leakage
- **GIVEN** a managed-site status check fails while processing a token
- **WHEN** the system reports the failure to the user or records diagnostics for the feature
- **THEN** the reported output omits the raw token key and managed-site credentials
