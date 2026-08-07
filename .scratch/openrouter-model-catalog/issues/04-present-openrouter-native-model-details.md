# Present Full OpenRouter-Native Model Details

Status: ready-for-agent

Blocked by: 03

## Objective

Use an OpenRouter-local presentation policy to expose the provider's useful catalog information with provider-specific fields, sections, ordering, and rich formats while preserving the shared model-card shell.

## Scope

- Maintain an exhaustive inventory of stable documented OpenRouter model fields.
- Classify every field as Product Canonical Model, native summary, native detail, or intentionally hidden with a recorded reason.
- Add provider-local runtime schemas and normalization for every field that is rendered or controls behavior.
- Deep-validate nested pricing, conditional overrides, architecture, routing-provider data, per-request limits, modalities, supported/default parameters, reasoning, voices, aliases, benchmarks, lifecycle data, and trusted links only to the depth required by their product behavior.
- Treat malformed optional fields as unavailable or omit them; do not fail an otherwise usable model unless shared identity or a required protocol invariant is invalid.
- Render primary prices, additional meters, conditional overrides, limits, modalities, supported parameters, reasoning, lifecycle, voices, aliases, benchmarks, and links with explicit units and reviewed labels.
- Keep routing-provider information distinct from publisher evidence.
- Keep collapsed cards bounded and scan-friendly; put rich multidimensional facts in ordered expanded sections.
- Ignore new unknown upstream fields at runtime while making contract drift visible to maintainers.

## Acceptance Criteria

- OpenRouter can render a field set and order materially different from another provider without an OpenRouter branch in the shared card.
- Every stable documented field has exactly one recorded classification and hidden fields include a reason.
- No raw JSON, raw object stringification, upstream property-name labels, or untrusted links are rendered.
- Prices include currency and meter units; conditional or long-context overrides cannot be mistaken for the unconditional headline price.
- Unknown, missing, null, wrong-type, negative, non-finite, and partially malformed values degrade according to the field's semantic policy.
- Zero remains distinct from missing or invalid.
- Long IDs, labels, values, and sections remain usable on narrow viewports and with keyboard or assistive technology.

## Tests

- Add a pinned official-schema inventory or equivalent maintained contract test that reports unclassified additions/removals without turning additive runtime fields into user-facing crashes.
- Cover every structured renderer and the most relevant partial/nested-malformation cases.
- Cover publisher-versus-routing-provider mapping, price dimensions and overrides, unit conversion, trusted-link filtering, conditional visibility, ordering, and omission of missing facts.
- Keep shared-renderer fixtures provider-neutral; test OpenRouter field knowledge only in provider-local tests.

## Telemetry and E2E Decision

- Do not emit telemetry for individual fields, model identities, links, prices, descriptions, or upstream errors.
- Keep the full field matrix in Vitest; the representative E2E needs to prove only that rich details can expand and remain usable.

## Comments
