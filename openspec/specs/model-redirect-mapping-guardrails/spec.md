# model-redirect-mapping-guardrails Specification

## Purpose
Ensure that the Model Redirect auto-mapping algorithm never generates downgrade/upgrade mappings across model versions, while still allowing safe alias mappings within the same version (separator style, token ordering, and optional date suffixes).

## Requirements
### Requirement: Auto-generated mappings MUST be version-safe
When the system auto-generates a model redirect mapping (`standardModel -> actualModel`), it MUST NOT generate entries that downgrade or upgrade model versions. If no version-compatible actual model exists for a given standard model, the system MUST omit the mapping entry for that standard model.

#### Scenario: Reject cross-version mapping (Anthropic)
- **WHEN** the standard model is `claude-4.5-sonnet` and the channel only exposes `claude-3-5-sonnet-20241022`
- **THEN** the generated mapping MUST NOT include an entry for `claude-4.5-sonnet`

#### Scenario: Reject cross-version mapping (OpenAI)
- **WHEN** the standard model is `gpt-4o-mini` and the channel only exposes `gpt-4.1-mini`
- **THEN** the generated mapping MUST NOT include an entry for `gpt-4o-mini`

#### Scenario: Reject cross-version mapping (Google)
- **WHEN** the standard model is `gemini-2.5-pro` and the channel only exposes `gemini-3-pro`
- **THEN** the generated mapping MUST NOT include an entry for `gemini-2.5-pro`

### Requirement: Alias formats of the same version MAY be mapped
When the standard model and an actual model represent the same version but differ only by separator style, token ordering, or presence of a date suffix, the system MUST be able to map the standard model to the actual model.

#### Scenario: Map reordered alias format for the same version
- **WHEN** the standard model is `claude-4.5-sonnet` and the channel exposes `claude-sonnet-4-5-20250929`
- **THEN** the generated mapping MUST map `claude-4.5-sonnet` to `claude-sonnet-4-5-20250929`

#### Scenario: Map separator-only alias format for the same version
- **WHEN** the standard model is `gemini-2.5-pro` and the channel exposes `gemini-2-5-pro`
- **THEN** the generated mapping MUST map `gemini-2.5-pro` to `gemini-2-5-pro`

### Requirement: Versioned normalization MUST NOT cross versions
When the system normalizes model identifiers for redirect generation, it MUST treat model versions as part of identity. If multiple candidates share the same vendor/model-family keywords but have different versions, normalization MUST NOT resolve an input to a different version.

**Note [Numeric-token commutativity]:** The current normalization approach is order-insensitive (unordered token set). Numeric version tokens can therefore be commutative (e.g., `claude-5.4-sonnet` vs `claude-4.5-sonnet` may normalize to the same token key). No live models currently exhibit this collision; if such models appear, introduce a deterministic tie-breaker or switch to an ordered numeric-token strategy to preserve version identity.

#### Scenario: Normalizing a standard model does not downgrade its version
- **WHEN** the system normalizes `claude-4.5-haiku` for redirect generation and metadata contains both `claude-3-5-haiku-20241022` and `claude-haiku-4-5-20251001`
- **THEN** the normalized result MUST be version-compatible with `4.5` (and MUST NOT normalize to the `3.5` model)
