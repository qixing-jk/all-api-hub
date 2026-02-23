## Why

Auto-generated model redirect mappings can currently mismatch model versions (e.g., mapping a `claude-4.5-*` standard model to a `claude-3.5-*` actual model). This effectively downgrades/upgrades the requested model and can silently change quality, cost, and behavior.

## What Changes

- Tighten model normalization/metadata fuzzy matching so “standard model” normalization never resolves to a different model version.
- Add guardrails to model redirect mapping generation so it MUST NOT produce mappings that downgrade or upgrade a model version; incompatible candidates are skipped instead.
- Add focused tests covering version-mismatch cases across vendors (Anthropic/OpenAI/Google) to prevent regressions.
- Document the new behavior so users understand why some mappings are intentionally not generated.

## Capabilities

### New Capabilities
- `model-redirect-mapping-guardrails`: Ensure auto-generated `standardModel -> actualModel` mappings are version-safe (no upgrades/downgrades) and only map compatible model versions/variants.

### Modified Capabilities
- `done-hub-admin-management`: Model redirect generation for Done Hub channels MUST follow the same version-safety guardrails when computing and applying `model_mapping`.

## Impact

- Model redirect pipeline: `services/modelRedirect/*` (normalization + mapping generation).
- Metadata normalization/fuzzy matching: `services/modelMetadata/*`.
- Tests: `tests/services/modelRedirect/*` (and any metadata matching tests as needed).
- Documentation: `docs/docs/model-redirect.md` (behavior clarification and guidance).

