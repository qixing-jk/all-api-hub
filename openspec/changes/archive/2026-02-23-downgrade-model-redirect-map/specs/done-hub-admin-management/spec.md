## MODIFIED Requirements

### Requirement: Model redirect works for Done Hub
When model redirect is enabled and `managedSiteType = done-hub`, the extension MUST be able to generate and apply a `model_mapping` update for eligible channels. The generated mapping MUST follow the Model Redirect Mapping Guardrails (no version downgrades/upgrades).

#### Scenario: Applying model redirect writes version-safe model_mapping for Done Hub channels
- **WHEN** the user runs model redirect with `managedSiteType = done-hub`
- **THEN** the extension MUST compute a standard-model-to-actual-model mapping per channel that contains no version-downgrade or version-upgrade mappings
- **AND** MUST merge the mapping into the channel’s existing `model_mapping`
- **AND** MUST persist the updated `model_mapping` via Done Hub admin APIs

#### Scenario: Incompatible standard models are left unmapped
- **WHEN** a selected standard model has no version-compatible actual model in a Done Hub channel’s `models` list
- **THEN** the extension MUST NOT write a `model_mapping` entry for that standard model for that channel

