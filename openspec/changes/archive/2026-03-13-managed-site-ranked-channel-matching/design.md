## Context

- The matching utilities previously treated `base_url + models` as strict equality and used separate ad hoc fallbacks for account navigation and token status.
- The account "Locate channel" action and Key Management token status both need the same normalized URL bucket and ranked model comparison logic, but they present the results differently.
- Backend behavior differs by provider: some providers can resolve an exact channel through `findMatchingChannel`, New API deployments may hide comparable channel keys until verification is completed, and Veloera cannot support this verification flow through base-URL search.

## Goals / Non-Goals

**Goals:**

- Introduce one shared inspection shape that both account navigation and Key Management can consume, while keeping URL, key, and model evidence separate enough to explain backend caveats.
- Rank `url + models` candidates inside a normalized URL bucket by exact equality, containment, then similarity threshold.
- Reserve direct channel focus and `added` status for the strongest evidence: the same channel must satisfy key matching and exact model equality.
- Reuse shared constants for ranked match levels plus key/model assessment reasons so tests, logs, and UI mappings describe the same semantics.
- Preserve provider-specific safeguards for hidden keys, failed search, and unreliable Veloera absence checks.

**Non-Goals:**

- Changing managed-site import duplicate detection into a fuzzy process. Import-time duplicate checks should remain strict and conservative.
- Adding new managed-site backend endpoints or changing existing server contracts.
- Introducing a new advanced filter UI in the managed-site channel table beyond the existing `channelId` and `search` routing.
- Treating non-exact or conflicting signals as proof that a channel definitely exists for import-deduplication or absence verification.

## Decisions

1. **Create a shared inspection model instead of a single top-level consumer result.**
   - `src/services/managedSites/channelMatch.ts` defines ranked match-level constants, ranked reason constants, and a `ManagedSiteChannelMatchInspection` shape with separate `url`, `key`, and `models` assessments.
   - Consumers derive their own behavior from those signals. `getManagedSiteChannelExactMatch(...)` is the shared helper that promotes an inspection to an exact channel only when key evidence and exact model evidence point to the same channel.
   - Alternative considered: expose only one top-level `matchLevel` / `matchReason` object. Rejected because account navigation and Key Management both need the underlying URL/key/model evidence to explain why a result is weak, conflicting, or unavailable.

2. **Search first, then invoke provider-aware exact matching only when local evidence is insufficient.**
   - `resolveManagedSiteChannelMatch(...)` normalizes the account base URL, runs `service.searchChannel(...)`, derives URL/key/model assessments from the returned bucket, and only then calls `service.findMatchingChannel(...)` when key and model inputs exist and the local search did not already prove an exact match.
   - This keeps one inspection surface for account and token flows while still letting providers override exact-channel resolution when local search results are incomplete or keys are hidden.
   - Alternative considered: call `findMatchingChannel(...)` before searching. Rejected because both consumers need URL-bucket and model-signal metadata even when exact matching succeeds or fails.

3. **Model secondary matches as ranked URL-bucket evidence, but keep URL-only evidence separate from model matches.**
   - Secondary ranking only evaluates channels whose normalized `base_url` matches the account URL.
   - Inside that URL bucket, model comparison proceeds in this order:
     1. Exact normalized set equality
     2. Containment in either direction after normalization and de-duplication
     3. Similarity score at or above `MANAGED_SITE_CHANNEL_MODEL_SIMILARITY_THRESHOLD`
   - When no model-based candidate survives the ranking but a URL bucket exists, the inspection reports URL evidence separately and treats the result as URL-only review instead of a model-based match.
   - Alternative considered: treat any URL-bucket result as a secondary model match. Rejected because URL-only evidence is materially weaker and needs distinct UI handling.

4. **Account location uses exact focus only for aligned key + exact-model evidence.**
   - `channelId` navigation occurs only when `getManagedSiteChannelExactMatch(...)` succeeds and the model assessment is exact.
   - All other outcomes open the filtered channels page and show toasts for:
     - secondary exact / contained / similar model matches
     - key-only matches
     - same-channel key matches whose models only approximately line up
     - conflicting key-vs-model candidates
     - fuzzy URL-only matches
     - unresolved or operational fallbacks such as no keys, multiple keys, config missing, input preparation failure, or search failure
   - Alternative considered: deep-link any single weak candidate. Rejected because that would hide uncertainty and collapse materially different review states into a false exact match.

5. **Key Management keeps existing status badges and exposes assessment badges instead of a single match label.**
   - `ManagedSiteTokenChannelStatus` keeps the product-facing `added`, `not-added`, and `unknown` badges.
   - Exact matches return `matchedChannel` plus assessment data.
   - Search-complete weak matches return `unknown` with `MATCH_REQUIRES_CONFIRMATION` and assessment data.
   - `not-added` is reserved for search-complete cases with no URL/key/model signal and a non-empty token key.
   - `exact-verification-unavailable` covers cases where the token has no comparable key or a URL bucket exists but comparable channel keys are unavailable.
   - `TokenHeader` renders badge/tooltips for URL, key, and models signals and uses `ManagedSiteChannelLinkButton` to open the exact channel for `added` or the filtered channel list for review states.
   - Alternative considered: replace the status badges with `exact` / `secondary` / `fuzzy` / `unmatched`. Rejected because the current badge language remains useful, and the implementation now exposes the detail through the assessment badges instead.

6. **Keep backend-specific guardrails explicit in the resolver output and UI mapping.**
   - New API-specific hidden-key guidance appears when the key assessment is `comparison-unavailable`.
   - Veloera short-circuits to an unsupported `unknown` state before search because its base-URL lookup is not reliable enough for this verification flow.
   - Search failures and input-preparation failures remain separate operational reasons rather than being folded into ranked match semantics.

## Risks / Trade-offs

- **[Risk]** Similarity-based secondary matching can introduce false positives when two channels share only a partial model overlap.
  **→ Mitigation:** Evaluate similarity only inside an exact URL bucket, prefer exact equality and containment first, and expose the result as review-only evidence rather than an exact match.

- **[Risk]** Different providers expose different channel detail fidelity, which can make exact-key proof uneven across sites.
  **→ Mitigation:** Keep provider-specific exact matching in `findMatchingChannel(...)` and use the shared resolver to preserve the same inspection surface for downstream consumers.

- **[Risk]** Weak-match UI can become noisy if every state becomes its own sentence.
  **→ Mitigation:** Let account flow use a compact toast matrix, and let Key Management use reusable URL/key/model badges with tooltips instead of a long paragraph for every state.

- **[Risk]** Account navigation and token status could drift again if they each add one-off logic on top of the shared resolver.
  **→ Mitigation:** Route both flows through `resolveManagedSiteChannelMatch(...)`, keep the exact-match helper shared, and cover the contract with service and UI tests.

## Migration Plan

- No data migration is required.
- Implementation can land in three safe steps:
  1. Add the shared ranked-match constants, URL/key/model assessment types, and ranking helpers.
  2. Update account navigation and token-status resolution to consume the shared inspection and exact-match helper.
  3. Update UI strings and tests for account toasts plus Key Management signal badges, tooltips, and review links.
- Rollback is straightforward because the change is additive: consumers can revert to the earlier strict equality and URL-only fallback behavior without requiring stored-data cleanup.

## Open Questions

- None at the design level. The similarity threshold remains a named constant so it can be tuned if tests or real deployments show that the current boundary is too permissive or too strict.
