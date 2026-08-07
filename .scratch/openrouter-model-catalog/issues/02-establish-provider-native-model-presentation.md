# Establish Provider-Native Model Presentation Seam

Status: ready-for-agent

Blocked by: none

## Objective

Introduce the provider-neutral model presentation boundary that lets each provider select substantially different facts, groups, ordering, formats, and structured renderers without adding provider branches to shared model React code.

## Scope

- Inspect the existing model domain, `ModelItem`, hooks, filtering, sorting, virtualization, and provider readiness contracts before choosing file placement.
- Define a stable Product Canonical Model core for shared behavior and a separate typed Model Display Fact contract for provider-native presentation.
- Support ordered summary facts, ordered detail sections, conditional visibility, localized labels and help, and a narrowly registered set of structured fact renderers.
- Keep raw provider DTOs and provider-specific field identifiers out of shared React components, hooks, filtering, sorting, and all-account orchestration.
- Add a provider-neutral source action-policy resolver so actions depend on source capability and usable runtime-secret availability.
- Preserve the existing model-card shell, expansion behavior, accessibility, responsive layout, filtering, sorting, and virtualization contracts.
- Reuse a small presentation-only primitive from native resources only if it removes demonstrated duplication; do not make the model contract depend on `ResourceDisplayFact` or resource-management terminology.

## Acceptance Criteria

- Neutral example providers can render different summary fields, detail sections, ordering, formats, missing values, and one structured fact without edits to shared renderer logic.
- The shared renderer cannot receive raw provider objects or infer field labels and ordering from upstream property names.
- Model facts have explicit semantics for price and metering units, limits, modalities, dates, and trusted links where applicable.
- Unknown fact kinds fail safely at the product-owned contract boundary rather than falling back to raw JSON or object stringification.
- Source actions are resolved without an OpenRouter condition in shared React code.
- Existing non-OpenRouter model cards retain their current behavior and actions.
- Public exported/shared props remain backward compatible unless a migration is completed for every direct use site in the same change.

## Tests

- Add focused type, helper, and component tests using only reserved example identities and domains.
- Prove different provider orderings and field sets, omission of missing optional facts, structured rendering, long-value handling, keyboard expansion, and unsupported-action absence.
- Cover every direct render/use site and standalone harness affected by shared prop changes.
- Do not assert complete rendered trees, incidental wrappers, or provider-specific labels in generic tests.

## Telemetry and E2E Decision

- Do not add telemetry for the internal seam; retain existing model-load telemetry behavior.
- Use component tests for the generic renderer. Defer browser E2E to the integrated OpenRouter workflow.

## Comments
