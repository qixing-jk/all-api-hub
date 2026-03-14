## 1. API Service Secret Resolution

- [x] 1.1 Add shared masked-key detection and full-key resolution helpers in `src/services/apiService/common/**` for the common / `new-api` family.
- [x] 1.2 Expose a site-service entry point for resolving a usable token secret key while preserving legacy pass-through behavior for sites that already return full keys.
- [x] 1.3 Add an ephemeral in-memory promise cache for resolved token keys and define invalidation rules tied to token identity and inventory changes.

## 2. Account-Scoped Secret Consumers

- [x] 2.1 Add an account-scoped helper that resolves a token and returns a transient clone with the usable full key for secret-dependent flows.
- [x] 2.2 Update Account Management and Copy Key dialog flows to use the resolver for quick copy, dialog copy, and post-create auto-copy behavior.
- [x] 2.3 Update Key Management actions, API profile save, and downstream export / integration launchers to use resolved token keys instead of raw inventory values.
- [x] 2.4 Update dialogs or callers that probe upstream models with `token.key` so model discovery runs with the resolved key when the backend masks inventory values.

## 3. Managed-Site Exact Matching Compatibility

- [x] 3.1 Update managed-site channel preparation and user-initiated import flows to resolve full token keys before exact duplicate detection and payload generation.
- [x] 3.2 Update managed-site background status checks to reuse the shared resolver and degrade unresolved exact verification to `unknown` instead of false `not-added` results.
- [x] 3.3 Ensure failures in managed-site compatibility flows remain redacted and do not persist resolved secrets into long-lived token inventory state.

## 4. Tests And Validation

- [x] 4.1 Add service-level tests for masked inventory detection, explicit full-key fetch fallback, legacy full-key pass-through, and resolver cache deduplication.
- [x] 4.2 Add UI or hook tests covering secret-dependent actions against masked inventories, including copy/export behavior and safe failure handling.
- [x] 4.3 Add managed-site compatibility tests covering resolved exact matching and conservative `unknown` fallback when hidden-key resolution fails.
- [x] 4.4 Run the smallest affected validation set for the new service, managed-site, and token-action flows, then record any environment-limited gaps before handoff.
