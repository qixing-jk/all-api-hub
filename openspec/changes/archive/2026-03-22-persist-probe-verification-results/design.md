## Context

AI API verification currently runs in three UI surfaces:

- `src/components/dialogs/VerifyApiDialog/index.tsx` for account-backed verification launched from Model Management.
- `src/features/ApiCredentialProfiles/components/VerifyApiCredentialProfileDialog.tsx` for stored API credential profiles.
- `src/entrypoints/content/webAiApiCheck/components/ApiCheckModalHost.tsx` for ad-hoc in-page checks.

The existing verification pipeline already provides the right execution primitives:

- Reuse `runApiVerificationProbe` and the shared `ApiVerificationProbeResult` shape from `src/services/verification/aiApiVerification/**`.
- Reuse `translateApiVerificationSummary` and `ProbeStatusBadge` for rendering localized summaries and status chips.
- Reuse the storage-service pattern from `src/services/apiCredentialProfiles/apiCredentialProfilesStorage.ts` and `src/services/accounts/accountStorage.ts`, including `@plasmohq/storage`, `browser.storage.onChanged`, and `withExtensionStorageWriteLock`.
- Reuse existing list/detail surfaces instead of creating a separate history page: `ApiCredentialProfileListItem`, `ModelList`, and the verification dialogs themselves.

The change is cross-cutting because it introduces a new persisted data model, new UI affordances, and privacy constraints around what can be written to local storage.

## Goals / Non-Goals

**Goals:**
- Persist the latest AI API verification summary for durable verification targets so users can revisit the most recent result after closing a dialog.
- Store only sanitized, bounded data that is safe to keep in extension local storage.
- Surface the latest verification status and verified-at timestamp in existing list/detail UIs.
- Let users clear stored verification history for the current target without deleting the underlying account or profile.

**Non-Goals:**
- Persist raw request/response diagnostics, provider payloads, or full error bodies.
- Add a multi-run audit log or time-series history browser; this change stores the latest summary per target.
- Change CLI-support verification behavior; the issue targets AI API verification probes.
- Persist ad-hoc web-page API-check history, because that flow lacks a durable first-class entity and would require a new credential fingerprinting scheme.

## Decisions

### 1. Introduce a dedicated verification-history storage service

Add a new service under `src/services/verification/verificationResultHistory/` with its own storage key and lock. The service will own:

- config coercion/versioning
- latest-summary upsert and clear operations
- query helpers for profile rows, model rows, and dialog bootstrap
- a `subscribeToVerificationResultHistoryChanges` helper mirroring the API credential profiles storage pattern

Why this over extending account/profile storage:

- Verification summaries are cross-cutting and not owned by either account storage or profile storage alone.
- Keeping the data separate avoids inflating account/profile schemas with view-specific summary state.
- A dedicated store makes privacy review and future pruning rules easier.

### 2. Persist only sanitized summary snapshots, not raw probe results

Persisted records will be derived from `ApiVerificationProbeResult`, but the stored shape will drop `input`, `output`, and `details`. Each persisted probe summary will keep only:

- `probeId`
- `status`
- `latencyMs`
- `summaryKey`
- `summaryParams`
- a bounded fallback `summary`

The record will also store:

- `verifiedAt`
- `apiType`
- `resolvedModelId` when one is available
- an overall status derived from probe statuses
- non-secret target metadata needed for lookup and rendering

Why this over storing the full result object:

- Existing result objects intentionally include diagnostic payloads for the active dialog, which is useful transiently but too risky for persistence.
- The issue explicitly forbids persisting raw keys or unsafe error echoes.
- A bounded, sanitized summary preserves user value while constraining storage and privacy exposure.

### 3. Scope saved summaries to durable UI targets

Persist summaries only for targets the extension can safely identify later:

- `profile`: a stored API credential profile, optionally with a model-specific context from Model Management
- `account-model`: a model row under a stored account in Model Management

Implementation detail:

- Profile verification launched from the profiles page writes a latest summary keyed to the profile id.
- Profile verification launched from a profile-backed model row writes a model-scoped summary keyed to profile id + model id.
- Account verification launched from an account-backed model row writes a model-scoped summary keyed to account id + model id.

Why this over keying on token ids or ad-hoc credential hashes:

- Model Management rows and stored profiles are the durable surfaces that need status badges.
- Account-backed model verification is initiated from a model row, so account id + model id matches the user-facing list item.
- Token ids are selected inside the dialog and are not available to the model list beforehand; using them as the primary lookup key would prevent list rendering.
- Ad-hoc credential hashing would expand scope and privacy review without a clear list/detail surface.

### 4. Mirror verification history back into the existing list/detail surfaces

UI changes will stay inside current components:

- `ApiCredentialProfileListItem` shows `last verified` status + timestamp and a clear-history action.
- `ModelList`/`ModelDisplay`/`ModelItemHeader` show the latest verification status for model-scoped targets.
- `VerifyApiDialog` and `VerifyApiCredentialProfileDialog` bootstrap from persisted history so reopening the dialog shows the latest summary before the next run.

Why this over a new standalone history view:

- The issue asks for status in list/detail locations users already use.
- Existing cards and dialogs already have the right affordances for “run again”, “view summary”, and “clear history”.

### 5. Keep writes explicit and local to successful probe updates

Dialogs will persist history when an individual probe result arrives and when the run-all flow finishes updating the final in-memory state. The persistence helper will derive the full current summary snapshot from probe state rather than asking the verification service to own UI persistence.

Why this over moving persistence into `runApiVerificationProbe`:

- The probe runner does not know the durable UI target or whether the caller is a persistable flow.
- Keeping persistence in the dialog/controller layer avoids coupling the core verification service to storage and UI identity rules.

## Risks / Trade-offs

- [Account-model history ignores token-level identity] → Mitigation: scope status to the user-visible account/model row, and keep token selection transient inside the dialog.
- [Persisted fallback summaries could still be too verbose] → Mitigation: store only sanitized strings and cap fallback summary length before writing.
- [New storage writes may race across popup/options/background contexts] → Mitigation: use a dedicated storage lock and the existing read-modify-write service pattern.
- [List badges may become stale after external edits] → Mitigation: expose a storage subscription helper and reload badge state on `browser.storage.onChanged`.
- [Users may infer a full history exists] → Mitigation: copy and clear-history behavior should consistently refer to the latest verification result.
