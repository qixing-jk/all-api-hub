## Context

The extension’s Model Redirect feature auto-generates `standardModel -> actualModel` mappings from a channel’s reported `models` list. Today, model normalization relies on `renameModel(...)`, which consults `modelMetadataService.findStandardModelName(...)`. That metadata lookup includes a “fuzzy match” path intended to handle alias formats (different separators/orderings).

The current fuzzy match ignores version tokens and returns the first match encountered in metadata iteration order. This can normalize a versioned input to a different version (e.g., `claude-4.5-sonnet` normalizing to `claude-3-5-sonnet-*`), which then causes mapping generation to “fit” the wrong version and effectively downgrade/upgrade the target model.

## Goals / Non-Goals

**Goals:**
- Prevent auto-generated mappings from downgrading or upgrading model versions.
- Preserve safe alias handling (e.g., different separators/orderings such as `claude-4.5-sonnet` vs `claude-sonnet-4-5-*`).
- Keep behavior deterministic and testable (no dependence on metadata insertion order).

**Non-Goals:**
- Building a comprehensive semantic taxonomy of every vendor’s model lineup.
- Introducing “closest version” fallbacks (e.g., mapping `4.5` to `3.5` when `4.5` is unavailable).
- Changing or overwriting user-authored `model_mapping` entries beyond the existing “new keys override old keys” behavior.

## Decisions

1. **Add a version-aware compatibility check used by both metadata fuzzy matching and mapping generation**
   - Introduce a shared “model token key”/signature derived from a normalized token set (lowercase, unify separators, include version-like tokens such as `4`, `5`, `4o`, `o3`).
   - Treat two model names as alias-compatible only if their token signatures match (or if a stricter rule applies for a vendor).
   - Rationale: This allows safe alias matching across formatting differences while rejecting cross-version matches.
   - Alternatives:
     - Keep keyword-overlap fuzzy matching and add ad-hoc “version number equality” rules → error-prone across naming schemes.
     - Disable fuzzy matching entirely → would regress legitimate alias forms.

2. **Make `findStandardModelName` fuzzy matching deterministic and conservative**
   - Keep exact match first.
   - For fuzzy match, prefer signature equality (safe alias) over loose keyword matching.
   - If multiple candidates match, rank by:
     1) signature equality, then
     2) maximum keyword overlap (excluding obvious noise tokens), then
     3) stable tie-breaker (e.g., lexicographic).
   - Rationale: Removes dependence on metadata iteration order and prevents accidental downgrades/upgrades.

3. **Defense-in-depth in `generateModelMappingForChannel`**
   - After selecting a candidate actual model, validate that the standard model and candidate are version-compatible using the same signature rules.
   - If incompatible, skip (leave unmapped) rather than forcing a downgrade/upgrade.
   - Rationale: Even if metadata changes remotely, mapping generation remains safe.

4. **Tests as the contract**
   - Add unit tests covering the reported bad mappings (e.g., `claude-4.5-*` ↔ `claude-3.5-*`, `gemini-2.5-pro` ↔ `gemini-3-pro`, `gpt-4o-mini` ↔ `gpt-4.1-mini`) to ensure they are rejected.
   - Add positive tests for safe alias forms (separator/order-only differences).

## Risks / Trade-offs

- **[Fewer mappings generated]** → Users may see more “unmapped” standard models and need to adjust their standard model list or upstream channel models.
  - Mitigation: Keep exact/alias matching strong; document the behavior and provide clear guidance.
- **[Vendor naming ambiguity]** → Some model identifiers embed non-version numbers (sizes, dates).
  - Mitigation: Reuse existing date-suffix stripping; keep the signature logic token-based and avoid treating size tokens (e.g., `70b`) as numeric versions.
- **[Numeric-token commutativity]** → Because normalization uses an unordered token set, numeric version tokens can be treated as commutative (e.g., `claude-5.4-sonnet` and `claude-4.5-sonnet` normalize to the same token set).
  - Mitigation: No live models currently exhibit this collision; if such models appear, add a deterministic tie-breaker or switch to an ordered-token strategy for numeric tokens.
- **[Remote metadata inconsistencies]** → The remote model metadata source may include unexpected ids.
  - Mitigation: Apply the same compatibility guardrails in mapping generation (defense-in-depth) and cover with tests.

## Migration Plan

No data migration required. The change only affects auto-generated mappings; existing stored user preferences and channel `model_mapping` objects remain valid.

## Open Questions

- Should “version tokens” include letter+digit forms like `o3` (OpenAI) and digit+letter forms like `4o`? (Proposed: yes, as they are distinguishing identifiers and already part of token signatures.)

