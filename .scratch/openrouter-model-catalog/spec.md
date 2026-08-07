# OpenRouter Model Catalog and Provider-Native Model Presentation

Status: ready-for-agent

## Problem Statement

Users can save and manage OpenRouter accounts, but the Model List currently treats those accounts as unsupported. Users cannot select an OpenRouter account to inspect its models, compare OpenRouter models with other account sources, or see the rich catalog information OpenRouter publishes about pricing, capabilities, limits, routing, and lifecycle.

The existing Model List already provides mature single-account and all-accounts workflows, but its shared model card primarily understands the product's historical pricing, group, and metadata shapes. A direct OpenRouter-only card would make the feature work quickly but would create a second rendering path and scatter provider knowledge through shared filtering, sorting, actions, and UI. Conversely, reducing OpenRouter to the smallest common field set would discard the information that makes its catalog useful.

The product needs a provider-native model presentation mechanism that can display substantially different fields, sections, ordering, and formats while keeping provider knowledge local to the provider Adapter and presentation policy.

## Solution

Add OpenRouter as the first production Adapter for a provider-native model catalog presentation mechanism.

Users will continue to use the existing Model List entrypoint. Selecting an OpenRouter account will show either its verified Personalized Model Catalog or a clearly identified Provider Model Catalog. Selecting all accounts will combine personalized OpenRouter sources with other account sources while representing the provider-wide public catalog only once.

The shared model card will retain common identity, source, interaction, accessibility, filtering, sorting, and comparison behavior. Its summary and expanded-detail areas will accept a product-owned presentation containing typed Model Display Facts grouped into provider-controlled sections. An OpenRouter presentation policy may select different fields, order, sections, labels, visibility rules, and specialized renderers without adding OpenRouter branches to the shared card.

OpenRouter's stable documented model fields will be exhaustively classified as a Product Canonical Model field, a provider-native summary fact, a provider-native detail fact, or intentionally hidden with a recorded reason. Raw upstream objects will never be passed to React or rendered as JSON.

## User Stories

1. As a user with a saved OpenRouter account, I want to select it in the existing Model List, so that I can browse OpenRouter models without visiting a separate page.
2. As a user comparing accounts, I want OpenRouter models included in the existing all-accounts view, so that I can compare them with models from my other account sources.
3. As a user, I want the page to distinguish a Personalized Model Catalog from a Provider Model Catalog, so that I understand whether the models reflect my settings or the provider as a whole.
4. As a user, I want the product to verify whether my Management Key can access OpenRouter's personalized catalog before relying on it, so that the page does not guess about credential permissions.
5. As a user, I want the personalized catalog used when its authentication and identity semantics are verified, so that privacy, provider preferences, and guardrails are reflected when possible.
6. As a user, I want a public catalog fallback when personalized loading fails, so that I can still browse models.
7. As a user, I want a visible fallback notice with a retry action, so that a public catalog is never mistaken for personalized account availability.
8. As a user with multiple OpenRouter accounts, I want the identical Provider Model Catalog represented once in all-accounts mode, so that model counts and price comparisons are not inflated by duplicate global data.
9. As a user with multiple OpenRouter accounts, I want each successful Personalized Model Catalog to remain an account-specific source, so that account differences remain visible.
10. As a user, I want a readable display name and the exact request model ID shown separately, so that I can understand the model and copy the correct value for API requests.
11. As a user, I want model developer or publisher information to be accurate, so that a routing provider is not incorrectly presented as the model author.
12. As a user, I want the primary input, output, and cache prices shown in the familiar model-card summary, so that common comparisons remain quick.
13. As a user, I want request, image, audio, search, reasoning, and other documented price dimensions available in details, so that additional charges are not hidden.
14. As a user, I want conditional and long-context price overrides shown clearly, so that a headline price is not presented as universally applicable.
15. As a user, I want context and maximum-output limits shown with explicit units, so that I can choose models suitable for my workload.
16. As a user, I want input and output modalities shown, so that I can identify text, image, audio, and other model capabilities.
17. As a user, I want supported parameters and reasoning capabilities shown, so that I can understand which request features a model accepts.
18. As a user, I want provider limits and moderation status available in details, so that operational constraints are visible before use.
19. As a user, I want lifecycle information such as creation, knowledge cutoff, aliases, and expiration shown when available, so that I can assess freshness and stability.
20. As a user, I want supported voices, useful links, and other stable OpenRouter-native facts shown when present, so that rich provider information is not discarded merely because another provider lacks it.
21. As a user scanning many models, I want the collapsed card to remain concise, so that rich details do not make the list difficult to browse.
22. As a user, I want expanded details grouped and ordered meaningfully, so that I do not have to interpret raw upstream field names or JSON.
23. As a keyboard or assistive-technology user, I want expansion, labels, sections, links, loading, fallback, and error states to remain accessible.
24. As a user on a narrow viewport, I want long model IDs, prices, facts, and controls to wrap or truncate safely without obscuring actions.
25. As a user, I want missing optional facts omitted cleanly, so that cards do not fill with meaningless placeholders.
26. As a user, I want legitimate zero prices distinguished from unknown or malformed prices, so that free usage is not confused with missing data.
27. As a user, I want a failure in one account source to leave successful sources visible in all-accounts mode, so that partial failure does not erase useful results.
28. As a user, I want refresh to respect the selected catalog scope, so that public and personalized data are not mixed or served from the wrong cache.
29. As a user, I do not want a Management Key sent to a public endpoint, so that administrative credentials are not disclosed unnecessarily.
30. As a user, I do not want Management Key accounts to expose runtime-key verification, CLI verification, or model-key actions they cannot support.
31. As a maintainer adding another provider, I want to register its model Adapter and presentation policy without copying the model card or editing its shared rendering logic.
32. As a maintainer, I want provider-specific field knowledge concentrated in one Adapter and one presentation policy, so that upstream changes have locality.
33. As a maintainer, I want every stable OpenRouter field classified by contract tests, so that new or removed upstream fields are noticed without crashing users at runtime.
34. As a maintainer, I want shared-renderer tests to use neutral example data, so that the generic mechanism cannot silently become OpenRouter-only.

## Implementation Decisions

- Preserve the existing Model List page, source selector, single-account data flow, all-accounts aggregation, filtering, sorting, virtualization, account summaries, and partial-failure behavior.
- Extend the existing account model-source readiness seam so that OpenRouter can provide direct catalog and pricing data without coercing native OpenRouter keys into recoverable runtime keys.
- Treat the OpenRouter Management Key as an administrative credential. Do not use it for inference actions and do not attach it to the public models request.
- Use the documented public models endpoint as the Provider Model Catalog. Request all output modalities so the product does not silently omit non-text-output models.
- Fetch the complete public catalog. Follow documented pagination when present, reject non-progressing pagination, preserve caller cancellation, and avoid presenting a partial first page as complete.
- Perform a read-only live validation of the personalized models endpoint with a real Management Key before implementing it as an account source. Verify authorization, returned identity scope, organization or personal semantics, filtering behavior, and safe error handling without logging or persisting the credential.
- If Management Key compatibility or identity semantics cannot be verified, ship the Provider Model Catalog and leave personalized support explicitly deferred rather than guessing.
- When personalized support is verified, prefer the Personalized Model Catalog for the selected account. On runtime failure, fall back automatically to the Provider Model Catalog while visibly disclosing the scope change and retaining retry.
- Keep personalized query results and caches account-isolated. Do not persist personalized data in the provider-wide public cache.
- Share the Provider Model Catalog request and cache across OpenRouter accounts. Align its freshness with the provider's documented public cache behavior rather than duplicating account-keyed ten-minute snapshots.
- In all-accounts mode, keep successful personalized catalogs account-specific. Collapse one or more public fallbacks into one provider-wide source while retaining affected-account fallback status in account summaries.
- Preserve a stable Product Canonical Model core for behavior that must be shared: request ID, display identity, source, vendor evidence, primary comparable pricing, capabilities, limits, lifecycle, and action policy.
- Keep native OpenRouter DTOs and schema details inside the provider integration. React modules must not import or receive raw OpenRouter model objects.
- Add a provider-neutral model presentation interface with grouped, typed Model Display Facts. It must support provider-controlled summary fields, detail sections, section order, field order, labels, help text, conditional visibility, formatting, and narrowly registered complex renderers.
- Allow an OpenRouter-specific model detail policy. Provider-specific field identifiers and knowledge are valid inside the OpenRouter Adapter, policy, presenter, and contract tests; they are not valid inside the shared model card, shared data hooks, filters, sorters, or all-accounts orchestration.
- Do not reuse the native-resource `ResourceDisplayFact` as the model-domain contract. Model facts need explicit semantics for token limits, currencies, metering units, modalities, conditional prices, dates, and trusted links.
- Reuse or extract only presentation-level layout primitives when real duplication exists. Do not make the model domain depend on account-key or managed-resource terminology.
- Keep the collapsed card scan-friendly. Its common shell retains model identity, source identity, expansion, accessible actions, and primary comparison information; provider policies may add a bounded set of native summary facts.
- Render rich provider-native information in ordered expanded sections. Missing optional fields do not occupy space.
- Maintain an exhaustive inventory for the stable documented OpenRouter model schema. Each field must be classified as canonical core, native summary, native detail, or intentionally hidden with a reason.
- Ignore unknown upstream fields safely at runtime. A pinned contract test or schema audit must detect that the field inventory needs review without turning an additive upstream response into a user-facing crash.
- Provide specialized presentations for structured facts such as multi-dimensional prices, price overrides, per-request limits, modalities, supported parameters, default parameters, voices, aliases, benchmarks, and trusted details links. Never fall back to raw object stringification or an unreviewed JSON viewer.
- Treat OpenRouter top-provider information as routing information, not publisher evidence. Derive publisher evidence from a documented author identity or stable model ID convention when safe; otherwise leave it unknown.
- Normalize per-token prices into the product's existing per-million-token units for primary price comparison. Preserve legitimate zero values. Reject or mark unavailable malformed, negative, or non-finite values.
- Use only semantically comparable canonical prices for existing cheapest-model behavior. Native price dimensions and conditional overrides remain informative until a comparison rule explicitly supports them.
- Derive model-row actions from source capability and usable runtime-secret availability. A Management Key alone does not enable API verification, CLI verification, batch verification, or runtime model-key actions.
- Keep provider-specific action decisions out of shared React branches. Replace the existing pattern of provider-specific capability downgrades with a provider-neutral source action-policy resolver.
- Reuse existing privacy-safe model-load analytics. Add only a controlled catalog-scope or source-variant value if needed; never record model IDs, model names, descriptions, URLs, user preferences, raw errors, payloads, or credentials.
- No settings search or deep-link registry changes are required because no settings control or navigation target is being added or moved.
- OpenRouter is the first production Adapter, not the owner of the generic presentation interface. Shared-renderer fixtures and terminology must remain provider-neutral.
- Assess AIHubMix against the new interface after the OpenRouter slice. A thin migration may be a separate final ticket, but AIHubMix migration is not allowed to block OpenRouter delivery or expand into a second provider rewrite.

## Testing Decisions

- Test observable contracts and user-visible outcomes. Do not assert internal call choreography, whole rendered object graphs, incidental wrappers, or complete Tailwind class strings.
- Use the OpenRouter Adapter as the main protocol seam. Cover the public request URL, absence of Authorization, all-output-modalities request, pagination, cancellation, response validation, deduplication, stable field mapping, malformed fields, and error classification.
- Cover price normalization for prompt, completion, cache, request, image, audio, search, reasoning, and other supported meters. Prove that zero is preserved and invalid values do not become zero.
- Cover conditional price overrides and prove that the primary price UI does not imply an override-free universal price.
- Cover publisher-versus-routing-provider mapping explicitly.
- Add a stable-field inventory test against a pinned official schema snapshot or equivalent maintained contract. Every documented field must have a classification; additive unknown fields should produce a review signal rather than a runtime failure.
- Test the personalized validation and runtime branch separately from public catalog loading. No test fixture may contain a real key, account identifier, organization, or non-reserved example endpoint.
- Cover provider-scope caching separately from account-isolated personalized caching, including refresh invalidation and prevention of cross-account personalized cache reuse.
- Cover account-source readiness and registry behavior so OpenRouter moves from unsupported to the intended catalog route only when the required capability is registered.
- Cover the provider-neutral source action-policy resolver. OpenRouter Management Key rows must not expose runtime-key verification, CLI verification, batch verification, or model-key actions.
- Test single-account loading, empty catalog, public fallback disclosure, personalized retry, cache hit, refresh, and safe errors at the existing Model List hook or page seam.
- Test mixed all-accounts behavior with one ordinary account and OpenRouter, including same-model source identity, partial failure, personalized account rows, one shared public fallback source, correct account summaries, and comparable-price behavior.
- Test the shared model presentation and renderer with neutral `example.invalid` fixtures. Demonstrate different providers using different fields, sections, ordering, formats, missing values, and a registered structured renderer without OpenRouter imports.
- Test the OpenRouter presentation policy independently. Cover summary-versus-detail classification, ordering, conditional visibility, localized labels, missing optional fields, long values, and structured pricing and limit presentations.
- Test expansion and dynamic-height behavior without asserting third-party virtualization internals.
- Add or update one representative Chromium Playwright flow covering an OpenRouter account deep link, rich details, transition to mixed all-accounts mode, unsupported-action absence, and visible public fallback. Keep field matrices in Vitest rather than multiplying E2E scenarios.
- Perform a separate read-only live smoke against the public endpoint. If the user provides or authorizes a real Management Key validation, report it separately from mocked tests and do not persist credentials or response data.
- Run focused related tests first, followed by locale extraction when copy changes, compile, staged validation, push validation, and the targeted Playwright scenario.

## Out of Scope

- Creating, rotating, revealing, exporting, or otherwise mutating OpenRouter keys as part of model catalog loading.
- Treating a Management Key as a runtime inference key.
- Automatically creating a runtime key to access personalized models.
- Rendering raw OpenRouter JSON or automatically exposing unknown upstream fields.
- Pixel-for-pixel reproduction of the OpenRouter website.
- Extending the native-resource `ResourceDisplayFact` contract for model semantics.
- Replacing the entire historical pricing response, filtering, sorting, or group model in one migration.
- Rewriting AIHubMix or every existing model Adapter as a prerequisite.
- Adding a separate OpenRouter Model List page or an OpenRouter-specific model card.
- Adding new settings, settings-search targets, or navigation anchors.
- Comparing non-equivalent native price dimensions in cheapest-model sorting without a separately defined comparison contract.

## Further Notes

- OpenRouter's public models guide describes the catalog as freely available and edge cached: https://openrouter.ai/docs/guides/overview/models
- The documented full endpoint is `GET https://openrouter.ai/api/v1/models`: https://openrouter.ai/docs/api/api-reference/models/list-all-models-and-their-properties
- The personalized endpoint requires Bearer authentication and applies user provider preferences, privacy settings, and guardrails. Management Key compatibility and identity scope remain a required live-validation decision.
- OpenRouter documents Management Keys as administrative credentials rather than completion credentials: https://openrouter.ai/docs/guides/overview/auth/management-api-keys
- The public guide and a 2026-08-07 unauthenticated live probe support public loading, while the current OpenAPI global security declaration is less specific. Keep a concise source comment near the transport and preserve a contract test for the chosen behavior.
- The defining architectural objective is locality: upstream changes should concentrate in the provider Adapter, provider presentation policy, and their tests, while shared model behavior remains stable.
