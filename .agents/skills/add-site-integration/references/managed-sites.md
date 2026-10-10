# Managed/admin site workflow

Use for management connections, channels, providers and native resources. A managed-only gateway need not own a user account, balance or check-in capability; do not create account onboarding solely because it serves inference APIs.

Use the [management completeness checklist](managed-site-checklist.md) for connection/authentication, each native resource operation/field, secret handling, queries, matching/import, model operations and migration. Explain the chosen mapping and reason per operation; state concrete non-adaptation reasons for missing actions or fields. Inspect native resource action predicates as well as top-level managed capability objects.

## Establish management capabilities

- Inspect site definitions, `src/services/apiAdapters/managedSites/`, `src/services/apiAdapters/managedResources/`, and the closest native transport. Compare actual resource/auth contracts before reusing a related backend family.
- Verify management URL, configured transport compatibility, credential scopes and admin identity. Keep management credentials distinct from upstream provider secrets and inference keys. Reuse existing credentials when possible; do not add credential issuance/password exchange or prefix validation unless the task and verified contract require them.
- Survey supported native resources, list/filter/pagination, create/edit/delete, enable/status, models, and optional connection-test or secret-read actions. Give each operation its own capability disposition; do not advertise an operation because another resource supports it.
- Keep UI setup concise, with necessary permission guidance at the relevant credential field. Preserve established support for configured self-hosted/LAN endpoints rather than inventing a stricter transport policy during adaptation.

## Preserve resources during writes

Determine PATCH versus replacement PUT semantics, required writable fields, omitted-field meaning, and secret keep/replace/clear behavior. Verify unrelated metadata and model grants survive edits; native masked secrets must not be sent back as replacement values.

Track ownership and IDs of created resources immediately. Multi-step creation may produce provider nodes or upstream resources before a channel exists; on failure, clean up only demonstrably run-owned resources. Deleting a connection must not delete a pre-existing or shared node. Record uncertain write outcomes and readback instead of replaying a create blindly.

Verify the table/detail projection together using the [native resource display contract](../../../../src/services/apiAdapters/managedResources/README.md#display-contract). Secrets and diagnostic messages follow the existing adapter disclosure semantics; private test evidence does not change product disclosure behavior.

## Validate and hand off

Prefer a pinned self-hosted real backend where feasible, following [validation target selection](evidence-and-validation.md#choose-validation-targets). Test native readback alongside extension create/edit/reopen/delete, including fields and resources that must remain unchanged. Reuse `e2e/realSite/managedSiteChannels.spec.ts` and existing scenarios when their contracts fit.

Use the current-worktree CDP runner to show connection settings, resource list and relevant editor/detail states. Include [visual previews](visual-previews.md), version/configuration pointers, permission boundaries, and verified cleanup. Distinguish source inspection, self-hosted execution and the operator's deployment validation.
