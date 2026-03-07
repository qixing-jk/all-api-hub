## Context

The current CLIProxy import flow is hard-wired to the `openai-compatibility` management API. `src/components/CliProxyExportDialog.tsx` always pre-fills an OpenAI-style `/v1` base URL, fetches OpenAI-compatible models, and calls `src/services/integrations/cliProxyService.ts`, which only knows how to read and write the OpenAI-compatible provider list.

That assumption no longer matches the surrounding product surface. The dialog is reused from account/token actions and from API credential profiles, but the profile path currently loses the original `apiType` when it is adapted through `src/features/ApiCredentialProfiles/utils/exportShims.ts`. As a result, the UI cannot preselect a better CLIProxy provider family even when the source credentials are explicitly OpenAI-, Anthropic-, or Gemini-style.

Upstream CLIProxyAPI also separates provider families at the management layer. Besides `openai-compatibility`, it exposes dedicated list endpoints for `claude-api-key`, `gemini-api-key`, and `codex-api-key`. Their base URL semantics differ:

- `openai-compatibility` requires an explicit `base-url`, and the executor appends request paths such as `/chat/completions`.
- `claude-api-key` allows an empty `base-url` and falls back to Claude's default upstream, then appends `/v1/messages?beta=true`.
- `gemini-api-key` allows an empty `base-url` and falls back to Gemini's default upstream, then appends the version/model path.
- `codex-api-key` requires an explicit `base-url`, and the executor appends the Codex backend path automatically.

The design therefore needs to solve two problems at once: expose provider type selection in the UI, and centralize provider-specific normalization/update rules in the integration service so path completion stays correct.

## Goals / Non-Goals

**Goals:**
- Let the user choose the target CLIProxy provider type during import instead of assuming OpenAI-compatible only.
- Preselect a sensible provider type when the source already carries an API-type hint, including mapping OpenAI sources to `codex-api-key`, while keeping the current OpenAI-compatible default for account/token flows.
- Normalize base URLs according to the selected provider family so users can paste a host or a full endpoint without creating duplicated path segments.
- Reuse CLIProxy's provider-specific management list endpoints instead of replacing the full config file.
- Preserve backward compatibility for the existing OpenAI-compatible import path.

**Non-Goals:**
- Support every CLIProxy config bucket in the first rollout; `vertex-api-key` and `amp-code` remain out of scope.
- Expose every advanced upstream-only field such as `headers`, `priority`, `cloak`, or websocket transport settings.
- Auto-detect the provider type from hostnames or URL patterns alone.
- Migrate or rewrite existing CLIProxy entries automatically.

## Decisions

**1. Introduce a dedicated `CliProxyProviderType` abstraction**

The implementation will add a local provider-type abstraction aligned to CLIProxy's management routes rather than reusing `ApiVerificationApiType` directly.

Initial supported values:
- `openai-compatibility`
- `claude-api-key`
- `gemini-api-key`
- `codex-api-key`

Default mapping from source hints:
- API credential profile `openai-compatible` → `openai-compatibility`
- API credential profile `openai` → `codex-api-key`
- API credential profile `anthropic` → `claude-api-key`
- API credential profile `google` → `gemini-api-key`
- Account/token flows without a hint → `openai-compatibility`
- `codex-api-key` stays user-selectable even without a hint, but the primary automatic mapping is from explicit OpenAI sources

This keeps the UI aligned with the actual target system while still allowing profile-based exports to prefill the most likely choice, especially for OpenAI credentials that should land in the Codex bucket rather than the OpenAI-compatible bucket.

Alternatives considered:
- Reuse `ApiVerificationApiType` directly: rejected because it cannot represent Codex and does not match CLIProxy's route keys.
- Expose all upstream provider buckets immediately: rejected because some buckets require extra semantics or additional fields that are outside this change.

**2. Pass the source API-type hint into the dialog instead of guessing**

`CliProxyExportDialog` will grow an optional source hint prop, for example `apiTypeHint?: ApiVerificationApiType`. Account/token callers can omit it, but API credential profile callers should pass the real `profile.apiType` instead of losing it inside the export shims.

This keeps provider preselection deterministic and avoids brittle host-based inference for self-hosted or custom-domain deployments.

Alternatives considered:
- Infer from `account.baseUrl`: rejected because custom domains and reverse proxies make URL-only inference unreliable.
- Infer from token names or site type: rejected because the mapping is weaker than the explicit profile `apiType`.

**3. Drive both UI and service behavior from one provider metadata table**

Provider-specific rules will be centralized in one metadata map near the CLIProxy integration layer. Each entry should describe:
- translated label/help text key
- management route segment
- whether `base-url` is required or optional
- default base URL behavior when the field is left empty
- normalization helper to apply before save
- matching strategy for update-vs-append
- whether `providerName` is supported
- which optional inputs are shown (`proxyUrl`, `models`)

The dialog consumes this metadata to render the right fields and helper text, and the service consumes the same metadata to build payloads and target the correct management endpoint.

Alternatives considered:
- Scatter conditionals across dialog and service: rejected because it invites drift between what the UI promises and what the service writes.

**4. Normalize `base-url` differently per provider family**

The dialog should accept either a clean host/deployment base URL or a pasted full API endpoint, then normalize it according to the selected provider type before submission.

Normalization rules:
- `openai-compatibility`: store a base URL that explicitly ends in `/v1`, because CLIProxy appends endpoint paths but does not add `/v1` on its own.
- `claude-api-key`: allow the field to be empty to use CLIProxy's default Claude upstream. If non-empty, normalize to the base host/deployment path and strip pasted request suffixes such as `/v1/messages`.
- `gemini-api-key`: allow the field to be empty to use CLIProxy's default Gemini upstream. If non-empty, reuse the existing Google-family normalization that strips `/v1beta...` while preserving deployment subpaths.
- `codex-api-key`: require a non-empty base URL, but strip pasted request suffixes such as `/backend-api/codex/v1/...` while preserving deployment subpaths.

Existing normalization helpers should be reused where they already match the provider behavior (`normalizeOpenAiFamilyBaseUrl`, `normalizeGoogleFamilyBaseUrl`, `stripTrailingOpenAIV1`). A small Codex-specific helper can be added rather than relying on ad-hoc string slicing.

Alternatives considered:
- Preserve user input unchanged: rejected because the issue is specifically about provider-specific path handling, and raw endpoint pastes would keep producing duplicated or invalid paths.

**5. Make the dialog conditional, but keep one shared flow**

The import dialog stays a single reusable modal instead of branching into separate dialogs per provider family.

Field behavior by provider type:
- `providerName` stays visible only for `openai-compatibility`, because the other supported list-based provider sections do not have a top-level name field.
- `base-url` stays visible for all supported types, but its required state, placeholder, and helper text change with the selected provider type.
- `proxy-url` remains available as an optional advanced input for supported list-based types.
- `models` remains available as an optional advanced input; every supported provider type keeps manual entry, and the dialog also loads provider-family-specific model suggestions using the matching upstream model-list endpoint when available.

This keeps the feature discoverable without multiplying components, while still acknowledging the real differences in CLIProxy's config model.

Alternatives considered:
- Separate dialog per provider type: rejected because most of the workflow is shared and the duplication cost is high.
- Hide all advanced inputs for non-OpenAI types: rejected because CLIProxy supports those fields and the existing dialog already teaches users that these options exist.

**6. Generalize the service around provider-list adapters, not raw config uploads**

`src/services/integrations/cliProxyService.ts` will be refactored into provider-list adapters keyed by `CliProxyProviderType`.

High-level write flow:
1. Resolve the selected provider metadata.
2. Normalize the submitted input into a provider-specific draft.
3. Fetch the current list from the matching management endpoint.
4. Find an existing entry using the provider-type matcher.
5. If matched, patch that index with the new value.
6. If no match exists, append a new entry and replace the list with `PUT`.

Matching strategy:
- `openai-compatibility`: match normalized `base-url` first, then `name`.
- `claude-api-key`: match by `api-key`, optionally tightening with `base-url` when the user supplied one.
- `gemini-api-key`: match by `api-key` plus normalized `base-url` when available, otherwise fall back to `api-key`.
- `codex-api-key`: match by normalized `base-url` plus `api-key`, with `api-key` fallback if needed.

For provider families without a top-level name field, success messages should use the translated provider-type label and a small identifier such as the normalized base URL rather than a fabricated name field.

Alternatives considered:
- Upload the full `config.yaml`: rejected because it has a much larger conflict surface and is unnecessary for this focused change.
- Always `PUT` the entire provider list even for updates: rejected because index-based `PATCH` is a better fit for in-place edits and mirrors the current OpenAI-compatible logic.

## Risks / Trade-offs

- [Wrong provider-type normalization] → Mitigation: centralize the normalization helpers and add focused tests for pasted full-endpoint cases per provider type.
- [Profile exports preselect the wrong type when no hint is available] → Mitigation: pass `apiTypeHint` from API credential profiles, map explicit `openai` hints to `codex-api-key`, and keep account/token flows on the current OpenAI-compatible default.
- [Non-OpenAI entries do not have a user-visible name field] → Mitigation: do not invent unsupported names; use provider-type labels and normalized endpoint context in helper text and success toasts.
- [Provider-specific model suggestions may use the wrong upstream contract] → Mitigation: route suggestion loading through provider-family-specific fetchers and normalize the source base URL before requesting models.
- [Concurrent edits to the same provider list] → Mitigation: prefer `PATCH` for matched entries and reserve `PUT` for append flows.

## Migration Plan

- No persisted-data migration is required; the change only affects the import UI and CLIProxy integration service.
- Rollout is additive: existing OpenAI-compatible imports continue to use the same default type and payload shape, while OpenAI-hinted imports default to `codex-api-key` unless the user selects another provider type.
- Rollback is straightforward: remove the selector and keep the current OpenAI-compatible-only adapter.
- Existing CLIProxy entries remain untouched unless the user explicitly runs a new import.

## Open Questions

- Should `vertex-api-key` be part of the first implementation, or should it remain a follow-up after validating the extra fields and real-world deployments we want to support?
- Do we want to surface more advanced provider fields later (`headers`, `priority`, `excluded-models`), or keep All API Hub focused on minimal import-safe entries?
- Should later iterations let suggestion loading follow a user-edited custom base URL in the dialog, or keep using the source account/profile base URL for the first pass?
