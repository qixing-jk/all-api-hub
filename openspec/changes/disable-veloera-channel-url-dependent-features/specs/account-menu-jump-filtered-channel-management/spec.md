## MODIFIED Requirements

### Requirement: Account menu includes a channel-location entry
The system MUST provide an entry in the account card “more actions / context menu” that helps the user locate the channel corresponding to the current account when the user has configured managed-site admin credentials in settings and the account is enabled.

The entry state MUST reflect whether the active managed-site provider supports reliable base-URL channel lookup for review/navigation flows:

- providers that support reliable base-URL lookup MUST render the entry as an actionable “Locate channel” command
- providers that do not support reliable base-URL lookup MUST render the same entry in a disabled state with visible explanatory text

#### Scenario: Menu entry is actionable for supported managed-site providers
- **GIVEN** the user has configured managed-site admin credentials in settings
- **AND** the active managed-site provider supports reliable base-url channel lookup
- **WHEN** the user opens the account “more actions” menu for an enabled account
- **THEN** the system shows an actionable “Locate channel” entry in Managed Site channel management

#### Scenario: Menu entry is disabled with an explanation for Veloera
- **GIVEN** the user has configured managed-site admin credentials in settings
- **AND** the active managed-site provider is `Veloera`
- **WHEN** the user opens the account “more actions” menu for an enabled account
- **THEN** the system shows the “Locate channel” entry in a disabled state
- **AND** the menu shows visible guidance that Veloera does not support reliable base-url channel lookup

### Requirement: Location action navigates to channel management with exact-only focus and search-based review fallbacks
This requirement applies only when the active managed-site provider supports reliable base-URL channel lookup for review/navigation flows.

When the user triggers the location action, the system MUST search candidate managed-site channels by normalized base URL and derive three reusable signals from the shared inspection:

- URL-bucket evidence: whether any channel exists under the normalized `base_url`
- Key evidence: `matched`, `no-key-provided`, `comparison-unavailable`, or `no-match`
- Model evidence ranked inside the normalized URL bucket as:
  1. Exact normalized model-set equality
  2. Containment in either direction after normalization and de-duplication
  3. Similarity at or above the configured model-similarity threshold

The system MUST use `channelId=<id>` only when the same channel satisfies both key matching and exact normalized model equality. All other outcomes MUST navigate to channel management with `search=<normalizedBaseUrl>`.

When the outcome is not an exact focus, the system MUST show user-visible feedback that reflects the dominant signal combination or fallback reason. The supported feedback outcomes MUST include:

- secondary exact-model review
- secondary model-containment review
- secondary model-similarity review
- key-only review
- same-channel key match with model drift
- conflicting key and model candidates
- fuzzy URL-only review
- unresolved URL-filtered fallback
- no-key, multiple-key, config-missing, input-preparation, and token-fetch failure fallbacks

#### Scenario: Exact channel match is found and focused
- **GIVEN** the account has exactly one API token available for comparison
- **AND** comparable channel inputs can be prepared
- **AND** the managed-site service can confirm a channel whose key matches and whose normalized model set exactly matches the account inputs
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `channelId=<id>` applied

#### Scenario: Secondary exact model-set match is found when key confirmation is unavailable
- **GIVEN** the account has exactly one API token available for comparison
- **AND** the managed-site service cannot confirm an exact key match because comparable key material is missing or hidden
- **AND** the managed-site service finds a candidate whose normalized `url + models` exactly match the account inputs
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<normalizedBaseUrl>` applied
- **AND** the system informs the user that a secondary exact-model review match was found

#### Scenario: Secondary model containment match is found
- **GIVEN** the account has exactly one API token available for comparison
- **AND** no exact focus can be confirmed
- **AND** the managed-site service finds a candidate whose normalized models contain the account models or are contained by them
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<normalizedBaseUrl>` applied
- **AND** the system informs the user that a secondary containment-based review match was found

#### Scenario: Secondary model similarity match is found
- **GIVEN** the account has exactly one API token available for comparison
- **AND** no exact focus or model-containment match can be confirmed
- **AND** the managed-site service finds a candidate whose normalized model similarity meets or exceeds the configured threshold
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<normalizedBaseUrl>` applied
- **AND** the system informs the user that a secondary similarity-based review match was found

#### Scenario: Key matches but models do not
- **GIVEN** the account has exactly one API token available for comparison
- **AND** a channel under the normalized URL bucket matches the comparable key
- **AND** no model-based match can be confirmed for that channel
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<normalizedBaseUrl>` applied
- **AND** the system informs the user that the key matched but the model set did not

#### Scenario: Key and model evidence point to different weak candidates
- **GIVEN** the account has exactly one API token available for comparison
- **AND** one candidate under the normalized URL bucket matches the comparable key
- **AND** a different candidate under the same URL bucket provides the strongest model-based match
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<normalizedBaseUrl>` applied
- **AND** the system informs the user that the key and model checks pointed to different channels

#### Scenario: Same channel matches the key but the model set only drifts approximately
- **GIVEN** the account has exactly one API token available for comparison
- **AND** the same channel under the normalized URL bucket matches the comparable key
- **AND** that channel only reaches containment or similarity for models instead of exact model equality
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<normalizedBaseUrl>` applied
- **AND** the system informs the user that the key matched but the model set still needs review

#### Scenario: Low-signal URL evidence falls back to fuzzy URL review
- **GIVEN** the account has exactly one API token available for comparison
- **AND** no exact or secondary model match can be confirmed
- **AND** the managed-site service can only confirm that at least one channel exists under the normalized URL bucket
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<normalizedBaseUrl>` applied
- **AND** the system informs the user that only a fuzzy URL-level match was found

#### Scenario: No ranked or URL-level match is found
- **GIVEN** the account has exactly one API token available for comparison
- **AND** the managed-site service cannot confirm any URL, key, or model signal for the account
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<normalizedBaseUrl>` applied
- **AND** the system informs the user that no likely channel could be confirmed

#### Scenario: Multiple API tokens prevent ranked exact selection
- **GIVEN** the account has multiple API tokens
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<normalizedBaseUrl>` applied
- **AND** the system informs the user that exact matching is skipped because multiple keys are available

#### Scenario: No API tokens available falls back to URL filtering
- **GIVEN** the account has no API tokens available
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<normalizedBaseUrl>` applied
- **AND** the system informs the user that ranked matching could not use an API key

#### Scenario: Matching inputs cannot be prepared and the UI falls back to URL filtering
- **GIVEN** the account has exactly one API token available for comparison
- **AND** the system cannot build comparable channel inputs or the prepared inputs omit required base URL or models data
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<normalizedBaseUrl>` applied
- **AND** the system informs the user that ranked matching could not be prepared

#### Scenario: Token list fetch fails or returns an unexpected shape
- **GIVEN** the system cannot fetch the account token list or receives an unexpected response shape
- **WHEN** the user triggers the location action
- **THEN** the system navigates to channel management with `search=<normalizedBaseUrl>` applied
- **AND** the system informs the user that locating the channel failed

#### Scenario: Managed-site configuration becomes unavailable at click-time
- **GIVEN** the menu entry is shown
- **AND** the managed-site admin configuration is missing when the action runs
- **WHEN** the user triggers the location action
- **THEN** the system informs the user that configuration is required before channels can be managed
- **AND** the system navigates to channel management with `search=<normalizedBaseUrl>` applied
