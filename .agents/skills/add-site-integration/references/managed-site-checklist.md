# Managed-site adaptation completeness checklist

Use for management/admin integration, alongside [the managed-site workflow](managed-sites.md). Account keys belong to a saved user's account; managed resources are administrative channels, providers or upstream connections. Similar CRUD terminology does not establish shared credentials, fields, permissions or write semantics.

## Shared preparation and completion

Reuse only the common assessment procedure:

- [Outcome rules](capability-assessment.md#how-to-close-an-item): classify every applicable operation and explain partial, unsupported, deferred or unverified outcomes.
- [Shared setup](capability-assessment.md#shared-setup): establish type/domains, management authentication alternatives and the visible administrative feature surface. Account credential defaults do not automatically apply to admin access.
- [Delivery checks](capability-assessment.md#delivery-check): validate, retain evidence and clean up owned resources.
- [Handoff table](capability-assessment.md#required-handoff-table): report management groups and operations separately from account coverage, with adaptation reasons and concrete omissions.

For management-only work, use these linked common sections and the checklist below. The account onboarding, balance, personal key and check-in sections are not required. For combined integration, complete the account and management checklists independently; reuse evidence only where the contract is actually shared.

## Management capability checklist

### Connection and permissions

- [ ] **Connection and permissions**: verify management URL, credential/admin identity and scopes, distinct from inference/upstream secrets. Preserve existing configured LAN/HTTP compatibility.

### Native resources and secrets

- [ ] **Resource inventory**: identify native kinds; verify list/filter/pagination/detail/status for each and actual table/detail facts/labels.
- [ ] **Create/edit/delete/status**: inspect each operation and ordinary-role native field through managedResources, not just managedSites. Verify replacement PUT, required fields and reopen/readback; enumerate missing fields/actions.
- [ ] **Secrets and ownership**: verify keep/replace/clear without resubmitting masks, shared versus run-owned resources, uncertain writes and failure cleanup.

### Models, import and migration

- [ ] **Queries, models and connection tests**: check groups, discovery/sync/filter and test/secret-read independently, including native action predicates. Missing top-level models does not settle native operations.
- [ ] **Matching/import/migration**: verify drafts, duplicate matching, target constraints and lossy fields; disclose gaps before claiming parity.
