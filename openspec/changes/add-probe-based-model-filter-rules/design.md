## Context

The proposal targets one outcome from issue #601: managed-site channel sync should be able to keep only models that pass selected live capability probes. The issue's suggested credential approach is not part of the design; probe execution must use the target channel's own `base_url` and resolved channel key.

Nearest existing implementation points to reuse or extend:

- `ChannelModelFilterRule` in `src/types/channelModelFilters.ts`: extend this rule model with a discriminated rule kind instead of creating a separate filter storage path.
- `ChannelFiltersEditor` plus channel/global filter dialogs: extend the existing visual and JSON editors so pattern and probe rules share one rule list and one include/exclude ordering model.
- `channelConfigStorage` and runtime channel-config messages: extend existing filter normalization/sanitization rather than adding a parallel persistence API.
- `ModelSyncService.runForChannel`: extend the current sync pipeline after model listing and before `updateChannelModels`, preserving the existing allow-list -> global filters -> channel filters flow.
- `ManagedSiteService.fetchChannelSecretKey`, `fetchNewApiChannelKey`, and `loadNewApiChannelKeyWithVerification`: reuse existing channel-key resolution and New API verification recovery patterns rather than collecting separate `apiKey` input.
- `runApiVerificationProbe` / `apiVerificationProbeRegistry`: reuse existing probe runners for model-level checks; do not fork probe implementations for channel filters.
- `toSanitizedErrorSummary` and existing verification/session logging patterns: reuse secret redaction behavior for channel key failures and probe diagnostics.

Current filters are synchronous pattern rules. Probe filters are asynchronous and can require hidden channel key access, so the change touches typing, storage validation, sync execution, UI editing, status feedback, and tests.

## Goals / Non-Goals

**Goals:**

- Let users define probe-backed include/exclude rules in the same global and per-channel filter surfaces that currently manage pattern rules.
- Run probe rules against each candidate model using the channel's own `base_url`, resolved channel key, inferred verification API type, and selected probe IDs.
- Preserve existing pattern filter behavior and existing stored rules.
- Keep automatic sync non-interactive: if a channel key cannot be resolved during background/scheduled execution, report a recoverable key-unavailable result instead of prompting for unrelated credentials.
- Allow interactive surfaces to reuse existing New API verification recovery when the user explicitly tests or retries probe-based filtering.
- Avoid leaking channel keys in stored rule metadata, logs, toasts, probe inputs/outputs, or execution diagnostics.

**Non-Goals:**

- Do not add manual `baseUrl`/`apiKey` credential inputs for probe filters.
- Do not cache copied credentials from channel creation as a fallback probe credential source.
- Do not change the standalone API Verification feature's probe semantics.
- Do not support probe filters for channel types that cannot be mapped to a supported verification API type.
- Do not make scheduled/background sync open UI verification dialogs.

## Decisions

### Extend ChannelModelFilterRule with a rule kind

Use a discriminated rule shape:

- `kind: "pattern"` for the existing substring/regex behavior.
- `kind: "probe"` for model capability checks.

Existing rules without `kind` should be normalized as `kind: "pattern"` so current storage, backups, and JSON imports remain compatible. Probe rules should keep the shared fields `id`, `name`, `description`, `action`, `enabled`, `createdAt`, and `updatedAt`, then add probe-specific fields such as `probeIds`, `match`, and optional execution options that are safe to persist. Raw keys must never be persisted in a filter rule.

Alternative considered: store probe filters in a second list. Rejected because sync already composes global and per-channel filters from one ordered rule list, and a second list would force unclear ordering between pattern and probe criteria.

### Reuse the existing include/exclude composition model

Keep the current high-level semantics:

1. Normalize and de-duplicate fetched models.
2. Apply enabled global filters.
3. Apply enabled channel filters.
4. Within each filter list, include rules are OR-composed first when present.
5. Exclude rules are OR-composed afterward.

Pattern rules match by model name. Probe rules match by executing their selected probes for the current model and treating the rule as matched only when the configured probe condition passes. The initial condition should be conservative: all selected probes must return `pass` for a model to match the rule. A later `any` mode can be added if the UI exposes it deliberately.

Alternative considered: make each rule apply sequentially in user-visible order. Rejected for this change because it would change existing pattern-rule behavior and make migration riskier.

### Resolve probe credentials from the channel, not from user-entered credentials

For each channel being filtered, derive probe inputs as:

- `baseUrl`: `channel.base_url`
- `apiKey`: the channel's resolved `key`
- `modelId`: the candidate model ID
- `apiType`: mapped from the managed-site channel type to `ApiVerificationApiType`

If `channel.key` is present and usable, use it directly. If the key is hidden or empty, use the managed-site provider's existing `fetchChannelSecretKey` capability. For New API, reuse the existing `fetchNewApiChannelKey` session path. Interactive UI retry/test flows can wrap that path with `loadNewApiChannelKeyWithVerification`; scheduled sync should only attempt non-interactive resolution and surface key-unavailable diagnostics when verification is required.

Alternative considered: ask users for an API key in the filter rule. Rejected because it duplicates the channel's real runtime credential, can drift from the channel, increases secret storage exposure, and conflicts with the intended source of truth.

### Add an asynchronous probe filter evaluator in the model sync service layer

Extract filter evaluation into a helper that can evaluate both synchronous pattern rules and asynchronous probe rules. `ModelSyncService.runForChannel` should await this helper before comparing old/new model lists. The helper should accept a per-channel execution context containing the channel, managed-site service/config, site type, and a secret-safe reporter for diagnostics.

Probe execution should reuse `runApiVerificationProbe` for each selected probe. It should cache probe results by `(channelId, channelKeyIdentity, apiType, modelId, probeId)` within one sync run to avoid duplicate calls when global and channel rules ask for the same probe. The cache must not use or expose the raw key as a readable log value; use an in-memory object identity or a one-way internal cache key that is never emitted.

Alternative considered: run the full API verification suite for every model. Rejected because most filters only need specific capabilities, and full-suite execution would be unnecessarily slow and noisy.

### Keep key-unavailable behavior recoverable and non-destructive

When probe filtering cannot resolve the channel key, the sync should not silently clear a channel's model list. The result for that channel should fail or be marked skipped with a message indicating probe filtering could not run because the channel key is unavailable. Existing models should remain unchanged for that channel.

Interactive surfaces should provide localized guidance and retry actions that use the existing managed-site verification flow where available. Providers without `fetchChannelSecretKey` support should show that probe filtering is unsupported for those channels instead of rendering broken controls.

Alternative considered: treat key-unavailable as probe failure and exclude all models. Rejected because a credential-resolution problem is not evidence that every model lacks the requested capability.

### Infer and gate supported API types explicitly

Add a small mapper from managed-site channel type to `ApiVerificationApiType`. Start with channel types already represented by API Verification:

- OpenAI-compatible/OpenAI-family channels -> `openai-compatible` or `openai`
- Anthropic channels -> `anthropic`
- Gemini/Google channels -> `google`

Unsupported channel types should not be selectable for probe filtering in the UI, and sync should report an unsupported-probe-filter diagnostic if such a rule is imported through JSON.

Alternative considered: let users manually choose API type per rule. Rejected for the initial design because the rule should reflect the channel's actual runtime behavior, and manual override is another credential-like source of drift.

### Store only rule metadata and secret-safe diagnostics

Persist probe rule configuration in existing channel config/user preference storage, but never persist resolved channel keys, probe request bodies containing secrets, or raw failure messages that may include keys. Execution reports may include channel id/name, model id, probe id, status, latency, and sanitized summary.

Alternative considered: store successful probe results across sync runs. Rejected for the first implementation because capability checks can change with upstream channel health, quota, model routing, or backend updates, and stale cached results would be hard to explain.

## Risks / Trade-offs

- Probe filters can multiply network calls by channels x models x probes -> Mitigate with per-run result caching, bounded sync concurrency, and explicit warning copy when users select expensive probe filters.
- Hidden New API channel keys may require interactive verification -> Mitigate by keeping scheduled sync non-interactive and surfacing recoverable key-unavailable guidance instead of modifying models.
- Some channel types cannot be mapped to supported API verification types -> Mitigate with explicit gating and unsupported diagnostics.
- Probe failures may be caused by quota, transient upstream errors, or rate limits rather than true model incapability -> Mitigate by keeping failures visible in execution history and not treating key/system failures as model-filter matches.
- Extending the existing rule shape can affect backup/import sanitization -> Mitigate with backward-compatible `kind: "pattern"` defaults and tests for legacy rules, JSON imports, and preference migration.
- Running probes with real channel keys increases secret-handling risk -> Mitigate by reusing existing redaction utilities, avoiding raw key persistence, and adding tests that failure diagnostics omit known keys.

## Migration Plan

1. Extend filter rule types and storage sanitization so existing rules load as `kind: "pattern"`.
2. Add probe rule editing controls behind the existing filter dialogs, keeping JSON mode compatible.
3. Add channel-key-based probe evaluation to model sync and keep pattern-only behavior unchanged.
4. Add localized unavailable/recovery messages for unsupported channel type, missing key, and verification-required states.
5. Validate with focused unit tests for rule normalization, filter composition, probe result caching, key-unavailable behavior, and secret redaction.

Rollback is straightforward because existing pattern rules remain compatible. If probe execution causes problems, the UI can hide probe-rule creation and sync can ignore disabled/unsupported probe rules while preserving stored metadata for a later fix.

## Open Questions

- Which exact New API-compatible channel type values should map to `openai-compatible` in the first implementation, and should provider-specific variants such as OpenRouter, DeepSeek, SiliconFlow, or VolcEngine be enabled immediately or staged?
- Should a probe rule initially support only `all selected probes pass`, or should the UI expose an explicit `all` / `any` operator from the start?
