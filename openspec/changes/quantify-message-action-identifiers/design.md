## Context

The extension uses `browser.runtime` messaging across multiple contexts (background/service worker, popup/options UI, and content scripts). Message routing is primarily driven by a string field `request.action`:

- `entrypoints/background/runtimeMessages.ts` performs many direct `request.action === "<string>"` checks and several `request.action.startsWith("<prefix>")` prefix routes.
- Some features define a small set of action constants (`constants/runtimeActions.ts` exports `RuntimeActionIds`), but most actions and prefixes are still inline “magic strings”.

This creates a cross-cutting maintenance risk: action names are a contract between senders and receivers, yet they are not centrally defined or type-checked. Prefix conventions are also inconsistent across features (e.g., mixed `foo:bar` namespaced actions and legacy un-namespaced action strings).

## Goals / Non-Goals

**Goals:**
- Establish a single, canonical registry for runtime message action IDs and action prefixes, with TypeScript literal types for autocomplete and safe refactors.
- Ensure both full action IDs and prefix checks are expressed via shared constants/helpers (no scattered magic strings).
- Preserve existing on-the-wire action string values (no behavioral change; compatibility across extension contexts).
- Make it hard to accidentally introduce new inline action strings by providing a clear, reusable API and targeted tests.

**Non-Goals:**
- Redesigning the overall runtime messaging architecture (e.g., introducing a full message bus, new dependency, or framework-level dispatcher).
- Changing message payload shapes or introducing a complete request/response type map for every message in this change.
- Renaming or deprecating existing action values on the wire (future cleanup can be considered separately).

## Decisions

1) **Centralize action IDs and prefixes in `constants/runtimeActions.ts` (expand the existing module).**
   - Add `RuntimeActionPrefixes` (feature namespace prefixes) and keep/expand `RuntimeActionIds` (full action identifiers).
   - Export literal union types:
     - `RuntimeActionPrefix = (typeof RuntimeActionPrefixes)[keyof ...]`
     - `RuntimeActionId = (typeof RuntimeActionIds)[keyof ...]`
   - Rationale: the project already uses the `as const` + `Object.values(...)` pattern elsewhere; this minimizes churn because `RuntimeActionIds` is already imported by features/tests.
   - Alternative considered: per-feature action constant files; rejected because it reintroduces duplication and makes cross-cutting routing harder to audit.

2) **Quantify prefixes and composition via small helpers rather than ad-hoc string concatenation.**
   - Introduce helpers (names indicative; exact names to be finalized during implementation):
     - `composeRuntimeAction(prefix, suffix)` to build `${prefix}${suffix}` consistently (and avoid missing delimiters when prefixes are required to include `:`).
     - `hasRuntimeActionPrefix(action, prefix)` as the shared, null-safe prefix matcher for router code.
   - Rationale: keeps call sites uniform and reviewable; reduces subtle mistakes like missing `:` or inconsistent `startsWith` handling.
   - Alternative considered: only constants (no helpers); rejected because router code would still repeat `action && action.startsWith(prefix)` patterns.

3) **Migrate routing and call sites without changing action strings.**
   - Background router (`setupRuntimeMessageListeners`) will switch from inline strings to:
     - `request.action === RuntimeActionIds.<X>` for exact matches.
     - `hasRuntimeActionPrefix(request.action, RuntimeActionPrefixes.<Y>)` for prefix routes.
   - For legacy groups that don’t share a strict prefix convention (e.g., auto-refresh’s mix of `autoRefresh*` and `setupAutoRefresh` style names), define explicit `RuntimeActionIds` entries and a small matcher helper (e.g., `isAutoRefreshRuntimeAction(action)`) so the router stays readable and still avoids inline strings.
   - Rationale: compatibility first; ensures senders/receivers stay aligned during refactor.
   - Alternative considered: rename all actions into a strict `<namespace>:<verb>` scheme now; rejected because it increases scope and risk (and would be an on-the-wire contract change).

4) **Add tests that protect the registry and helpers as the “source of truth”.**
   - Add unit tests for `constants/runtimeActions.ts` to ensure:
     - all `RuntimeActionIds` values are unique (prevents accidental aliasing),
     - prefix helpers behave correctly (null/undefined safe; correct matching),
     - composed IDs match expected wire values for key features (spot-check).
   - Update existing tests that currently assert `sendRuntimeMessage({ action: "<string>" })` to reference `RuntimeActionIds.<X>` instead.
   - Rationale: tests provide guardrails without requiring a large typing overhaul of all message payloads.

## Risks / Trade-offs

- **Risk: Partial migration leaves a mix of constants and inline strings** → Mitigation: update the background router first (largest hub), then migrate feature senders/handlers; add tests + review checklist for new actions.
- **Risk: Legacy naming schemes remain inconsistent** → Mitigation: keep wire values stable now, but model them consistently in the registry; optionally add a follow-up change to standardize naming once coverage is in place.
- **Risk: Missed action constants during refactor** → Mitigation: enumerate actions by auditing `startsWith("...")` and `action: "<...>"` patterns; update tests that cover message-driven flows.

## Migration Plan

1) Expand `constants/runtimeActions.ts` to include:
   - `RuntimeActionPrefixes`
   - an expanded `RuntimeActionIds` (including currently-inline actions)
   - helper(s) for composing and matching actions
2) Update `entrypoints/background/runtimeMessages.ts` to remove inline action string checks and use the registry/helpers.
3) Migrate feature handlers and senders incrementally (external check-in, auto-checkin, webdav auto-sync, model sync, redemption assist, etc.) to use `RuntimeActionIds` and `RuntimeActionPrefixes`.
4) Update and add tests:
   - registry/helper unit tests
   - adjust existing component/service tests to reference constants

Rollback strategy: revert the refactor commits; since wire values are preserved and no storage/schema changes are introduced, rollback is low-risk.

## Current Action Inventory (wire values)

This is the deduped set of runtime message `action` strings and routing prefixes currently used in the repo. These values are considered on-the-wire contracts and MUST NOT be renamed during this change.

### Prefix-routed actions

- `externalCheckIn:`
- `webdavAutoSync:`
- `modelSync:`
- `autoCheckin:`
- `redemptionAssist:`
- `channelConfig:`
- `usageHistory:`
- `autoRefresh` (legacy group; matches a non-namespaced prefix)

### Exact-match actions

- `accountDialog:importCookieAuthSessionCookie`
- `autoCheckin:debugResetLastDailyRunDay`
- `autoCheckin:debugScheduleDailyAlarmForToday`
- `autoCheckin:debugTriggerDailyAlarmNow`
- `autoCheckin:debugTriggerRetryAlarmNow`
- `autoCheckin:getAccountInfo`
- `autoCheckin:getStatus`
- `autoCheckin:pretriggerDailyOnUiOpen`
- `autoCheckin:retryAccount`
- `autoCheckin:runNow`
- `autoCheckin:updateSettings`
- `autoCheckinPretrigger:started`
- `autoDetectSite`
- `channelConfig:get`
- `channelConfig:upsertFilters`
- `checkCloudflareGuard`
- `closeTempWindow`
- `cloudflareGuardLog`
- `cookieInterceptor:trackUrl`
- `externalCheckIn:openAndMark`
- `getAutoRefreshStatus`
- `getLocalStorage`
- `getRenderedTitle`
- `getUserFromLocalStorage`
- `modelSync:getChannelUpstreamModelOptions`
- `modelSync:getLastExecution`
- `modelSync:getNextRun`
- `modelSync:getPreferences`
- `modelSync:getProgress`
- `modelSync:listChannels`
- `modelSync:triggerAll`
- `modelSync:triggerFailedOnly`
- `modelSync:triggerSelected`
- `modelSync:updateSettings`
- `openSettings:checkinRedeem`
- `openSettings:shieldBypass`
- `openTempWindow`
- `performTempWindowFetch`
- `permissions:check`
- `preferences:updateActionClickBehavior`
- `redemptionAssist:autoRedeem`
- `redemptionAssist:autoRedeemByUrl`
- `redemptionAssist:contextMenuTrigger`
- `redemptionAssist:shouldPrompt`
- `redemptionAssist:updateSettings`
- `refreshNow`
- `setupAutoRefresh`
- `showShieldBypassUi`
- `stopAutoRefresh`
- `tempWindowFetch`
- `tempWindowGetRenderedTitle`
- `updateAutoRefreshSettings`
- `usageHistory:prune`
- `usageHistory:syncNow`
- `usageHistory:updateSettings`
- `waitAndGetUserInfo`
- `webdavAutoSync:getStatus`
- `webdavAutoSync:setup`
- `webdavAutoSync:stop`
- `webdavAutoSync:syncNow`
- `webdavAutoSync:updateSettings`

### Notes

- Auto-refresh currently uses a mixed router: a loose prefix match (`action.startsWith("autoRefresh")`) plus a hardcoded allow-list of legacy non-namespaced actions (`setupAutoRefresh`, `refreshNow`, `stopAutoRefresh`, `updateAutoRefreshSettings`, `getAutoRefreshStatus`). This group cannot be represented as a single strict `foo:` prefix and will be expressed via a dedicated matcher helper so router code contains no magic strings.
- Tests intentionally use sentinel unknown values (e.g., `unknownAction`, `unknown`) to exercise the unknown/missing action branches; these are not shipped wire contracts.
- Canonical mappings are defined in `constants/runtimeActions.ts` via `RuntimeActionIds` and `RuntimeActionPrefixes`. All call sites should reference these symbols so on-the-wire values remain unchanged.

## Resolved Questions

- **Yes**: Introduce a follow-up capability/change to standardize legacy action names into a strict `<namespace>:<verb>` format while continuing to accept existing action names as aliases for backward compatibility.
- **Yes**: Add a typed `sendRuntimeActionMessage()` wrapper (typed to `RuntimeActionId`) to discourage ad-hoc action strings without breaking generic messaging.
