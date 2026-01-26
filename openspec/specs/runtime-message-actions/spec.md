# runtime-message-actions Specification

## Purpose
TBD - created by archiving change quantify-message-action-identifiers. Update Purpose after archive.
## Requirements
### Requirement: Runtime message actions are centrally defined
The extension MUST define a canonical, exported registry of runtime message action IDs shared across extension contexts (background, popup/options, content scripts) to avoid ad-hoc string literals.

#### Scenario: Referencing an action ID
- **WHEN** a sender or receiver needs to reference a runtime message action name
- **THEN** it MUST use a value from the canonical action ID registry (not an inline string literal)

### Requirement: Runtime message action prefixes are centrally defined
For any feature that routes messages by `action` prefix, the extension MUST define a canonical, exported registry of action prefixes.

#### Scenario: Referencing an action prefix
- **WHEN** code performs prefix-based routing or filtering for runtime messages
- **THEN** it MUST use a value from the canonical prefix registry (not an inline prefix string)

### Requirement: Prefix matching is shared and null-safe
The extension MUST provide a shared helper for prefix matching that treats missing or non-string `action` values as non-matching.

#### Scenario: Non-string action does not match
- **WHEN** a runtime message is missing `action` or `action` is not a string
- **THEN** prefix matching MUST return `false`

### Requirement: Action composition is consistent with prefixes
The extension MUST provide a shared way to compose an action ID from a prefix and suffix, and the resulting value MUST equal the shipped on-the-wire action string.

#### Scenario: Compose a namespaced action
- **WHEN** composing the external check-in prefix with the `openAndMark` suffix
- **THEN** the result MUST equal `externalCheckIn:openAndMark`

### Requirement: Existing action values remain stable
Existing shipped runtime message action IDs and prefixes MUST remain stable across refactors so existing senders/receivers continue to interoperate without behavior changes.

#### Scenario: Existing action constant matches shipped value
- **WHEN** code references the canonical action ID for permission checks
- **THEN** its value MUST equal `permissions:check`

### Requirement: Action IDs are unique
All canonical runtime message action ID values MUST be unique to prevent ambiguous routing.

#### Scenario: Duplicate action IDs are prevented
- **WHEN** the canonical action ID registry contains two entries with the same string value
- **THEN** the duplicate MUST be detected and prevented from shipping

