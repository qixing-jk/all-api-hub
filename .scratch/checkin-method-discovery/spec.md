# Account-Level Check-In Method Discovery, Selection, and Execution Design

- Status: Design approved; implementation plan in progress (Tickets 01-04 and 06 resolved; Tickets 05 and 08 partially implemented)
- Related issue: qixing-jk/all-api-hub#1270
- Design baseline: `origin/main` @ `1c6f72543c8feb12a8562eb15199969656045979`
- Current implementation: merged to `main` through PRs #1340, #1343, and #1350
- Research and review date: 2026-08-10
- Current implementation slice: Tickets 01-04 deliver the method-aware account model, bounded discovery, selection, and AccountDialog recovery controls. Ticket 06 delivers the Sub2API authentication-durability prerequisite. PR #1350 also hardens related readiness, execution-result, and recovery UI paths from Tickets 05 and 08 without claiming their remaining acceptance criteria. Tickets 07 and 09 remain unimplemented.

## 1. Goals and Non-Goals

### Goals

Establish a general check-in method model for each account so the system can:

1. Detect every candidate check-in method supported by the account's deployment from actual protocol signals.
2. Store the protocol-match facts, current deployment status, and today's check-in status separately for each method.
3. When no selection exists, automatically select the only conclusively matched method; `ambiguous` or `unknown` prevents only the creation of a new selection and does not revoke an existing selection that remains executable.
4. Allow users to select a method manually and retain that selection without silent replacement by background refresh or rediscovery.
5. Make ordinary refresh and the scheduler access only the currently selected method instead of enumerating every candidate again.
6. Continue using and deepen the existing `AutoCheckinProvider` registry instead of creating a parallel architecture.
7. Use `sub2api-pro:daily-checkin` as the first strictly verified Sub2API check-in method.
8. Define protocol-evidence-driven safety contracts for uncertain mutations, account identity, and token rotation, without blindly replaying a POST that may already have been applied.
9. Migrate directly to a new canonical account configuration without retaining legacy fields in the runtime model indefinitely.

### Non-Goals

- Do not put `customCheckIn` into the registered method registry. It remains an independent URL/bookmark-style flow.
- Do not infer a fork from the host, product name, version text, or loosely matched response fields.
- Do not support the unverified `/api/v1/check-in` endpoint or recursively searched field aliases.
- Do not persist raw upstream responses, backend messages, URLs, hosts, tokens, cookies, or account identifiers in the check-in configuration.
- Do not implement UI, migrations, providers, scheduler changes, or storage changes in this design iteration.
- Do not require a one-time rewrite of every existing provider implementation.

## 2. Domain Terminology

| Term | Meaning | Does not mean |
| --- | --- | --- |
| Check-in Method | A stable, named built-in check-in protocol Adapter registered in the registry | Site Type or custom URL |
| Detection | Whether a method matches the protocol exposed by the current deployment | Whether the account has checked in today |
| Status Readback | An optional read-only operation that reports whether a matched method is enabled or has checked in today | A prerequisite for selecting or executing the method |
| Status | Whether a matched method is currently enabled and whether the account has checked in today | Whether the method is the only match |
| Discovery | Running Detection for every candidate method associated with the account's Site Type | Ordinary status refresh |
| Selection | Which method the account uses and whether the choice is automatic or manual | Proof that the deployment currently enables the method |
| Decision | A transient `resolved`/`ambiguous`/`unsupported`/`unknown` result derived by the registry from all method Detection results | A second persisted source of truth |
| Custom Check-in | A user-saved custom check-in or redemption URL | A registered method or authoritative remote check-in result |
| Uncertain Mutation | A POST may have been applied, but no authoritative result is available | An ordinary failure that may be retried directly |
| Status-first | Read the selected method's authoritative status before every mutation and POST only when it is enabled and not checked in | Using cached account state instead of remote confirmation |

`CheckInConfig` is already the check-in namespace, so no additional `builtIn` wrapper is added. `methodKnowledge.methods` represents registered built-in methods, while `customCheckIn` explicitly remains independent.

## 3. Issue Intake and Protocol Evidence

### Issue status

- Issue #1270 is open, labeled `enhancement`, and has no comments, sub-issues, or dependencies.
- Related PR #1229 was closed without merging. The maintainer noted that the previous design conflated a global toggle, deployment capability, account configuration, protocol selection, and today's status, and used heuristics to support multiple fork endpoints.
- The follow-up discussion on #1229 did not establish an independent protocol source for `/api/v1/check-in`, so that route must not enter the first Adapter.
- The repository still uses a single-value `site_type -> provider` registry, so the Issue remains aligned with the current implementation.

### Fixed upstream evidence

The initial `sub2api-pro:daily-checkin` contract is pinned to the public fork
`jiangmuran/sub2api_pro@3f8585707632c959ca36be84e13c5a738c005a83`.
Wei-Shaw/sub2api#510 implements the same protocol, but that PR was closed without merging.

Verified facts:

- `GET /api/v1/redeem/checkin/status`
- `POST /api/v1/redeem/checkin`
- Both routes are protected by the existing JWT middleware.
- The successful envelope is `{ code: 0, message: "success", data }`.
- An error envelope's top-level `code` is the numeric HTTP-equivalent value `403` or `409`.
- A stable machine-readable cause is the top-level string `reason`, for example `DAILY_CHECKIN_DISABLED`; it must not be misread as the numeric `code`.

Sources investigated:

- [Issue #1270](https://github.com/qixing-jk/all-api-hub/issues/1270): body, comments, events, and timeline.
- [PR #1229](https://github.com/qixing-jk/all-api-hub/pull/1229): body, reviews, review comments, closing explanation, and follow-up requests for protocol sources.
- [Wei-Shaw/sub2api#510](https://github.com/Wei-Shaw/sub2api/pull/510): closed, unmerged upstream attempt.
- [jiangmuran/sub2api_pro@3f858570](https://github.com/jiangmuran/sub2api_pro/commit/3f8585707632c959ca36be84e13c5a738c005a83): route, handler, service, response, and error source code.

All public sources above were accessible. No Issue or PR evidence was unavailable because of permissions or network access.

## 4. Current Implementation and Problem Boundary

### Current account configuration

`CheckInConfig` currently contains:

- `enableDetection`
  - Users have no UI that modifies it directly.
  - Auto-detection and account refresh write it from a support probe.
  - AccountDialog site policy may also overwrite it from the static `supportsBuiltInCheckInDetection` setting.
  - The scheduler, providers, filters, and UI treat it as an effective capability gate.
- `autoCheckInEnabled`
  - The per-account automatic-execution intent that users can modify.
- `siteStatus`
  - Today's status for a single built-in flow, with no method ID.
- `customCheckIn`
  - An already independent URL/bookmark-style flow.

Therefore, `enableDetection` is a legacy, system-controlled effective capability flag, but it is not strict evidence of Detection under the new protocol model:

- `true` may come from a real probe or from static site policy.
- `false` may mean unsupported, probe failure, statically disabled, or never probed.
- A boolean cannot express a matched method ID, disabled, ambiguous, or unknown.

### Current registry, refresh, and scheduler

- `src/services/checkin/autoCheckin/providers/index.ts`
  - `AutoCheckinProvider` exposes only `canCheckIn` and `checkIn`.
  - The registry is `Record<site_type, provider>`, so each Site Type resolves to only one provider.
- `src/services/accounts/autoDetectCompletion/completion.ts`
  - A shared account auto-detection completion Seam already exists.
  - A support-probe failure is collapsed to `false`, incorrectly treating unknown as unsupported.
- `src/services/accounts/accountStorage.ts`
  - Ordinary refresh queries support again and overwrites `enableDetection`.
  - `markAccountAsSiteCheckedIn` swallows persistence failures and returns `false`, which the scheduler currently ignores.
- `src/services/checkin/autoCheckin/scheduler.ts`
  - The scheduler resolves providers, executes them, writes status, and decides retries itself.
  - Every failed runnable account may enter the ordinary retry loop.
  - `CheckinAccountResult` cannot express mutation certainty.
  - The scheduler explicitly does not trust `siteStatus.isCheckedInToday` as an execution-eligibility signal.
- Existing providers' status-read capabilities are distributed across Site Adapters:
  - New API, Veloera, WONG, and VoAPI v2 already have read-only queries for today's status that can be reused as a Method Adapter's `getStatus`.
  - AnyRouter's `fetchCheckInStatus` actually calls `POST /api/user/sign_in`, so it cannot be used for passive detection or read-only reconciliation.
- `src/services/apiService/sub2api/**`
  - A good protocol-side auth-session port, per-account serialization, and locked read of the latest auth already provide useful Seams.
  - Token persistence failures are swallowed.
  - Browser resync does not validate `AccountBrowserSession.userId` and does not preserve the complete rotated credential set.

## 5. Core Architectural Decisions

### Decision 1: Deepen the existing registry into the sole Check-in Method Module

Continue owning the registry under `src/services/checkin/autoCheckin/providers/`. Do not add an API Adapter registry, site-capability registry, or second method registry.

Using deep-Module terminology:

- **Module**: Account-level check-in method state derivation, discovery, selection, and execution.
- **Interface**: Callers express product use cases rather than obtaining an Adapter and assembling domain rules themselves.
- **Seam**: Deepen the existing provider registry into a stable method registry.
- **Adapter**: Each deployment protocol implements at most three protocol operations inside the registry: detect, status, and check-in.

The product-level Module Interface covers five distinct user use cases:

```ts
interface CheckInMethods {
  inspect(input: CheckInInspectionInput): CheckInAccountState

  discover(input: CheckInDiscoveryInput): Promise<CheckInDiscoveryDecision>

  setSelection(
    input: CheckInSelectionInput,
  ): Promise<CheckInSelectionResult>

  refreshSelectedStatus(
    input: SelectedCheckInMethodInput,
  ): Promise<SelectedCheckInStatusResult>

  executeSelected(
    input: SelectedCheckInMethodInput,
  ): Promise<SelectedCheckInExecutionResult>
}
```

These five entry points are not methods that every provider must implement. `inspect` centrally derives Decision, stale state, choices, execution eligibility, and `rediscoveryRecommended`; `setSelection` centrally enforces automatic/manual rules. The UI, ordinary refresh, and scheduler must not each duplicate these rules.

Callers must not obtain an Adapter and then aggregate results, change the selection, or decide retry policy themselves. The internal Adapter Interface still exposes at most three protocol operations, as defined in Section 8.

### Decision 2: Site Type only filters candidates

`siteTypes` is a static candidate index for an Adapter, not proof that a deployment supports it. Do not place dynamic check-in capability in static `siteTypeCapabilities`.

Registry initialization must validate that:

- Method IDs are globally stable and unique; duplicate IDs fail immediately.
- IDs come from a single runtime constant source in the registry, and the type is derived from that source.
- Every Adapter declares at least one candidate Site Type.
- An Adapter's `detect` operation is read-only. A future protocol that requires a mutation to establish support cannot participate in automatic discovery.
- Candidate order provides deterministic request order only; it does not break ambiguity.

### Decision 3: Migrate account configuration directly to V7

- The new runtime and persisted `CheckInConfig` omit `enableDetection` and `siteStatus`.
- Legacy fields exist only in the migration-local `LegacyCheckInConfigV6` or a Module-private, non-persisted compatibility view used to delegate an old provider operation during progressive migration. They never re-enter the canonical account model or caller Interface.
- Raw storage, old backups, and WebDAV payloads are decoded, migrated, and normalized before entering any business mutation.
- Do not release an intermediate runtime state in which both field systems coexist indefinitely.

### Decision 4: Ordinary refresh and the scheduler never perform discovery

- Initial account detection and an explicit user action to rediscover may call `discover`.
- Ordinary account refresh calls only `refreshSelectedStatus`.
- The scheduler calls only `executeSelected`.
- A newly registered candidate derives only `rediscoveryRecommended`; it does not scan a new endpoint or revoke or pause an existing selection that remains executable.
- When the selected method returns an authoritative 404/405, update only that method's knowledge in the current cycle. Do not choose and execute a replacement method within the same mutation cycle.

## 6. Canonical Account Configuration V7

### Top-level structure

```ts
type CheckInConfigV7 = {
  /**
   * The only per-account user intent that controls automatic execution.
   * Controls scheduler execution of the selected registered method only;
   * does not control customCheckIn.
   */
  automaticExecutionEnabled: boolean

  /** Deployment facts known to the system and the full-discovery boundary. */
  methodKnowledge: {
    /** Facts known about each method for the current account. */
    methods: Partial<Record<CheckInMethodId, CheckInMethodKnowledge>>

    /** When all current candidates most recently completed detection. */
    lastFullDiscoveryAt?: number
  }

  /** Always present; distinguishes automatic selection from a manual override. */
  selection: CheckInMethodSelection

  /** Independent custom URL configuration; does not participate in the registry. */
  customCheckIn?: ExistingCustomCheckInConfig
}
```

Do not add a `builtIn` wrapper: `CheckInConfig` is already the check-in namespace. `methodKnowledge` is not visual grouping. It places the per-method facts and full-discovery boundary that must be maintained atomically under the same system ownership. `methods` is more direct than `byId`.

### Selection controller

```ts
type CheckInMethodSelection =
  | {
      mode: "automatic"
      methodId?: PersistedCheckInMethodId
    }
  | {
      mode: "manual"
      methodId: PersistedCheckInMethodId
    }
```

Constraints:

- The controller always exists, even when no method is selected.
- Do not persist a revision or discovery generation. When an asynchronous discovery commits, re-read the account under the existing account storage lock and compare the account identity and current `selection.mode + methodId`. In manual mode, update knowledge only and do not change the selection.
- Do not persist `active | stale`. Whether a selection is stale is derived centrally from whether the registry currently recognizes the method ID, the method's Detection, and authoritative unsupported evidence.
- Rediscovery must not silently replace the method ID when `mode: "manual"`.
- Migration does not persist a long-lived `source: "legacy"` selection mode. The legacy source belongs to method evidence, while the migrated selection follows automatic-mode behavior.
- `PersistedCheckInMethodId` may retain a syntactically safe opaque ID that is not registered in the current registry. This preserves a stale manual selection after downgrade, Adapter removal, or synchronization. Only an ID registered in the current registry can execute.

Field ownership:

- The user owns `automaticExecutionEnabled`, explicitly submitted selection changes, and `customCheckIn`.
- The system owns `methodKnowledge` and automatic selections produced by discovery.
- When AccountDialog saves, it must re-read the latest account under the storage lock and patch only fields the user actually changed. It must not write back the entire stale `checkIn` draft captured when the form opened and thereby overwrite background status or discovery updates.

### Per-method knowledge aggregation

```ts
type CheckInMethodKnowledge = {
  /** Whether the protocol matches; a relatively durable capability fact. */
  detection: CheckInMethodDetection

  /** Whether it is currently enabled and checked in today; mutable status. */
  status?: CheckInMethodStatus
}
```

Detection and Status must remain separate. For example, when an ordinary status refresh fails because of the network:

- A previously confirmed protocol match remains valid.
- The current operation returns Status unknown. If a timestamped known Status already exists, it may be retained as a stale observation.
- Detection must not change from matched to unknown, and one temporary unknown must not revoke an established fact.

Status Readback is optional. A matched method without a safe `getStatus`
operation remains selectable and executable. The absence of readback means only
that ordinary refresh cannot update today's Status and the Module cannot use
status-first or read-only reconciliation for that method; it must not be
reclassified as unsupported.

```ts
type CheckInMethodDetection =
  | {
      outcome: "matched"
      evidence:
        | {
            source: "probe"
            observedAt: number
          }
        | {
            source: "legacy_migration"
          }
        | {
            /** Existing-provider bridge when Account Site Type is conclusive but no safe protocol probe exists yet. */
            source: "compatibility_registration"
          }
      /** The latest full-discovery attempt failed temporarily; does not revoke the established match. */
      lastUnknownAttempt?: CheckInMethodUnknownAttempt
    }
  | {
      outcome: "unsupported"
      evidence: {
        source: "probe"
        observedAt: number
      }
      /** The latest full-discovery attempt failed temporarily; UI and Decision still report unknown. */
      lastUnknownAttempt?: CheckInMethodUnknownAttempt
    }
  | {
      outcome: "unknown"
      reason: CheckInMethodUnknownReason
      attemptedAt: number
    }
```

```ts
type CheckInMethodUnknownAttempt = {
  reason: CheckInMethodUnknownReason
  attemptedAt: number
}
```

When the current full discovery returns unknown but a previous matched or unsupported fact exists, persist the new failure as `lastUnknownAttempt` on the established fact. Execution eligibility may still use the previous matched fact, while `inspect` and the UI after restart can honestly derive that the latest discovery attempt was unknown. A later authoritative matched or unsupported result clears this field.

```ts
type CheckInMethodStatus =
  | {
      outcome: "known"
      availability?: "enabled" | "disabled"
      today?: "checked" | "not_checked"
      evidence:
        | {
            source: "probe"
            observedAt: number
          }
        | {
            source: "execution"
            observedAt: number
          }
        | {
            source: "legacy_migration"
            legacyObservedAt?: number
            legacyDayKey?: string
          }
    }
  | {
      outcome: "unknown"
      reason: CheckInMethodUnknownReason
      attemptedAt: number
    }
```

`known` contains at least one of `availability` or `today`. V6 `siteStatus` usually knows only today's state, so migration must not invent availability. Express an unknown fact by omitting the field instead of storing another `unknown` string inside `known`.

```ts
type CheckInMethodUnknownReason =
  | "network"
  | "timeout"
  | "authentication_required"
  | "permission_denied"
  | "identity_mismatch"
  | "invalid_response"
  | "credential_persistence_failed"
```

The first release does not persist a bare `rewardAmount` in account configuration. It does not affect capability, selection, or today's state, and it has no common unit. If the reward from the current execution must be displayed, retain it in the scheduler execution result. Extend persistence only after a cross-restart display requirement and unit contract are established.

### Custom check-in

Keep the existing structure and semantics:

```ts
interface ExistingCustomCheckInConfig {
  url?: string
  turnstilePreTrigger?: TurnstilePreTrigger
  redeemUrl?: string
  openRedeemWithCheckIn?: boolean
  isCheckedInToday?: boolean
  lastCheckInDate?: string
}
```

`customCheckIn`:

- Does not enter `methodKnowledge.methods`.
- Does not participate in discovery, Decision, Selection, or ambiguity evaluation.
- Is not executed by a registered provider.
- Has an independent local state for whether it was opened or handled today.

### Account configuration invariants

1. Executable keys in `methodKnowledge.methods` must come from the registry. The decoder rejects prototype-pollution keys, abnormal lengths, and invalid strings, while retaining a syntactically safe unknown opaque ID in selection.
2. `methodKnowledge.methods` stores facts for each method, not a global persisted resolved/ambiguous/unsupported Decision.
3. Status unknown does not erase a confirmed Detection matched fact.
4. `today` belongs only to the method identified by its map key and cannot be reused across methods.
5. Selection validity or staleness, ambiguity, and execution eligibility are derived by the Module and are not persisted.
6. A full discovery produces a result for every current candidate and updates `lastFullDiscoveryAt`. Matched or authoritative unsupported replaces the old fact; temporary unknown does not revoke a previously established fact.
7. Ordinary refresh incrementally updates only the selected method's Status. An authoritative 404/405 from the selected endpoint may update that method's Detection but does not update `lastFullDiscoveryAt`.
8. Custom check-in state is independent of every registered method's state.
9. Uncertain state, retry counts, and mutation dispatch state do not enter account configuration.
10. Decision is used only to create a new selection and for presentation. Execution eligibility for an existing selected method depends only on that method's own facts, user intent, account state, and whether the current Adapter is available.
11. Status Readback is optional. Its absence does not invalidate a matched selection or make execution ineligible.

## 7. Discovery and Automatic Selection

### Candidate detection

Discovery enumerates only the candidate Adapters associated with the account's Site Type. It does not send requests blindly across the entire registry.

New methods require real read-only protocol evidence. During progressive migration only, a pre-existing provider registration may declare a constrained compatibility match when the Account Site Type has been conclusively identified but that provider has no safe read-only Detection yet. Persist it as ordinary matched evidence with `source: "compatibility_registration"`; it is only a reason inside the same Detection structure, not a special selection mode, registry, or scheduler branch. A later strict status or Detection signal replaces it with `source: "probe"`. AnyRouter requires this bridge because its current apparent status operation is the mutating sign-in POST; the bridge itself must never call that POST.

Candidates run serially by default, with a per-Adapter timeout and an account-level total deadline. Candidates not started before the budget is exhausted return unknown. A pre-save discovery timeout does not block account save. Ordering is deterministic by registry declaration order and stable ID, but order cannot break ambiguity.

One full discovery must produce one Detection for every candidate method:

- matched
- authoritative unsupported
- unknown

Commit the full result and update `lastFullDiscoveryAt` under the account storage lock only after all candidates have returned or the bounded budget has expired. If the worker terminates midway, retain the previous knowledge and do not write a partial round. Two read-only discoveries may be deduplicated per account in process. The first release does not add a persisted generation for this extremely low-probability race.

Commit by merging knowledge rather than blindly replacing the entire structure:

- Matched and authoritative unsupported replace the corresponding previous Detection.
- Persist a temporary unknown when no established fact exists. When matched or unsupported already exists, retain that fact and write `lastUnknownAttempt`, so the UI and Decision after restart can still report that the current attempt was unknown.
- Knowledge for IDs that are no longer current registry candidates does not participate in Decision. If selection still refers to such an ID, retain the selection and let `inspect` derive stale state.

### Decision aggregation rules

| All candidate Detection results | Derived Decision | Automatic selection |
| --- | --- | --- |
| Exactly one matched; every other candidate is authoritative unsupported | resolved | Yes |
| Two or more matched | ambiguous | No |
| One matched with any unknown candidate | unknown / incomplete candidates | No |
| No matched and at least one unknown | unknown | No |
| Every candidate is authoritative unsupported, or no candidate is registered | unsupported | No |

`matched + status.disabled` is still matched. If it is the only match, it may be selected automatically, but the scheduler must skip execution. No reselection is required if the deployment enables it later.

Decision determines only whether a new automatic selection may be created. When the account already has a selected method:

- A missing new candidate, unknown candidate, or multiple matches does not revoke the existing selection.
- If the original selection remains matched, continue using it and derive `rediscoveryRecommended` or an ambiguous presentation state.
- Only when the original selection is authoritative unsupported may automatic mode switch to a newly unique matched method. Manual mode always retains the stale ID until the user decides.

### Initial account auto-detection

```text
shared account completion
  → complete identity and credentials are available for this detection
  → registry.discover(read-only, no auth refresh/resync)
  → aggregate all candidates and write the account draft
  → write an automatic selection when exactly one method is established
  → user submits the account form
  → atomically persist the configuration with the initial account save
```

The detection phase has no stable account ID or compare-and-update target, so discovery uses an auth policy that forbids token refresh and resync. If the token has expired or requires rotation, the result is unknown and does not block account save. Explicit rediscovery is available after saving.

Until each existing provider has strict Detection, account completion may translate its current provider-support result into `compatibility_registration` evidence and the corresponding automatic selection. This preserves new-account behavior through the V7 cutover without pretending that a static compatibility result is a probe. New capabilities may not use this bridge.

“Automatically save the selection” means writing it to the detection draft and persisting it with the user's initial account save. It does not bypass the account form to create an account.

### Ordinary refresh

```text
refresh base account data/credentials
  → re-read the latest account under the account lock
  → registry.refreshSelectedStatus()
  → call selection.methodId only
  → validate identity and the current selection.mode + methodId
  → update that method's Status
```

Ordinary refresh does not enumerate candidates and does not silently change the selection mode or method ID.

### Manual selection, restore automatic, and rediscovery

- Manual selection writes `mode: "manual"` through the Module's `setSelection` use case.
- “Restore automatic selection” writes `mode: "automatic"` through the same use case. If existing knowledge establishes a unique match, it may select immediately; otherwise, prompt for rediscovery.
- If rediscovery shows that a manually selected method is no longer valid, retain the method ID. Derive stale state from facts and pause automatic execution.
- In automatic mode, a newly resolved unique discovery may update the method ID automatically.
- Ambiguous or unknown prevents only a new automatic selection. It does not clear or pause an existing selected method that remains usable.
- When the selected method returns an authoritative 404/405, do not enumerate other candidates or execute a replacement within the same mutation cycle.
- The first-release registry permits only read-only automatic discovery. If a real future protocol can establish support only by mutation, separately design “test and use” plus side-effect disclosure at that time. Do not add it to the Adapter contract preemptively.

## 8. Internal Adapter Contract

```ts
interface CheckInMethodAdapter<TProof = unknown> {
  readonly id: CheckInMethodId
  readonly siteTypes: readonly AccountSiteType[]

  detect(
    context: CheckInMethodContext,
  ): Promise<CheckInMethodDetectionResult<TProof>>

  getStatus?(
    context: CheckInMethodContext,
    proof?: TProof,
  ): Promise<CheckInMethodStatusResult>

  checkIn(
    context: CheckInMethodContext,
    proof?: TProof,
  ): Promise<CheckInMethodExecutionResult>
}
```

`TProof` is reused only within the same registry invocation to avoid a duplicate status request after detect. It must not be persisted or exposed to the UI. An Adapter does not leak a raw upstream DTO outside the Module.

The `unknown` reason returned by detect uses a controlled enumeration. Only an explicit negative protocol signal may return unsupported. Network failure, timeout, 401, permission failure, and malformed response are unknown.

`getStatus` is an optional protocol operation. Its absence does not prevent a
matched method from being selected or executed. When authoritative readback
exists, the Module provides consistent status-first and reconciliation
behavior. When no authoritative readback exists, the Adapter must not pretend
to expose read-only status, and uncertain results must not enter ordinary
retry. Adapters do not implement the five product-level use-case entry points.

Future constrained custom HTTP methods are only an evolution Seam for this Module: after a separate protocol and security design, a validated definition may produce an Adapter behind the same Interface. The current design does not define a user-editable request DSL, arbitrary headers or credentials, or a second custom-method execution path.

## 9. `sub2api-pro:daily-checkin` Contract

### Registration metadata

```ts
{
  id: "sub2api-pro:daily-checkin",
  siteTypes: [SITE_TYPES.SUB2API],
}
```

The method ID identifies a verified protocol. It does not assert that every Sub2API deployment statically supports the capability.

### Detection and Status

Call only:

```http
GET /api/v1/redeem/checkin/status
Authorization: Bearer <access_token>
```

Strict successful DTO:

```ts
interface Sub2ApiDailyCheckInStatusEnvelope {
  code: 0
  message: string
  data: {
    enabled: boolean
    checked_in_today: boolean
    reward_min: number
    reward_max: number
    reward_amount?: number
  }
}
```

Numeric values must be finite, and `0 <= reward_min <= reward_max`. Unrelated additive fields may be ignored, but aliases must not be searched recursively.

Mapping:

- HTTP 200, `code === 0`, and a valid DTO: Detection matched.
- `enabled: false`: Status known + disabled, not unsupported.
- `checked_in_today`: Status today checked/not_checked.
- HTTP 404/405: Detection authoritative unsupported.
- HTTP 401, permission failure, network failure, timeout, invalid envelope, or any other non-zero business result: Detection unknown.
- Detect never calls POST.

Reward fields returned by the protocol may be used for presentation during the current operation or in the execution result, but the first release does not persist them in account configuration.

### Execution

Every execution first reuses status proof from the same invocation. If no proof exists, GET first:

- Disabled: skipped / never retry.
- Checked today: already checked / never retry.
- Authoritative not checked: only then may POST be sent.
- Status unknown: do not send POST.

The only write endpoint is:

```http
POST /api/v1/redeem/checkin
Authorization: Bearer <access_token>
```

Strict successful data:

```ts
{
  message: string
  reward_amount: number
  new_balance: number
  checked_in_at: string
}
```

Execution mapping:

| Response/transport evidence | Mutation evidence | Next action |
| --- | --- | --- |
| 2xx, `code === 0`, and valid data | confirmed_applied | none |
| HTTP 409, `code: 409`, `reason: DAILY_CHECKIN_ALREADY_DONE` | confirmed_applied | none |
| HTTP 403, `reason: DAILY_CHECKIN_DISABLED` | confirmed_not_applied | none |
| HTTP 403, `reason: DAILY_CHECKIN_ROLE_FORBIDDEN` | confirmed_not_applied | manual recovery |
| JWT middleware authoritatively returns HTTP 401 | confirmed_not_applied | one inline auth recovery |
| HTTP 404/405 | confirmed_not_applied; method unsupported | manual redetect |
| The request is confirmed not dispatched | not_started | retry or manual action according to a controlled reason |
| The request may have been dispatched, followed by timeout, disconnection, lost response, 5xx, or a response that cannot be parsed authoritatively | uncertain | reconcile status only |

A 2xx response with `code !== 0` is never success. When there is no verified “not applied” reason, a non-authoritative response after dispatch is uncertain. Unverified message text does not participate in classification.

An authoritative 401 occurs before the business handler, so one inline auth recovery remains safe: validate identity, persist the rotated token, GET status again, and send one new POST only when status is authoritatively not checked. This is not an ordinary scheduler retry and cannot repeat without bound.

## 10. Mutation Certainty, Status-First, and Reconciliation

### Result model

`CheckinAccountResult` should deepen into a discriminated union instead of collapsing every non-success into failed or flattening status, mutation evidence, and next action into three independent axes that permit invalid combinations:

```ts
type CheckinAccountResult =
  | {
      accountId: string
      accountName: string
      methodId?: CheckInMethodId
      status: "success" | "already_checked"
      accountStateDurability?: "persisted" | "failed"
      timestamp: number
    }
  | {
      accountId: string
      accountName: string
      methodId?: CheckInMethodId
      status: "failed"
      retryable: boolean
      timestamp: number
    }
  | {
      accountId: string
      accountName: string
      methodId?: CheckInMethodId
      status: "skipped"
      reason: CheckInSkipReason
      timestamp: number
    }
  | {
      accountId: string
      accountName: string
      methodId?: CheckInMethodId
      status: "uncertain"
      reconciliation: "status" | "unavailable"
      timestamp: number
    }
```

The retry queue is populated only by `status === "failed" && retryable === true`; it must no longer be derived from a failed count. `uncertain` permits read-only verification only and never enters ordinary retry.

### The first release does not add a generic operation journal

The fixed Sub2API Pro protocol already provides:

- A unique check-in record keyed by `userId + server date`.
- Record creation and balance increment in the same database transaction.
- A unique-constraint conflict mapped to HTTP 409 + `DAILY_CHECKIN_ALREADY_DONE`.
- A GET status request that reads that same check-in record.

Therefore, the first-release safety chain is:

```text
GET status
  → at most one POST that can reach the business handler for authoritative enabled + not_checked
    (a middleware-confirmed pre-handler 401 may be followed by one recovered POST)
  → on uncertain, perform one bounded GET reconciliation
  → checked: converge to applied
  → not_checked: still do not POST again in the current cycle;
    Adapter policy determines whether a later retry is allowed
  → unknown: remain uncertain and do not enter ordinary retry
  → after worker interruption, the next run still begins with GET status
```

This satisfies the Issue's “no blind replay” requirement. A generic write-ahead journal proves only that the client prepared to send; it cannot independently determine whether the server applied the operation. Reconciliation remains impossible without authoritative readback. The first release therefore does not introduce `pendingOperations`, operation IDs, or a journal store.

A future Adapter may enter a new certainty-aware automatic-execution path only if it satisfies at least one of the following conditions:

- Verified server-side same-day idempotency or uniqueness.
- Authoritative status readback combined with status-first and reconciliation.
- When a real non-idempotent protocol need appears, a separately designed operation guard and manual recovery policy.

A confirmed successful remote check-in followed by failure to persist the account method Status is not mutation uncertainty. Retain the successful result, report `accountStateDurability: "failed"`, do not retry POST, and let a later GET status repair account state.

## 11. Account Identity and Token Rotation

### Identity invariants

Sub2API operations after account save must use short-lived account storage locks to protect snapshot reads, identity comparison, and credential writeback. Network I/O must not hold the lock for an extended period:

1. Re-read the latest account by account ID.
2. Capture the expected Site Type, normalized origin, and string-normalized `AccountIdentity`; normalize upstream numeric user IDs at the protocol boundary.
3. After refresh or resync obtains new credentials, use `/api/v1/auth/me` to verify the user ID that owns the token.
4. Compare and update only when the expected identity matches.

The browser session already contains a user ID. Resync must filter by the expected user ID; a session for another account on the same origin must not be written back. If only a different identity is found, return `identity_mismatch`. Identity changes may occur only through an explicit rebind or redetection and deduplication flow.

### Typed auth port

```ts
type PersistSub2ApiAuthResult =
  | { kind: "persisted" }
  | { kind: "account_missing" }
  | { kind: "identity_mismatch" }
  | { kind: "write_failed" }

interface Sub2ApiAuthSession {
  getLatestAuth(accountId: string): Promise<Sub2ApiAuth | null>

  persistAuthUpdate(input: {
    accountId: string
    expectedUserId: AccountIdentity
    expectedOrigin: string
    update: CompleteSub2ApiAuthUpdate
  }): Promise<PersistSub2ApiAuthResult>
}
```

If the refresh endpoint returns a complete rotated credential set, the access token, refresh token, and expiry must be persisted atomically as one credential set. Browser resync must return and validate the user ID. If it does not return new supplemental auth, preserve the latest refresh token and expiry re-read under the lock; do not fabricate or clear fields. The existing `persistAuthUpdate(): boolean` contract and behavior that swallows `false` must be deepened.

### Rotation order

A refresh token may rotate once and invalidate the previous token:

```text
obtain rotated access/refresh token
  → validate token identity
  → complete durable persistence successfully
  → validate account selection and identity again
  → GET authoritative status
  → only when enabled + not_checked
  → allow POST check-in
```

If persistence fails, stop before the business mutation and return `credential_persistence_failed`. Do not continue check-in using a new token that exists only in memory.

If the response is lost after the refresh-token POST is sent, the credential mutation itself is uncertain. Do not blindly replay the old refresh token. An identity-checked browser resync may be attempted; if recovery fails, require reauthentication.

Preserve the existing per-account-ID serialization of auth mutations, locked read of the latest auth, and one-time 401 recovery semantics.

## 12. Direct V6 → V7 Migration

### Storage-entry Seam

The final runtime and persisted schema does not retain `enableDetection` or `siteStatus`. The legacy shape is recognized only at entry points:

```text
raw storage / old backup / WebDAV remote payload
  → StoredSiteAccount decoder
  → version migrations
  → V7 normalization
  → canonical SiteAccount
```

Every account mutation callback must receive canonical V7. Paths such as `mutateStorageConfig` must not operate directly on unmigrated raw JSON.

Write the current configuration version when a new account is created. Also correct the current behavior in which a new account has no version and traverses the entire 0→CURRENT migration chain on its first read. V7 migration remains idempotent for an already canonical account.

### Migration algorithm

```text
input V6
  → automaticExecutionEnabled = old.autoCheckInEnabled ?? true
  → structurally copy customCheckIn
  → methodKnowledge = { methods: {} }
  → selection = { mode: "automatic" }
  → migrate from legacy enableDetection and registry legacy metadata
  → bind siteStatus to that method when possible
  → remove enableDetection, autoCheckInEnabled, and siteStatus
  → configVersion = 7
```

Detailed rules:

1. `enableDetection === true` and the registry has exactly one legacy provider metadata entry:
   - Create that method entry.
   - Set Detection outcome to matched with evidence source `legacy_migration`. Legacy is only a source within the same fact structure; it does not add a special outcome, top-level field, selection mode, or scheduler path.
   - Point the automatic selection to that method.
   - The scheduler immediately continues the legacy behavior without first requiring V7 discovery. When ordinary selected status, scheduler status-first, or explicit discovery later obtains a strict signal, replace the evidence source in place with `probe`.
2. `enableDetection !== true`:
   - Keep `methodKnowledge.methods` empty.
   - The automatic selection has no method ID.
   - Do not write unsupported. Legacy false does not prove that every new candidate is authoritative unsupported.
   - Do not write `lastFullDiscoveryAt`; migration did not enumerate every candidate.
3. `enableDetection === true` but there is not exactly one legacy provider metadata entry:
   - Do not create a selected method ID.
   - Do not invent an ID from Site Type.
4. Legacy `siteStatus`:
   - Bind it only when a legacy method was mapped successfully.
   - Preserve valid booleans, valid dates, and finite `lastDetectedAt` values.
   - When there is no trustworthy time, retain the legacy observation as stale. Do not present migration time as remote observation time.
5. `customCheckIn`:
   - Preserve the URL, Turnstile configuration, redemption URL, open policy, and local today's status in full.
6. Migration sends no network requests and does not modify `updated_at` or `user_updated_at`.

The hard release invariant is: for the same account, credentials, and global settings, `preMigrationRunnable === postMigrationRunnable`. Every existing provider that can execute before migration must have a stable registration. A missing mapping fails tests or the build instead of silently removing an account from the scheduler. Defaulting automatic execution off for a new Sub2API account applies only to new accounts and must not override a migrated account's legacy `autoCheckInEnabled` intent.

### Stable legacy method IDs

Every existing registration must first declare a stable ID and pure legacy metadata. The implementation-readiness review freezes these exact strings:

- `new-api:daily-checkin`
- `veloera:daily-checkin`
- `anyrouter:daily-checkin`
- `wong-gongyi:daily-checkin`
- `voapi-v2:daily-checkin`

Migration resolves the legacy ID from pure registry metadata. It does not maintain a second mapping table or import a complete provider implementation that depends on account storage, avoiding circular dependencies.

### Version-compatibility boundary

The current main branch writes backup envelope V3 and rejects unknown explicit future versions. Activating account V7 therefore also bumps the backup/WebDAV envelope to V4:

- V7 accepts V1, V2, V3, and V4 inputs and migrates every V6 account before it enters runtime storage.
- Manual export and WebDAV upload emit V4.
- A V3 reader rejects V4 rather than interpreting a V7 account through V6 check-in semantics.
- V7 rejects V5 and later explicit versions until their contracts are implemented.

The first release explicitly does not support V6 and V7 extension versions concurrently writing the same WebDAV file. V4 is a best-effort fail-closed barrier for the immediately preceding V3 reader. Older V2-era readers historically used more tolerant future-version handling, so complete cross-version writer exclusion would require a separate remote minimum-writer-version, CAS/ETag, or writer-lease design. Do not retain legacy runtime fields to simulate downgrade safety.

## 13. Progressive Migration of Existing Providers

All existing providers enter the same registry:

- First add a stable method ID and legacy metadata to each registration.
- A compatibility Adapter's `checkIn` may temporarily delegate to the legacy provider.
- New API, Veloera, WONG, and VoAPI v2 already expose read-only status queries. Reuse the existing implementation in each corresponding Adapter's `getStatus` so account refresh and the registry do not send the same request twice.
- AnyRouter's current status query actually calls `POST /api/user/sign_in`; it must not be used for passive detection, status-first, or reconciliation. Retain its legacy execution contract initially.
- Then migrate detect, status, and execution into the registry one provider at a time. Methods with authoritative readback progressively adopt status-first.
- New capabilities enter only the preferred registry path. Do not implement the same capability once in the legacy provider and again in a new Adapter.

Adopt status-first progressively, after each Adapter has a strict Status parser and request-order tests:

1. New API and Veloera.
   - New API must treat a missing or malformed `stats` payload as unknown instead of implicitly not checked.
   - Veloera may use a boolean `can_check_in` as an authoritative “do not POST” signal, while presenting the exact reason conservatively when the heterogeneous upstream contract does not prove it.
2. WONG.
   - Preserve the distinction among disabled, checked, and malformed/unknown responses.
3. VoAPI v2.
   - Separate GET status from the current POST-then-GET flow so a GET-side 401 recovery cannot replay the POST.
4. AnyRouter remains a compatibility Adapter until a genuine read-only status protocol is verified.

Readback alone does not prove that replay after an uncertain mutation is safe. For the first release, only `sub2api-pro:daily-checkin` has pinned evidence sufficient to allow an authoritative not-checked reconciliation to become `failed + retryable`; the later retry still begins with GET and sends at most one POST that can reach the business handler. New API, Veloera, WONG, and VoAPI v2 do not retry inline or enter ordinary retry after an uncertain result within a live execution. Without a durable dispatch guard or provider-specific idempotency evidence, their legacy compatibility path retains a documented residual risk after an MV3 worker terminates before the uncertain result is persisted. AnyRouter has no read-only reconciliation.

The current `failed → automatic retry` behavior of legacy providers must not masquerade as a certainty-aware contract. Under the new result model, only `failed + retryable` enters ordinary retry; `uncertain` is not replayed. A legacy provider may temporarily preserve its current behavior through a compatibility Adapter while explicitly not promising the same no-replay guarantee, then tighten the contract individually when real status or idempotency evidence supports it.

## 14. UI, Discoverability, and Telemetry

### UI states

- Resolved: show the automatically detected and selected method.
- Ambiguous: when no selection exists, require a one-time choice; when an existing selection remains executable, continue using it and show the other matched candidates.
- Unknown: show a controlled reason and “Rediscover”; do not present it as unsupported.
- Unsupported: show that no known built-in method is available; the custom URL is unaffected.
- Matched + disabled: show that the deployment has disabled the method, retain the automatic selection, and stop execution.
- Status unavailable: keep the matched method selectable and executable, explain that today's check-in state cannot be read automatically, and do not present the method as unsupported.
- Manual stale: retain the user's method ID and show rediscover, choose another method, and restore automatic actions; do not switch silently.
- Uncertain execution: show “Result pending confirmation” from the scheduler result, permit only status verification or authentication repair, and do not enter ordinary retry.

If the implementation adds or moves settings controls, update settings search, target IDs, deep links, all application locales, and focused component tests in the same change.

### Telemetry

Recommendation: `add action + result/summary event`, recording controlled enumerations only:

- Discovery trigger, Decision, and candidate count.
- Selection mode, manual override, and restore automatic.
- Execution outcome, retryability, and reconciliation outcome.
- Identity mismatch and credential persistence category.

Do not record URL, host, method endpoint, account ID, username, token, raw message, or response.

## 15. Validation Strategy for Later Implementation

This design iteration contains no executable code, so no product tests are run. During implementation, validate in risk-based layers:

1. Registry unit tests: duplicate IDs, candidate filtering, Detection/Status separation, Decision aggregation, manual protection, and an existing selection not being revoked by a newly registered or unknown candidate.
2. Configuration migration tests: V6 true/false, legacy evidence, missing `observedAt`, new-account version stamping, V1/V2/V3-to-V4 import/export/WebDAV handling, canonical mutation entry, and exact custom-check-in preservation.
3. Sub2API parser/Adapter tests: strict DTOs, 404/405, 403/409 reason, invalid response, status-first, and failures before and after dispatch.
4. Scheduler tests: status-first, bounded reconciliation of uncertain results, uncertain never entering retry, only `failed + retryable` entering the queue, and GET still occurring first after worker restart.
5. Auth/storage tests: identity mismatch, compare-and-set, rotated token persisted first, persistence failure preventing POST, and lost refresh response.
6. AccountDialog/refresh tests: initial draft discovery, automatic/manual selection, rediscovery, disabled/unknown/ambiguous, settings search, and anchors.

E2E decision: use Vitest or Testing Library for pure aggregation, parsers, migration, and UI states. Risks involving real extension storage, background scheduler or alarms, MV3 worker restart, or cross-entrypoint persistence require one representative Playwright flow. Do not add an E2E state matrix.

## 16. Impact Surface

Later implementation is expected to involve:

- Shared account and scheduler types: `src/types/index.ts`, `src/types/autoCheckin.ts`
- Registry and providers: `src/services/checkin/autoCheckin/providers/**`
- Scheduler, typed retry, uncertain reconciliation, and analytics
- Account auto-detection: `src/services/accounts/autoDetectCompletion/**`
- Account defaults, normalization, configuration migration, raw mutation entry points, import/export, and WebDAV
- Site Adapter completion/refresh compatibility Seam
- Sub2API protocol, auth session, refresh, and resync: `src/services/apiService/sub2api/**`
- Account-side Sub2API auth Adapter: `src/services/accounts/sub2apiAuthSession.ts`
- AccountDialog, account actions and status presentation, settings search and deep links, and locales
- Focused tests for the boundaries above, and possibly one representative background/alarm E2E flow

This changes a shared contract and cannot be implemented by adding only one Sub2API endpoint file. Compatibility Adapters avoid requiring a one-time rewrite of every provider.

## 17. Alternatives and Recommendation

### Option A: Add only a method ID and retain the legacy boolean model

Advantage: Small change.

Disadvantage: Still cannot represent all candidates, unknown, ambiguous, disabled, per-method today's state, or uncertain. Does not satisfy the Issue.

### Option B: Add a second check-in capability registry to Site Adapters

Advantage: Close to existing account completion and refresh.

Disadvantage: Creates two sources of truth alongside the AutoCheckinProvider registry, while the scheduler still requires a bridge. Not recommended.

### Option C: Persist the global discovery Decision

Advantage: Convenient for the UI to read.

Disadvantage: Decision is derivable from method facts, so persistence creates a second derived source of truth. It may conflict with facts after registry rules evolve. Not recommended.

### Option D: Add a `builtIn` wrapper

Advantage: Visually groups registered methods separately from `customCheckIn`.

Disadvantage: `CheckInConfig` already provides the namespace. Removing the wrapper does not leak complexity, and the layer adds no Depth. Not recommended.

### Option E: Hybrid deep Module (recommended)

- The product-level Module Interface provides five user use cases: inspect, discover, setSelection, refreshSelectedStatus, and executeSelected. Each protocol Adapter exposes at most three operations: detect, getStatus, and checkIn.
- Internal Adapters provide stable method IDs and strict detect/status/check-in contracts.
- Account configuration stores only `methodKnowledge.methods`, `lastFullDiscoveryAt`, selection, user execution intent, and the custom URL.
- Decision, stale state, and execution eligibility are derived centrally.
- Scheduler storage independently owns execution results and ordinary retry. The first release relies on verified status-first, idempotency, and reconciliation and does not add a generic operation journal.
- V6 migrates directly at storage entry points into one V7 runtime schema.

This option provides the best balance between a minimal caller Interface, Locality of protocol knowledge, a single persisted source of truth, and progressive provider migration.

## 18. Implementation Plan

Implementation is split into nine independently reviewable local tickets:

1. [Register stable check-in method identities](issues/01-register-stable-checkin-methods.md): stable IDs, pure legacy metadata, and registry validation with no behavior or persistence change.
2. [Build the Check-in domain Module and dormant V7 codec](issues/02-build-checkin-domain-and-v7-codec.md): pure projections, selection transitions, Decision rules, and an inactive migration.
3. [Activate canonical V7 account check-in storage](issues/03-activate-v7-account-checkin-storage.md): one release-level cutover across defaults, storage entrances, runtime consumers, compatibility Module operations, AccountDialog ownership, and backup/WebDAV V4.
4. [Deliver method discovery and selection](issues/04-deliver-method-discovery-and-selection.md): bounded read-only discovery, automatic/manual selection, selected-only status refresh, and recovery controls.
5. [Harden selected execution and retry](issues/05-harden-checkin-execution-and-retry.md): discriminated outcomes, typed retry, progressive status-first, bounded reconciliation, and no generic journal.
6. [Harden Sub2API authentication durability](issues/06-harden-sub2api-auth-durability.md): expected identity, typed persistence, complete resync, and rotated credentials persisted first.
7. [Add the Sub2API Pro daily check-in method](issues/07-add-sub2api-pro-daily-checkin.md): strict protocol parsing, safe discovery, status-first execution, and evidence-backed later retry.
8. [Complete the release experience](issues/08-complete-checkin-release-experience.md): non-happy-path UI, settings discoverability, documentation, telemetry audit, and one representative E2E.
9. [Add bulk check-in capability and status refresh](issues/09-add-bulk-checkin-capability-and-status-refresh.md): one explicit all-account action that refreshes selected status, rediscovers only when needed, and reports partial results without executing check-in or changing user intent.

Every ticket uses the same preferred registry path. Legacy code connects only through compatibility Adapters and migration glue. Ticket 03 may contain multiple reviewable commits, but no release may write V7 while a runtime consumer still understands only V6.

## 19. Decisions Closed During Implementation Readiness

The latest-main review closed the remaining implementation questions:

- Stable IDs are the five exact strings in Section 12. They are persistent format contracts after release.
- Status-first adoption is incremental: New API and Veloera, then WONG, then VoAPI v2 after each strict parser and request-order test is complete. AnyRouter remains the no-readback compatibility exception.
- Lack of Status Readback is not lack of execution support. AnyRouter remains executable through its selected method while ordinary refresh, status-first, and reconciliation avoid its mutating sign-in operation.
- Only Sub2API Pro has pinned first-release evidence that an authoritative not-checked reconciliation may permit a later retry. That retry begins with GET. Other current providers do not retry inline or enter ordinary retry for the uncertain result; their compatibility paths retain the documented cross-worker residual risk until stronger evidence or a separate guard exists.
- A disabled account may run an explicit narrow read-only rediscovery or reconciliation command. It may not run scheduler, retry, or immediate check-in mutations.
- Concurrent V6/V7 writers to the same WebDAV file are unsupported. V7 emits backup envelope V4 as a best-effort fail-closed barrier for V3 readers.

The following architectural decisions remain unchanged:

- Do not use a `builtIn` wrapper.
- Do not retain runtime `enableDetection` or `siteStatus`.
- A uniquely matched but disabled method may still be selected automatically, but it cannot execute.
- Retain a stale manual selection and derive stale state from facts.
- Default automatic execution off for new Sub2API accounts.
- In the first release, an unresolved uncertain result enters read-only reconciliation and never ordinary retry; do not add a generic write-ahead journal.
- Do not persist a bare reward amount or implement a capability fingerprint in the first release.

## 20. Architecture Review Conclusion

Across two rounds, six independent agents reviewed the requirement journey, account storage, migration compatibility, Module depth, and execution safety. The final design converged on user requirements rather than theoretical state completeness:

- `automaticExecutionEnabled + methodKnowledge + selection + customCheckIn` is the minimum complete skeleton.
- Detection and Status must remain separate.
- Decision, selection staleness, and execution eligibility must be derived.
- Decision is used only to create a new selection. A newly registered method or an unrelated unknown or ambiguous candidate does not revoke an existing selection that remains executable.
- Selection revision and discovery generation are not first-release requirements. Correct field ownership and locked re-read of identity, mode, and method are sufficient to protect the user's selection.
- Direct V7 migration is feasible. Legacy is only an ordinary Detection evidence source, and runnable behavior must remain equivalent before and after migration.
- Four existing providers have reusable read-only status queries. AnyRouter is the explicit exception without authoritative readback.
- Sub2API Pro's server-side daily uniqueness, transaction, duplicate 409 behavior, status-first, and bounded reconciliation satisfy the first-release no-blind-replay requirement. A generic operation journal is deferred until a real non-idempotent protocol requires it.
- The latest-main review found one semantic integration requirement rather than a design conflict: backup/WebDAV has moved to V3 with explicit future-version rejection, so V7 activates backup envelope V4 and an explicit unsupported old/new concurrent-writer boundary.
- With these decisions, the current proposal passes requirements and architecture review and has an actionable English implementation plan.

The design branch was refreshed onto `origin/main` at `1c6f72543c8feb12a8562eb15199969656045979`. The additional #1280 change only decouples real-site E2E account saves from model probes and does not change this design's product contracts. Fetch and re-check the base again immediately before product implementation if main advances further.
