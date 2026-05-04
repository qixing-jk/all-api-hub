## ADDED Requirements

### Requirement: Channel filters support probe-backed rules
The system SHALL allow managed-site channel model filters to contain both pattern-backed rules and probe-backed rules in the same global or per-channel rule list.

Probe-backed rules MUST store only rule metadata needed for execution, including the selected probe identifiers and include/exclude action. Probe-backed rules MUST NOT store raw channel keys, manually entered API keys, or copied credential defaults.

Existing stored rules that do not declare a rule kind MUST continue to load as pattern-backed rules.

#### Scenario: User adds a probe-backed rule
- **WHEN** a user adds a model filter rule in the managed-site channel filter editor or global channel model sync settings
- **THEN** the system allows the rule to be configured as a probe-backed rule
- **AND** the rule stores selected probe identifiers and the include/exclude action
- **AND** the rule does not store any raw API key or copied channel credential

#### Scenario: Legacy pattern rule remains valid
- **WHEN** the system loads a stored filter rule that has no explicit rule kind
- **THEN** the system treats the rule as a pattern-backed rule
- **AND** the rule continues to match models with the existing substring or regex behavior

#### Scenario: Imported probe rule with credential fields is sanitized
- **WHEN** a user imports or saves a probe-backed rule payload that includes a raw key, manual api key, or copied credential field
- **THEN** the system removes those credential fields before persistence
- **AND** the persisted rule remains executable only through the target channel's resolved key

### Requirement: Probe-backed rules compose with existing include/exclude filtering
The system SHALL evaluate enabled probe-backed rules together with existing pattern-backed rules using the existing managed-site model filter composition model.

Within a global or per-channel rule list, enabled include rules MUST be OR-composed first when at least one include rule exists, and enabled exclude rules MUST be OR-composed afterward. A probe-backed rule MUST match a model only when its selected probe condition passes for that model.

#### Scenario: Include probe keeps only passing models
- **WHEN** a channel sync run evaluates an enabled include probe rule for text generation
- **AND** model `model-a` passes the text-generation probe
- **AND** model `model-b` fails the text-generation probe
- **THEN** the filtered model list includes `model-a`
- **AND** the filtered model list excludes `model-b`

#### Scenario: Exclude probe removes matching models after include filtering
- **WHEN** a channel sync run evaluates enabled include rules and then an enabled exclude probe rule
- **AND** a model remains after include filtering
- **AND** that model matches the exclude probe rule
- **THEN** the filtered model list removes that model

#### Scenario: Disabled probe rule has no effect
- **WHEN** a channel sync run evaluates a disabled probe-backed rule
- **THEN** the disabled rule does not run probes
- **AND** the disabled rule does not change the filtered model list

### Requirement: Probe execution uses the target channel key
The system MUST execute probe-backed filter rules with the target managed-site channel's own `base_url` and resolved channel key.

The system MUST NOT collect separate manual `baseUrl` or `apiKey` values for probe-backed filter execution. The system MUST NOT use credentials cached from channel creation as a fallback source for probe-backed filter execution.

#### Scenario: Channel exposes a usable key
- **GIVEN** a managed-site channel has a non-empty usable `key`
- **WHEN** probe-backed filtering runs for that channel
- **THEN** the system runs the selected probes with `baseUrl` from the channel's `base_url`
- **AND** the system runs the selected probes with `apiKey` from the channel's own `key`

#### Scenario: Channel key must be resolved
- **GIVEN** a managed-site channel has an empty or hidden `key`
- **AND** the active managed-site provider supports resolving channel secret keys
- **WHEN** probe-backed filtering runs for that channel
- **THEN** the system attempts to resolve the channel key through the provider's existing channel-key resolution path
- **AND** the system uses the resolved channel key for probe execution

#### Scenario: Manual credentials are not accepted
- **WHEN** a user configures a probe-backed filter rule
- **THEN** the system does not offer rule fields for manually entering probe `baseUrl` or `apiKey`
- **AND** the system does not persist rule-level credential defaults

### Requirement: Automatic sync handles unavailable channel keys without destructive model updates
The system SHALL keep scheduled or background managed-site channel sync non-interactive when probe-backed filters require a channel key that cannot be resolved.

If a channel key is unavailable, requires user verification, or is unsupported by the provider, the system MUST report the affected channel as not updated for that sync attempt and MUST NOT clear or overwrite the channel's existing model list because probe filtering could not run.

#### Scenario: Scheduled sync cannot resolve a hidden key
- **GIVEN** a channel has enabled probe-backed filter rules
- **AND** the channel key is hidden
- **AND** resolving the key requires interactive verification
- **WHEN** scheduled managed-site model sync processes the channel
- **THEN** the sync result for that channel reports a recoverable key-unavailable failure
- **AND** the system does not update that channel's models field
- **AND** the system does not open an interactive verification dialog

#### Scenario: Provider does not support channel key resolution
- **GIVEN** a channel has enabled probe-backed filter rules
- **AND** the active managed-site provider cannot resolve channel secret keys
- **WHEN** managed-site model sync processes the channel
- **THEN** the sync result reports that probe-backed filtering is unsupported for that channel
- **AND** the system does not update that channel's models field due to the unsupported probe filter

#### Scenario: Pattern-only filtering remains non-blocking
- **GIVEN** a channel has only pattern-backed filter rules
- **WHEN** managed-site model sync processes the channel
- **THEN** the system does not require channel key resolution for filtering
- **AND** the existing pattern-backed filtering behavior remains available

### Requirement: Interactive probe recovery reuses managed-site verification paths
The system SHALL provide recoverable, localized guidance when probe-backed filtering cannot run because a channel key is unavailable in an interactive surface.

For New API managed sites, interactive recovery MUST reuse the existing managed-site verification flow for resolving hidden channel keys. The recovery flow MUST retry probe-backed filtering with the same channel after verification succeeds.

#### Scenario: User retries after New API verification
- **GIVEN** a New API channel has enabled probe-backed filter rules
- **AND** resolving the channel key requires secure verification
- **WHEN** the user starts an interactive retry or test action for probe-backed filtering
- **THEN** the system opens the existing New API managed-site verification recovery flow
- **AND** after verification succeeds, the system retries probe-backed filtering with the same channel key resolution path

#### Scenario: Recovery guidance avoids manual credential entry
- **WHEN** probe-backed filtering cannot run in an interactive surface because the channel key is unavailable
- **THEN** the system shows guidance for resolving or verifying the managed-site channel key
- **AND** the system does not ask the user to enter a separate API key for the probe rule

### Requirement: Probe-backed filters only run for supported verification API types
The system SHALL run probe-backed filter rules only when the target channel type can be mapped to a supported API verification type.

The mapping MUST be derived from the channel type and MUST NOT be supplied by a rule-level manual API type override. Unsupported channel types MUST be prevented in the visual editor where the channel context is known and MUST be reported as unsupported if encountered during sync or JSON import.

#### Scenario: Supported channel type maps to verification API type
- **GIVEN** a channel type maps to a supported API verification type
- **WHEN** probe-backed filtering runs for that channel
- **THEN** the system executes selected probes with the mapped verification API type

#### Scenario: Unsupported channel type is not probed
- **GIVEN** a channel type does not map to any supported API verification type
- **WHEN** probe-backed filtering runs for that channel
- **THEN** the system does not execute API verification probes for that channel
- **AND** the system reports the probe-backed filter as unsupported for that channel type

#### Scenario: Rule does not override channel API type
- **WHEN** a probe-backed rule is saved
- **THEN** the persisted rule does not contain a manual API type override
- **AND** later probe execution derives API type from the target channel

### Requirement: Probe diagnostics are secret-safe
The system MUST treat channel keys used by probe-backed filters as secrets.

User-facing errors, toasts, execution results, logs, probe input diagnostics, and probe output diagnostics produced by probe-backed filtering MUST NOT include raw channel keys or copied credential material.

#### Scenario: Probe failure omits raw channel key
- **GIVEN** probe-backed filtering runs with channel key `sk-secret-value`
- **WHEN** a selected probe fails
- **THEN** the displayed failure summary does not contain `sk-secret-value`
- **AND** emitted logs and diagnostics do not contain `sk-secret-value`

#### Scenario: Key resolution failure omits raw secrets
- **WHEN** channel key resolution fails while preparing probe-backed filtering
- **THEN** the reported error omits raw managed-site admin tokens, channel keys, passwords, TOTP secrets, and generated verification codes
- **AND** the reported error remains actionable through localized recovery guidance
