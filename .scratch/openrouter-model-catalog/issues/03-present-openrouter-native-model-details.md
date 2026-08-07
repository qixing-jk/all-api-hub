# Present Full OpenRouter-Native Model Details

Status: ready-for-agent

Blocked by: 02

## Objective

Expose the provider information that makes OpenRouter useful without changing the shared model-card shell or passing raw upstream JSON to React.

## Scope

- Maintain an exhaustive inventory of stable documented OpenRouter model fields.
- Classify every field as Product Canonical Model, native summary, native detail, or intentionally hidden with a recorded reason.
- Add provider-local schemas and normalization for every rendered or behavior-controlling field.
- Render multi-dimensional prices, conditional overrides, architecture, routing-provider data, per-request limits, modalities, supported/default parameters, reasoning, voices, aliases, benchmarks, lifecycle data, and trusted links with explicit units and reviewed labels.
- Treat malformed optional fields as unavailable; do not fail an otherwise usable model unless identity or a protocol invariant is invalid.
- Keep routing-provider information distinct from publisher evidence and collapsed cards bounded and scan-friendly.
- Ignore unknown fields at runtime while making contract drift visible to maintainers.

## Acceptance Criteria

- OpenRouter renders a field set, section order, and detail format that materially differ from a neutral provider without an OpenRouter branch in the shared card.
- Every stable documented field has exactly one classification; hidden fields include a reason.
- No raw JSON, raw object stringification, upstream property-name labels, or untrusted links are rendered.
- Prices include currency and meter units; overrides cannot be mistaken for the unconditional headline price.
- Unknown, missing, null, wrong-type, negative, non-finite, and partial nested values degrade according to their semantic policy.
- Zero remains distinct from missing or invalid, and long values remain usable on narrow viewports and with assistive technology.

## Tests

- Add a pinned official-schema inventory test that reports unclassified additions/removals without making additive runtime fields crash the UI.
- Cover structured renderers, nested partial failures, publisher-versus-routing-provider mapping, price dimensions and overrides, unit conversion, trusted links, conditional visibility, ordering, and omission of missing facts.
- Keep shared fixtures provider-neutral; test OpenRouter field knowledge only in provider-local tests.

## Telemetry and E2E Decision

- Do not emit telemetry for individual fields, model identities, links, prices, descriptions, or upstream errors.
- Reuse the representative Chromium flow from Ticket 02 and extend it to verify rich detail expansion.

## Comments
