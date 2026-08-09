# Repair-Created Key Managed-Site Import Design

## Context

Issue [#1163](https://github.com/qixing-jk/all-api-hub/issues/1163)
requests a direct way to import keys created by the "ensure at least one key"
check into a managed site. The issue names New API, but the product decision is
to support every current `ManagedSiteType` through the existing managed-site
capability boundary. Each run still targets only the managed site currently
selected in settings.

The repository already has two substantial pieces of this workflow:

- account-key repair creates missing group keys and persists a background job
  result; and
- managed-site token batch export prepares channel drafts, resolves protected
  secrets, checks duplicates, creates resources, and reports partial results.

The missing seam is reliable provenance. Repair results currently retain only
`createdGroups`, so the UI cannot identify the exact keys created by that job.
Today, the generic batch flow therefore cannot distinguish a repair-created key
from an arbitrary selection and must run the complete verification policy for
both. This design preserves exact creation provenance so a fresh first import
can trust that the referenced keys were created by this repair job and use the
simplified `trusted-new` policy. Only stale results, retries, or an explicit
user choice return those items to complete verification.

## Goals

- Let users take only the keys created by the current repair job into the
  managed-site import flow.
- Support all current managed-site types through shared capabilities, without
  adding a New API-only product path.
- Use trusted creation provenance to remove unnecessary duplicate discovery,
  hidden-key verification, and repeated confirmation from the fast path.
- Preserve user choice over which keys to import, model selection, target
  review, cancellation, and access to the complete standard workflow.
- Make the standard batch-import flow the capability superset. Any generally
  useful enhancement introduced for this work must live in the shared flow and
  be available from the standard entry point as well.
- Keep retries safe when a create response is lost or only part of a batch
  succeeds.
- Never persist plaintext account keys or managed-site credentials in repair
  progress, import receipts, logs, or telemetry.

## Non-goals

- Automatically importing keys without a user action.
- Importing into multiple managed sites at the same time.
- Combining keys from different accounts into one multi-key channel.
- Adding a new upstream bulk-create API or changing provider payload contracts.
- Removing or weakening the existing standard duplicate-verification flow.
- Making unsupported account site types or one-time-secret keys eligible for
  background repair.
- Redesigning managed-site settings or channel management outside the shared
  import surface.

## Product Invariant: One Flow, Two Modes

There is one managed-site batch-import product flow with two modes:

1. **Standard mode** starts from arbitrary user-selected account runtime keys.
   It retains complete duplicate discovery, protected-key verification,
   warnings, review, and confirmation.
2. **Repair-created mode** starts from exact key references produced by a repair
   job. It uses the same preparation, selection, editing, execution, results,
   and retry components, but changes defaults and omits checks that creation
   provenance makes unnecessary.

Standard mode remains the capability superset. Shared capabilities include:

- selecting or deselecting individual keys;
- editing model selections;
- displaying the current target and navigating to change it;
- showing per-item blockers and provider errors;
- partial-success results and safe retry; and
- switching from a simplified review to the complete verification flow.

These capabilities must not be implemented only inside the repair dialog. If a
new generally applicable control or result state is added, both entry points
must use the same component, service contract, and behavior. Differences are
allowed only when they follow from trusted repair provenance, such as the
default verification policy and removal of a redundant confirmation.

## User Experience

### Entry point

When a repair job completed in the current dialog session and created at least
one recoverable key reference, its result view shows:

> Import the selected new keys to {managed site}

The label includes the selected count and current managed-site label. The
action is absent when no exact created-key references are available. Reopening
a current-version result that still has exact references may start the shared
standard review and honor its recorded receipts, but it does not skip complete
checks because the original freshness guarantee is gone. A result stored by an
older extension version remains readable but cannot claim fast-path provenance
or expose this direct action.

### Simplified review

Opening the action shows the shared batch-import review in repair-created mode:

- all recoverable keys from this repair job are selected by default;
- users may deselect any key;
- users may inspect and edit the discovered model selection;
- the current managed-site target is visible;
- users may cancel or navigate to managed-site settings before writing; and
- a "Use complete checks" action switches the same review into standard mode.

Repair-created mode does not immediately mutate the target. The user's click on
"Import selected" is the write authorization. Because the visible review is
already the decision surface, it does not open a second confirmation dialog.

Standard mode keeps its current cautious defaults and confirmation. Shared UI
enhancements made during this work are available in standard mode too; the
repair mode only hides or skips steps proven unnecessary for newly created
keys.

### Preparation exceptions

Trusted provenance does not replace provider requirements. Secret resolution,
model discovery, target default groups, normalized base URLs, and required
draft fields still run. An item missing required data is blocked individually
and remains visible. Other valid items can proceed.

Users can edit fields supported by the shared review or switch to complete
checks. The fast path never invents models, silently substitutes another key,
or discards a failed item.

### Results and retry

Results stay in the shared import surface and distinguish:

- created;
- already present after reconciliation;
- blocked before creation;
- failed with a definite provider response; and
- uncertain because the request may have reached the target but its response
  was not confirmed.

Successful items are not retried for the same repair job and target. Failed or
uncertain items remain selectable. A retry runs the complete duplicate
reconciliation for those items before attempting another create. This protects
against duplicate channels after response loss without making every first-time
repair-created import pay the full verification cost.

## Data Model and Provenance

Add an optional created-key reference to each account repair result:

```ts
interface AccountKeyRepairCreatedTokenReference {
  tokenId: number
  group: string
}

interface AccountKeyRepairAccountResult {
  // Existing fields remain unchanged.
  createdTokens?: AccountKeyRepairCreatedTokenReference[]
}
```

The field is optional for backward compatibility with stored progress from
older versions. It contains no secret and does not duplicate account names,
URLs, or token values already owned elsewhere.

For accounts without group metadata, the existing default-token lifecycle
already resolves the created token and can retain its ID. For grouped account
sites, the repair operation snapshots token IDs before creation, performs the
existing group repairs, then reloads the inventory once. It associates newly
observed token IDs with the groups successfully created by this job.

Only unambiguous matches become `createdTokens`. Failure to recover a stable ID
must not retroactively turn a successfully created group into a failed repair.
The result instead reports that the key is unavailable to the quick-import
adapter and leaves it accessible through standard Key Management after refresh.

## Architecture

### Repair-result adapter

Add a narrow adapter that converts created-token references into the existing
managed-site batch input shape. It:

1. groups references by account;
2. reloads only affected account token inventories through account adapter
   capabilities;
3. matches exact token IDs;
4. builds account runtime keys through the existing normalization boundary;
   and
5. returns resolved inputs plus explicit unresolved-reference blockers.

The adapter runs only after the user opens the import review. It does not pass
secrets through account-repair progress or generic verification results.

### Shared batch-import intent

Extend the shared batch-import controller with a typed intent rather than a
second dialog or service:

```ts
type ManagedSiteBatchImportIntent =
  | { source: "manual-selection"; verification: "complete" }
  | {
      source: "repair-created"
      verification: "trusted-new" | "complete"
    }
```

The source controls defaults and analytics classification. The verification
policy controls only duplicate preparation:

- `complete` uses the existing channel-match resolver and protected-key
  verification;
- `trusted-new` skips channel candidate search and key comparison on the first
  attempt, while still resolving the source key, preparing the provider draft,
  and validating required fields.

`trusted-new` is available only for a job completed in the current dialog
session, with no prior attempt receipt for the selected target. The UI explains
that complete checks remain available. External concurrent writes cannot be
made atomic with provider creation, so users who imported the same new key by
another path can switch to complete checks before writing.

Switching repair-created mode to complete checks reuses the same preview items
and reruns preparation with `verification: "complete"`. It does not navigate to
or instantiate a separate feature.

### Execution

Execution continues to call the current managed-site service for each selected
item with bounded concurrency. Each item may have a different source base URL,
model set, group, or provider-specific draft, so it must retain an independent
create result.

For New API, the verified upstream contract at commit
`0ab02020603d22e5613bc4cf46bfab06f8567769` exposes channel creation through
`POST /api/channel/`. Although it accepts `batch` and `multi_to_single` modes,
those modes share one channel configuration and do not fit heterogeneous
account keys. The repository therefore continues to send one `mode: "single"`
request per key. Relevant upstream sources:

- route and authorization:
  <https://github.com/QuantumNous/new-api/blob/0ab02020603d22e5613bc4cf46bfab06f8567769/router/channel-router.go#L19-L59>
- create modes:
  <https://github.com/QuantumNous/new-api/blob/0ab02020603d22e5613bc4cf46bfab06f8567769/controller/channel.go#L573-L714>
- channel persistence:
  <https://github.com/QuantumNous/new-api/blob/0ab02020603d22e5613bc4cf46bfab06f8567769/model/channel.go#L426-L452>

No New API-specific branch belongs in the repair UI. Provider-specific payload
and error behavior stays behind managed-site capabilities.

### Target identity and receipts

The shared controller captures a non-secret target fingerprint from the
selected managed-site type and normalized configuration identity when
preparation starts. The fingerprint is a one-way digest of stable routing
identity such as managed-site type, normalized base URL, and compatible user
identifier; it excludes credentials. Before execution, the controller verifies
that the current target still matches. If settings changed, both standard and
repair-created modes invalidate the prepared draft and require a refresh
instead of writing to an unexpected site.

Repair-created execution receipts are associated with the repair job, target
fingerprint, account ID, and token ID. They store only controlled statuses and
timestamps. They never store the target credential, source key, raw URL, or raw
provider response.

Receipts prevent confirmed successes from being selected again for the same
job and target. Any failed or uncertain receipt forces complete reconciliation
on retry. Changing the current target produces a different receipt scope and
allows the same source keys to be imported there by explicit user choice.

## Error Handling

- Missing or changed source tokens become per-item blockers; no nearby token is
  substituted.
- Missing managed-site configuration keeps the review non-mutating and points
  to the existing settings surface.
- A target change between preparation and execution invalidates the preview for
  both modes.
- Model discovery or required-field failure blocks only the affected item and
  retains edit or complete-flow recovery actions.
- Create responses are handled independently; successful items are not rolled
  back because another item fails.
- Provider messages shown privately to the affected user remain available when
  useful and secret-safe. Localized fallback text covers empty messages.
- New API 401 and 403 responses remain distinguishable. Current upstream
  requires both administrator authentication and `ChannelSensitiveWrite`; a
  valid-looking local configuration does not prove that permission exists.
- Logs redact account keys, managed-site credentials, cookies, authorization
  headers, and any error text containing collected secrets.

## Telemetry and Discoverability

Reuse the existing managed-site batch-import action and result telemetry. Add a
controlled import-source classification for `manual-selection` and
`repair-created`, and use the repair dialog as the source surface for the new
entry point. Record only controlled enums, counts, and result categories.

Do not record account or token IDs, target identities, site types derived from
user URLs, URLs, hosts, names, models, groups, keys, provider messages, or stack
traces.

This work adds no persisted setting, so settings search definitions and deep
links do not change. The shared target-settings action uses the existing
managed-site settings navigation.

## Localization

Add synchronized app-locale copy for:

- the repair-result import action and selected count;
- simplified-mode explanation;
- switching to complete checks;
- unrecoverable created-key references;
- stale target/preparation messages;
- created, already-present, blocked, failed, and uncertain results; and
- retry guidance.

Use plain product language about importing newly created keys. Do not expose
internal terms such as provenance, fingerprints, adapters, or match resolvers.
Run the repository extraction check and account for every locale diff.

## Testing

### Service tests

Use TDD to cover:

- grouped repair records exact new token IDs after one inventory refresh;
- no-group repair records the lifecycle-created token ID;
- ambiguous ID recovery preserves repair success but omits quick-import
  provenance;
- older stored results without `createdTokens` remain readable;
- the repair adapter loads only affected accounts and never substitutes a
  missing token;
- trusted-new preparation resolves secrets and provider drafts but does not
  invoke duplicate channel search or protected target-key verification;
- complete preparation retains the existing duplicate behavior;
- a target configuration change invalidates execution in both modes;
- partial success records per-item results without rollback;
- confirmed successes are excluded from same-target retry;
- failed and uncertain retry items run complete reconciliation;
- exact matches on retry become already-present rather than duplicate creates;
  and
- empty messages, 401, 403, and provider-specific failures retain safe and
  actionable user feedback.

Provider contract tests continue to prove one create call per heterogeneous
item and the provider-specific payload shape. New API coverage must retain
`mode: "single"`, `groups` serialization, and useful
`ChannelSensitiveWrite`-related 403 feedback.

### Component tests

Cover both shared modes:

- repair-created mode starts with all recoverable created keys selected;
- users can deselect items and edit models;
- target information and settings navigation are shared with standard mode;
- switching to complete checks reruns the shared preview without losing valid
  user selections;
- repair-created mode executes from its visible review without a second
  confirmation;
- standard mode retains its complete checks and confirmation;
- blocked items remain visible while valid selected items can proceed;
- partial results and retry controls are shared by both entry points; and
- a generally applicable enhancement cannot be rendered only for the
  repair-created source.

### Browser-level test

Add one intercepted Playwright scenario for the integration risk that lower
layers cannot prove alone:

1. a repair job finishes with exact created-key references;
2. the result opens the simplified shared import review;
3. the user deselects one key;
4. the selected key is created in the current managed site; and
5. the result summary preserves the unselected item and successful item.

Keep provider, error, retry, and selection matrices in Vitest rather than
expanding E2E coverage.

### Validation ladder

Run related Vitest coverage first, then `pnpm compile` because shared contracts
and control flow change. Run `pnpm run i18n:extract:ci` for locale changes,
followed by `pnpm run validate:staged`. Because the implementation changes
shared runtime contracts, provider wiring, and browser-background data flow,
run `pnpm run validate:push` before remote handoff.

## Maintainability Decision

Reuse account runtime-key normalization, managed-site capability resolution,
channel-draft builders, duplicate matching, protected-key verification, the
batch-import preview and result components, concurrency control, error
sanitization, and analytics actions.

Extract only the created-token reference adapter, typed import intent, target
identity/receipt policy, and small shared controller changes needed to express
the two modes. Do not build a repair-specific channel creator, duplicate the
batch dialog, or add provider branches to repair UI code.

The standard flow remains the architectural owner. Repair-created mode is a
source-aware simplification of that flow, never an independent feature fork.
