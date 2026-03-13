## MODIFIED Requirements

### Requirement: Key Management shows managed-site verification status and review signals for each loaded key
The system MUST display a managed-site channel status for each token rendered in Key Management for the currently configured managed-site context.

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
- **AND** the system can prepare comparable channel inputs
- **WHEN** the shared resolver finds that the same channel satisfies key matching and exact model equality
- **THEN** the system shows the token status as `added`
- **AND** the row links directly to `channelId=<id>` for that exact channel

#### Scenario: Search completes without any URL, key, or model signal
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** the token has a non-empty comparable key
- **AND** backend search completes without finding any URL-bucket, key, or model signal
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `not added`

#### Scenario: Secondary exact model-set review match is shown as unknown
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** no exact channel can be confirmed
- **AND** the managed-site status check finds a candidate whose normalized `url + models` exactly match the token inputs
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `unknown`
- **AND** the row shows model evidence for an exact model-set match
- **AND** the row provides a review action that opens channel management with `search=<searchBaseUrl>`

#### Scenario: Secondary model containment review match is shown as unknown
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** no exact channel or exact model-set match can be confirmed
- **AND** the managed-site status check finds a candidate whose normalized models contain the token models or are contained by them
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `unknown`
- **AND** the row shows model evidence for containment-based review
- **AND** the row provides a review action that opens channel management with `search=<searchBaseUrl>`

#### Scenario: Secondary model similarity review match is shown as unknown
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** no exact, exact-model, or containment-based match can be confirmed
- **AND** the managed-site status check finds a candidate whose normalized model similarity meets or exceeds the configured threshold
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `unknown`
- **AND** the row shows model evidence for similarity-based review
- **AND** the row provides a review action that opens channel management with `search=<searchBaseUrl>`

#### Scenario: URL-only evidence is shown as unknown review state
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** no exact or secondary model match can be confirmed
- **AND** the managed-site status check can only confirm that a normalized URL bucket exists
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `unknown`
- **AND** the row shows URL evidence plus a model no-match signal
- **AND** the row provides a review action that opens channel management with `search=<searchBaseUrl>`

#### Scenario: Key-only evidence is shown as unknown review state
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **AND** a channel under the normalized URL bucket matches the comparable key
- **AND** no model-based match can be confirmed
- **WHEN** the managed-site status check completes
- **THEN** the system shows the token status as `unknown`
- **AND** the row shows key-matched evidence and model no-match evidence
- **AND** the row provides a review action that opens channel management with `search=<searchBaseUrl>`

#### Scenario: Exact verification is unavailable when no comparable key is available
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
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

#### Scenario: Veloera short-circuits because base URL search is unsupported
- **GIVEN** a token is rendered in Key Management
- **AND** the managed-site type is `Veloera`
- **WHEN** the system determines the token's managed-site channel status
- **THEN** the system shows the token status as `unknown`
- **AND** the reason is `veloera-base-url-search-unsupported`
- **AND** the system does not attempt the shared base-URL search flow

#### Scenario: Backend search fails unexpectedly
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **WHEN** backend search does not return a usable result
- **THEN** the system shows the token status as `unknown`
- **AND** the reason is `backend-search-failed`

#### Scenario: Comparable channel inputs cannot be prepared
- **GIVEN** a token is rendered in Key Management
- **AND** managed-site admin configuration is valid
- **WHEN** input preparation fails or omits required comparable base URL or models data
- **THEN** the system shows the token status as `unknown`
- **AND** the reason is `input-preparation-failed`
