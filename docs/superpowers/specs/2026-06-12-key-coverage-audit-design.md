# Key Coverage Audit Design

Date: 2026-06-12

## Purpose

Evolve the existing Key Management "ensure at least one key" repair flow into
a manual key coverage audit that can:

- detect each saved account's currently available groups
- create default keys for available groups that have no key
- list keys whose assigned group is no longer available
- let users explicitly delete selected invalid keys after confirmation

The feature should remain a low-friction maintenance tool inside Key
Management. It should not become a new sidebar entry, a page-level dashboard,
or a background scheduler in the first version.

## Current Context

`src/features/KeyManagement/KeyManagement.tsx` already owns a header action that
opens `RepairMissingKeysDialog`. The dialog is backed by a background repair
runner in `src/services/accounts/accountKeyAutoProvisioning/repair.ts`.

The current repair runner:

- scans enabled accounts
- skips known unsupported accounts such as Sub2API and AIHubMix
- calls `ensureDefaultApiTokenForAccount`
- creates one default key only when an account has no keys
- persists progress and sends runtime progress updates

The existing dialog already has the right shell for a manual maintenance task:

- modal header and status badge
- progress bar
- summary counts
- search
- outcome filters
- per-account result rows
- Sub2API manual create-key affordance for skipped rows

The key change is semantic: the old unit of coverage was "account has at least
one key"; the new unit is "each available group has at least one key".

## Problem

Relay-site groups can change over time. A previously useful key can point to a
group that no longer exists, and a newly available group can have no key. Users
currently have to inspect accounts and keys one by one to notice these gaps.

The feature also includes a destructive path: deleting a key in the extension
deletes the key on the remote site. The UI must make that boundary explicit and
must not make deletion look like part of the automatic repair step.

The current button label also risks becoming misleading if clicking it
immediately starts a larger operation. The first version should distinguish
between opening the audit tool and starting remote writes.

## Goals

- Reuse the existing Key Management repair entrypoint and dialog shell.
- Rename the entrypoint so it opens a key audit tool rather than implying a
  single missing-key repair.
- Require an explicit "start" action inside the dialog before scanning and
  creating keys.
- Use available user groups as the source of truth for group coverage.
- Create default keys only for missing available groups.
- List invalid keys separately from account coverage results.
- Support selected and bulk deletion for invalid keys with strong
  confirmation.
- Keep deletion serial and partial-success aware.
- Preserve existing unsupported-site skips and manual affordances.

## Non-Goals

- Do not add a new sidebar entry.
- Do not add a page-level tab to Key Management in the first version.
- Do not add scheduled or automatic background audits.
- Do not automatically delete invalid keys.
- Do not add a user-facing concurrency setting.
- Do not redesign the whole Key Management page.
- Do not broaden the first version into Sub2API or AIHubMix group semantics.
- Do not manually edit translated docs or generated locale output outside the
  normal repo workflow.

## Information Architecture

The Key Management header should keep a single maintenance action, renamed from
the current "ensure at least one key" wording.

Recommended Chinese copy:

- Header button: `密钥检查`
- Dialog title: `密钥覆盖检查`
- Start action: `开始检查并补齐`

Recommended English intent:

- Header button: `Key Check`
- Dialog title: `Key Coverage Check`
- Start action: `Start Check and Backfill`

The header button opens the dialog only. It should not start a new audit by
itself. This prevents a user from accidentally triggering remote key creation
before they understand the operation.

If an audit job is already running when the page loads, the dialog may open
automatically to show progress. That is a recovery/view behavior, not a new
execution.

## Dialog Layout

The dialog should keep the existing repair modal structure and extend the
result area.

Top to bottom:

1. Header
   - title
   - running/completed/failed status badge
   - short description
2. Intro or progress area
   - initial state explains what will happen
   - running state shows progress and current status
   - completed state shows the latest run summary
3. Summary metrics
   - enabled accounts
   - eligible accounts
   - processed accounts
   - groups covered / total available groups when known
   - created keys
   - invalid keys
   - failed accounts or failed delete count when relevant
4. Result view switch
   - `账号覆盖`
   - `异常密钥`
5. View-specific toolbar
   - account coverage: search and outcome filter
   - invalid keys: search, select current result, selected count, delete
     selected
6. Scrollable result list
7. Footer note
   - audit runs in the background after it starts
   - deletion removes keys from the remote site

Use a compact segmented control for the two result views. Do not make these
page-level tabs. The results are a session snapshot, not a persistent top-level
section.

## Initial State

When opened with no running job, the dialog should show:

- explanation of the operation
- note that it may create default keys on remote sites
- note that it will not automatically delete keys
- primary button: `开始检查并补齐`
- optional secondary content showing the last completed result, if available

The user must click the start button before the runner scans groups or creates
keys.

## Account Coverage View

This is the default result view.

Each row represents one account and should keep the existing row rhythm:

- account name
- site type badge
- site origin
- outcome badge
- coverage details
- relevant action, such as manual key creation for skipped Sub2API accounts

Coverage details should show:

- available group count
- covered group count
- created group keys
- missing groups that could not be created
- error message when group detection or key creation failed

Rows should remain searchable by account name, origin, site type, and group
name when group details are available.

Outcome filters should remain secondary to the view switch. They filter account
coverage rows only; they should not filter the invalid-key view.

## Invalid Keys View

This view lists existing keys whose assigned group is no longer present in the
account's current available group set.

Each row should show:

- checkbox
- key name
- account name
- site type badge
- site origin
- invalid group name
- reason, such as `分组当前不可用`
- per-row delete action

The view should support:

- search by key name, account name, origin, site type, and group name
- select all current filtered results
- selected count
- `删除所选` button enabled only when at least one invalid key is selected

Invalid keys should be based on the latest audit snapshot. They should not be
shown as a permanent real-time state unless the user reruns the check.

## Bulk Delete Behavior

Bulk deletion is allowed only from the `异常密钥` view and only for selected
invalid keys from the current audit result.

Deletion must require a destructive confirmation dialog.

The confirmation should include:

- selected key count
- explicit remote-site deletion warning
- a short preview of selected key names and account names
- overflow text for additional selected keys
- destructive confirm label such as `删除所选密钥`

Recommended Chinese warning intent:

> 这些密钥会同时从对应网站删除，无法通过扩展恢复。请确认它们的分组已不再使用。

Bulk deletion should execute serially with a normal `for...of await` loop. Do
not add a new worker pool or user-facing concurrency control. The transport
layer already applies per-site request limiting, and serial deletion produces a
clearer partial-success story for a destructive operation.

After deletion:

- successfully deleted keys should be removed from the invalid-key list or
  marked deleted
- failed keys should remain visible with an error message
- the dialog should show a partial-success summary when any deletion fails
- the audit should not automatically rerun after deletion
- a `重新检查` action should remain available

## Service Design

The current `ensureDefaultApiTokenForAccount` can remain as the narrow legacy
helper for the old "one key per account" semantics.

The group-aware audit should use a new service-level helper with a clearer
contract, for example:

```ts
ensureAccountKeysForAvailableGroups(params)
```

The helper should:

1. fetch current tokens
2. fetch current user groups
3. normalize available group names
4. compute covered groups from token `group` fields
5. create default tokens for uncovered available groups
6. compute invalid tokens whose group is non-empty and not available
7. return structured coverage and invalid-key data

If group fetching is unsupported or returns no groups, the service should fall
back to the existing "account has at least one key" behavior rather than
blocking compatible sites that do not expose group inventory.

Creation should reuse the existing default token request shape, overriding only
the group and a predictable default name when a group-specific key is created.

## Progress Model

The repair progress type should be extended compatibly. New fields should be
optional where older stored progress blobs may exist.

Account result additions may include:

- `availableGroups`
- `coveredGroups`
- `createdGroups`
- `missingGroups`
- `invalidTokens`
- `groupCoverageStatus`

Summary additions may include:

- `availableGroups`
- `coveredGroups`
- `createdKeys`
- `invalidKeys`
- `deletedKeys`
- `deleteFailed`

Existing outcome values may remain for account-level filtering:

- `created`
- `alreadyHad`
- `skipped`
- `failed`

If an account both creates missing group keys and detects invalid keys, the
account coverage outcome should still reflect the coverage repair result, while
invalid keys appear in the separate invalid-key view.

## Unsupported Sites

Keep the current conservative unsupported-site behavior in the first version:

- Sub2API remains skipped for automatic repair because key creation requires
  explicit group selection through its own flow.
- AIHubMix remains skipped because key creation has one-time-secret behavior
  and no One-API-style group semantics.
- none-auth accounts remain skipped.

The existing Sub2API manual create-token affordance should remain available in
skipped account rows.

## Error Handling

Failures should be scoped to the account or key being processed when possible.

Audit failures:

- group fetch unsupported: fall back to one-key behavior
- group fetch failed due to network/auth: mark account failed
- token fetch failed: mark account failed
- key creation failed for one group: keep processing other groups only if the
  service can do so without hiding the failure

Delete failures:

- keep failed rows selected or visible
- show per-key error message
- show aggregate partial-success feedback
- do not roll back successful remote deletions

User-facing messages must not rely only on backend messages. Provide local
fallback copy for empty or unsuitable backend errors.

## Telemetry Decision

Reuse the existing Key Management repair analytics action for the audit start
and completion path if the event remains semantically correct.

If the payload needs more detail, add privacy-safe counts only:

- eligible account count
- processed account count
- created key count
- invalid key count
- deleted key count
- delete failure count
- coarse status kind

Do not record key names, group names, origins, URLs, token ids, raw backend
messages, or account identifiers.

Bulk invalid-key deletion is a user-visible destructive action. It should have
its own action id or a clearly distinguishable action detail if the analytics
schema already supports that pattern.

## Settings Search And Deep Links

This change does not add a settings page or a new persistent configuration
control. It does not need a new settings search target.

If the header action is later exposed as a deep-link target, add a stable target
id then. That is out of scope for the first version.

## Testing Strategy

Service tests should cover:

- existing one-key fallback remains stable
- available groups are fetched and normalized
- keys are created for missing available groups
- existing keys satisfy their own group
- invalid tokens are detected when their group is not available
- empty or unsupported groups fall back to the existing one-key behavior
- Sub2API, AIHubMix, and none-auth skip behavior remains unchanged
- partial group creation failures are reported
- bulk delete succeeds serially and reports deleted keys
- bulk delete partial failure keeps failed keys visible

Component tests should cover:

- header button opens the dialog without starting a new audit
- initial dialog explains remote key creation and no automatic deletion
- start button sends the start message
- running progress still opens automatically when a job is already running
- account coverage and invalid-key views switch correctly
- invalid-key selection, select current results, and selected count
- delete selected button disabled until selection exists
- destructive confirmation copy mentions remote deletion
- partial delete result is rendered

E2E is not required for the first version. The main risks are service behavior,
state transitions, and destructive confirmation copy, which are better covered
with focused Vitest and Testing Library tests.

## Validation Plan

Focused validation should include:

```powershell
pnpm vitest run tests/services/accountKeyRepair.test.ts tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx
```

Related validation should include:

```powershell
pnpm vitest related --run src/services/accounts/accountKeyAutoProvisioning/repair.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/features/KeyManagement/components/RepairMissingKeysDialog.tsx src/features/KeyManagement/KeyManagement.tsx
```

Commit gate:

```powershell
pnpm run validate:staged
```

## Rollout Notes

This is a user-facing behavior change. The changelog should describe it as a
manual key coverage check that can backfill missing group keys and identify
invalid group keys for cleanup.

The docs should avoid implying automatic deletion or scheduled monitoring.
Deletion must be described as explicit and confirmed by the user.
