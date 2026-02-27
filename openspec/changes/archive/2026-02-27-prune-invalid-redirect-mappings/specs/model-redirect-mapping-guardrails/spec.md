## ADDED Requirements

### Requirement: Prune mappings whose target models are missing or invalid after model sync (site-aware)
When managed-site model sync refreshes a channel’s `models` list and the refreshed model list is different from the previously stored list, the system MUST be able to prune existing model redirect mappings (`model_mapping`) whose **target** models are not valid under the refreshed model list, when the prune option is enabled.

Validity is **site-aware**:
- Strict sites: `target.trim()` must exist in the refreshed model list.
- DoneHub: strip a single leading `+` before checking existence.
- New API: targets may be chained; a target is valid when it can resolve via `model_mapping` (A→B→C) to an available model. Cycles are invalid.

#### Scenario: Pruning is disabled by default
- **GIVEN** the user has not enabled the prune option
- **WHEN** model sync refreshes a channel’s model list and the model list changes
- **THEN** the system MUST NOT delete any existing `model_mapping` entries based on missing targets

#### Scenario: Pruning removes entries whose targets are missing from the refreshed model list
- **GIVEN** the prune option is enabled
- **AND** a channel has an existing `model_mapping` that includes an entry mapping standard model `S` to target model `T`
- **WHEN** model sync refreshes the channel model list to a new list that does not contain `T`
- **THEN** the system MUST delete the mapping entry `S -> T` before persisting the updated `model_mapping`

#### Scenario: Pruning preserves entries whose targets exist in the refreshed model list
- **GIVEN** the prune option is enabled
- **AND** a channel has an existing `model_mapping` that includes an entry mapping standard model `S` to target model `T`
- **WHEN** model sync refreshes the channel model list to a new list that contains `T`
- **THEN** the system MUST preserve the mapping entry `S -> T`

#### Scenario: New API preserves entries whose targets resolve via a mapping chain
- **GIVEN** the prune option is enabled
- **AND** the managed site type is New API (`new-api`)
- **AND** a channel has an existing `model_mapping` that includes `S -> T` and `T -> U`
- **WHEN** model sync refreshes the channel model list to a new list that contains `U` but does not contain `T`
- **THEN** the system MUST preserve the mapping entry `S -> T` (because `T` resolves to `U`)

#### Scenario: New API prunes entries when model_mapping contains a cycle
- **GIVEN** the prune option is enabled
- **AND** the managed site type is New API (`new-api`)
- **AND** a channel has an existing `model_mapping` that contains a mapping cycle
- **WHEN** model sync refreshes the channel model list
- **THEN** the system MUST treat cycle-resolving targets as invalid and prune affected entries

#### Scenario: DoneHub preserves entries whose targets use the billing-original '+' prefix
- **GIVEN** the prune option is enabled
- **AND** the managed site type is DoneHub (`done-hub`)
- **AND** a channel has an existing `model_mapping` that includes an entry mapping standard model `S` to target model `+T`
- **WHEN** model sync refreshes the channel model list to a new list that contains `T`
- **THEN** the system MUST preserve the mapping entry `S -> +T`

#### Scenario: Pruning is best-effort when existing model_mapping is invalid JSON
- **GIVEN** the prune option is enabled
- **AND** a channel has an existing `model_mapping` value that is not valid JSON
- **WHEN** model sync refreshes the channel model list
- **THEN** the system MUST NOT delete mappings based on the invalid `model_mapping`
- **AND** the system MUST continue applying any newly generated mappings as normal
