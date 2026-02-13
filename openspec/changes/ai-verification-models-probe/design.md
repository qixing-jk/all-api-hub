## Context

The API Verification feature runs a set of probes against a selected API type. Today, the `models` probe is effectively OpenAI-compatible-only: the probe registry short-circuits other API types as `unsupported`, and the probe implementation only fetches model IDs via the OpenAI-compatible model listing helper.

At the same time, the codebase already contains provider-specific model listing helpers for all supported API types:

- OpenAI-compatible/OpenAI: model IDs from `GET /v1/models`
- Anthropic: model IDs from `GET /v1/models`
- Google/Gemini: model IDs from `GET /v1beta/models`

This change brings the API Verification `models` probe in line with the supported API types, while keeping the rest of the verification flow and UI stable.

## Goals / Non-Goals

**Goals:**

- Allow the API Verification `models` probe to run for OpenAI-compatible, OpenAI, Anthropic, and Google/Gemini.
- Select the correct model listing endpoint per API type and expose the endpoint path in probe diagnostics.
- Keep probe output consistent (model count, suggested model ID, preview list) and sanitize failure summaries.
- Reuse existing provider-specific model listing helpers rather than introducing a new dependency.
- Allow the verification suite to resolve a model id via the `models` probe when none is provided.

**Non-Goals:**

- Changing how other probes behave beyond using a resolved model id when running the suite.
- Implementing sophisticated, provider-specific “best model” selection beyond the lightweight suggestion heuristic.
- Introducing caching or persistence for model lists.
- Adding or modifying API types beyond the current set.

## Decisions

### 1) Implement API-type dispatch inside `runModelsProbe`

**Decision:** Update `runModelsProbe` to accept the selected API type and call the corresponding model listing helper:

- OpenAI-compatible/OpenAI → OpenAI-family models listing helper
- Anthropic → Anthropic models listing helper
- Google/Gemini → Google models listing helper

**Rationale:** This keeps a single, probe-scoped implementation responsible for endpoint selection, output shaping, and sanitization. It also avoids duplicating fetch logic that already exists and is used elsewhere in the codebase.

### 2) Remove API-type gating in the probe registry

**Decision:** Remove the registry-level `unsupported` short-circuit for non-OpenAI-compatible API types and always delegate to `runModelsProbe`.

**Rationale:** The registry should be a dispatch layer, not a compatibility blocker. Compatibility is determined by the probe implementation, which now supports all API types in scope.

### 3) Normalize the probe base URL before calling listing helpers

**Decision:** Normalize the base URL inside the models probe to avoid duplicating version prefixes when constructing the final listing URL (for example, preventing `/v1/v1/models` and `/v1beta/v1beta/models`).

**Rationale:** Different callers may provide base URLs with or without version path segments. Normalizing centrally in the probe ensures consistent behavior and reduces caller-specific assumptions.

### 4) Keep suggested model selection lightweight and deterministic

**Decision:** Keep the suggested model ID as a best-effort choice derived from the returned list:

- Prefer obvious “primary” model families when possible (e.g., `gemini-*`, `claude-*`, `gpt-*`)
- Fall back to the first non-empty model ID

**Rationale:** The models list may include non-text-generation models. A small heuristic reduces false negatives without introducing heavy provider coupling.

### 5) Remove OpenAI-compatible-only model discovery in the suite runner

**Decision:** Always run the `models` probe first in the verification suite for all supported API types. Prefer an explicit model id when provided; otherwise, fall back to the `models` probe suggested model id for subsequent probes.

**Rationale:** This removes a special-case for OpenAI-compatible proxies and reduces friction across API types while keeping model selection deterministic and easy to understand.

## Risks / Trade-offs

- **[Model lists include non-generation models]** → Mitigation: keep the suggestion heuristic lightweight and keep probe failures informative so users can override the model id when needed.
- **[Base URL shape varies across callers]** → Mitigation: normalize inside the probe and include `endpoint` in input diagnostics to ease debugging.
- **[Large model lists]** → Mitigation: keep probe outputs bounded (preview list truncated) and rely on existing paging limits in provider helpers where applicable.
