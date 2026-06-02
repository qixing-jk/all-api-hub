# Typed Runtime Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace request/response browser runtime `{ action }` messages with `@webext-core/messaging` typed `sendMessage(type, data)` / `onMessage(type, handler)` calls.

**Architecture:** Use one typed protocol map per feature domain, colocated with the existing background service or runtime client for that domain. Do not keep legacy `{ action }` compatibility for migrated request/response runtime messages. Leave tab-scoped content-script messages and best-effort broadcast/update messages out of this migration.

**Tech Stack:** WXT, WebExtension runtime messaging, `@webext-core/messaging`, TypeScript, Vitest, Playwright E2E for browser-level runtime paths.

---

## Scope

Migrate request/response messages currently routed through `src/entrypoints/background/runtimeMessages.ts` when they are extension-wide runtime RPC calls.

Do not migrate in this plan:

- Content/tab messages sent with `browser.tabs.sendMessage` or `sendTabMessageWithRetry`, including `ContentGetUserFromLocalStorage`, `ContentPerformTempWindowFetch`, `ContentWaitForTurnstileToken`, protection guard checks, and context-menu triggers delivered to content scripts.
- Broadcast/update messages such as `RuntimeMessageTypes.AccountKeyRepairProgress`, `TAG_STORE_UPDATE`, `AutoCheckinRunCompleted`, and model-sync progress fanout.
- The raw WebExtension retry helpers needed by tab/content messaging.

## File Structure

- Create `src/services/runtimeMessaging/logger.ts`
  - Adapts `@webext-core/messaging` logger calls to `createLogger`.
- Create `src/services/runtimeMessaging/result.ts`
  - Shared `RuntimeMessageSuccess<T>`, `RuntimeMessageFailure`, `RuntimeMessageResponse<T>` types and response parsing helpers.
- Modify `src/services/updates/messaging.ts`
  - Use shared logger adapter and literal release-update message type strings, not `RuntimeActionIds`.
- Modify `src/services/updates/runtime.ts`
  - Keep typed sender usage; remove dependencies on action constants.
- Modify `src/services/updates/releaseUpdateService.ts`
  - Remove legacy `handleReleaseUpdateMessage`.
- Modify `src/entrypoints/background/runtimeMessages.ts`
  - Remove release-update legacy route and import only typed listener setup.
- Add or modify one `messaging.ts` per migrated domain:
  - `src/services/accounts/autoRefreshMessaging.ts`
  - `src/services/checkin/autoCheckin/messaging.ts`
  - `src/services/webdav/webdavAutoSyncMessaging.ts`
  - `src/services/models/modelSync/messaging.ts`
  - `src/services/accounts/accountKeyAutoProvisioning/messaging.ts`
  - `src/services/verification/webAiApiCheck/messaging.ts`
  - `src/services/redemption/redemptionAssistMessaging.ts`
  - `src/services/siteAnnouncements/messaging.ts`
  - `src/services/history/usageHistory/messaging.ts`
  - `src/services/history/dailyBalanceHistory/messaging.ts`
  - `src/services/managedSites/channelConfigMessaging.ts`
  - `src/services/checkin/externalCheckInMessaging.ts`
  - `src/services/integrations/ldohSiteLookup/messaging.ts`
  - `src/services/notifications/taskNotificationMessaging.ts`
  - `src/services/productAnalytics/messaging.ts`
- After all callers migrate, prune request/response entries from `src/constants/runtimeActions.ts`; keep content/tab and broadcast/event constants.

## Task 1: Runtime Messaging Foundation

**Files:**

- Create: `src/services/runtimeMessaging/logger.ts`
- Create: `src/services/runtimeMessaging/result.ts`
- Modify: `src/services/updates/messaging.ts`
- Modify: `src/services/updates/runtime.ts`
- Modify: `src/services/updates/releaseUpdateService.ts`
- Modify: `src/entrypoints/background/runtimeMessages.ts`
- Test: `tests/services/updates/runtime.test.ts`
- Test: `tests/services/updates/releaseUpdateService.test.ts`
- Test: `tests/entrypoints/background/runtimeMessages.more.test.ts`

- [ ] **Step 1: Add shared logger adapter**

Create `src/services/runtimeMessaging/logger.ts`:

```ts
import type { Logger } from "@webext-core/messaging"

import { createLogger } from "~/utils/core/logger"

function toLogMessage(value: unknown): string {
  return typeof value === "string" ? value : String(value)
}

export function createRuntimeMessagingLogger(scope: string): Logger {
  const logger = createLogger(scope)

  return {
    debug: (message: unknown, ...details: unknown[]) => {
      logger.debug(toLogMessage(message), details.length ? details : undefined)
    },
    log: (message: unknown, ...details: unknown[]) => {
      logger.info(toLogMessage(message), details.length ? details : undefined)
    },
    warn: (message: unknown, ...details: unknown[]) => {
      logger.warn(toLogMessage(message), details.length ? details : undefined)
    },
    error: (message: unknown, ...details: unknown[]) => {
      logger.error(toLogMessage(message), details.length ? details : undefined)
    },
  }
}
```

- [ ] **Step 2: Add shared runtime result types**

Create `src/services/runtimeMessaging/result.ts`:

```ts
export type RuntimeMessageSuccess<T> = {
  success: true
  data: T
}

export type RuntimeMessageFailure = {
  success: false
  error: string
}

export type RuntimeMessageResponse<T> =
  | RuntimeMessageSuccess<T>
  | RuntimeMessageFailure

export function createRuntimeMessageFailure(
  error: string,
): RuntimeMessageFailure {
  return { success: false, error }
}
```

- [ ] **Step 3: Remove release-update action compatibility**

Update `src/services/updates/messaging.ts` so `ReleaseUpdateMessageTypes` owns literal strings:

```ts
export const ReleaseUpdateMessageTypes = {
  GetStatus: "releaseUpdate:getStatus",
  CheckNow: "releaseUpdate:checkNow",
} as const
```

Use `createRuntimeMessagingLogger("ReleaseUpdateMessaging")` instead of a local logger adapter.

- [ ] **Step 4: Remove legacy release-update route**

Delete `handleReleaseUpdateMessage` from `src/services/updates/releaseUpdateService.ts`. Keep `setupReleaseUpdateMessagingListeners()` and the shared response resolver.

Delete the `RuntimeActionPrefixes.ReleaseUpdate` route from `src/entrypoints/background/runtimeMessages.ts`.

- [ ] **Step 5: Verify release-update typed-only behavior**

Run:

```bash
pnpm vitest --run tests/services/updates/runtime.test.ts tests/services/updates/releaseUpdateService.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts
pnpm compile
```

Expected: all listed tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/services/runtimeMessaging/logger.ts src/services/runtimeMessaging/result.ts src/services/updates/messaging.ts src/services/updates/runtime.ts src/services/updates/releaseUpdateService.ts src/entrypoints/background/runtimeMessages.ts tests/services/updates/runtime.test.ts tests/services/updates/releaseUpdateService.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts
git commit -m "refactor(runtime): make release update messaging typed-only"
```

## Task 2: Low-Risk Single-Purpose Domains

**Files:**

- Create/modify messaging modules for `LdohSiteLookup`, `TaskNotifications`, `ChannelConfig`, `ExternalCheckIn`, `CookieInterceptor`, `OpenSettings`, `Feedback`, `Permissions`, and `Preferences`.
- Modify their direct callers to use `sendMessage(type, data)`.
- Modify `src/entrypoints/background/runtimeMessages.ts` to register typed listeners and remove migrated branches.
- Tests: focused tests for each migrated domain plus `tests/entrypoints/background/runtimeMessages.more.test.ts`.

- [ ] **Step 1: Migrate one domain at a time**

For each domain, use this pattern:

```ts
import { defineExtensionMessaging } from "@webext-core/messaging"

import { createRuntimeMessagingLogger } from "~/services/runtimeMessaging/logger"

export const DomainMessageTypes = {
  Operation: "domain:operation",
} as const

interface DomainProtocolMap {
  [DomainMessageTypes.Operation](data: DomainRequest): DomainResponse
}

export const {
  sendMessage: sendDomainMessage,
  onMessage: onDomainMessage,
} = defineExtensionMessaging<DomainProtocolMap>({
  logger: createRuntimeMessagingLogger("DomainMessaging"),
})
```

- [ ] **Step 2: Convert callers**

Replace:

```ts
sendRuntimeMessage({
  action: RuntimeActionIds.DomainOperation,
  value,
})
```

with:

```ts
sendDomainMessage(DomainMessageTypes.Operation, { value })
```

- [ ] **Step 3: Convert background handlers**

Replace central route branches with setup functions:

```ts
export function setupDomainMessagingListeners() {
  onDomainMessage(DomainMessageTypes.Operation, async ({ data }) => {
    return await performDomainOperation(data)
  })
}
```

- [ ] **Step 4: Verify low-risk domains**

Run:

```bash
pnpm vitest --run tests/entrypoints/background/runtimeMessages.more.test.ts tests/services/ldohSiteLookup.runtime.test.ts tests/features/ManagedSiteChannels/utils/channelFilters.test.ts tests/components/AutoCheckinUiOpenPretrigger.test.tsx
pnpm compile
```

Expected: all listed tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "refactor(runtime): migrate simple runtime messages to typed protocols"
```

## Task 3: Scheduler and Settings Domains

**Files:**

- Migrate `autoRefresh`, `webdavAutoSync`, `usageHistory`, `dailyBalanceHistory`, `siteAnnouncements`, and preference update request/response messages.
- Modify UI callers in `UserPreferencesContext`, settings tabs, and feature pages.
- Keep broadcast/update events out of this task.

- [ ] **Step 1: Define per-domain protocol maps**

Each scheduler domain gets a typed message module with request/response methods named after the existing operation:

```ts
export const UsageHistoryMessageTypes = {
  UpdateSettings: "usageHistory:updateSettings",
  SyncNow: "usageHistory:syncNow",
  Prune: "usageHistory:prune",
} as const
```

- [ ] **Step 2: Refactor handlers to return responses**

Convert `handleXMessage(request, sendResponse)` to operation functions that accept typed data and return the existing response object.

- [ ] **Step 3: Convert UI callers**

Replace all `{ action: RuntimeActionIds.X }` payloads for migrated scheduler/settings domains with `sendXMessage(XMessageTypes.Operation, data)`.

- [ ] **Step 4: Verify scheduler/settings domains**

Run:

```bash
pnpm vitest --run tests/contexts/UserPreferencesContext.test.tsx tests/entrypoints/options/UsageHistorySyncTab.test.tsx tests/entrypoints/options/SiteAnnouncementsPage.test.tsx tests/components/AutoCheckinUiOpenPretrigger.test.tsx
pnpm compile
```

Expected: all listed tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "refactor(runtime): migrate scheduler settings messages"
```

## Task 4: High-Use Feature Domains

**Files:**

- Migrate `modelSync`, `accountKeyRepair` request/response operations, `webAiApiCheck`, `redemptionAssist`, `autoCheckin`, and `productAnalytics`.
- Keep progress broadcasts, content-script context menu triggers, and content tab messages unchanged.

- [ ] **Step 1: Migrate request/response operations only**

For each high-use domain, define typed request/response methods for existing RPC operations. Do not migrate broadcast progress messages in this task.

- [ ] **Step 2: Convert feature callers**

Update feature components and services to call the typed sender:

```ts
const response = await sendModelSyncMessage(
  ModelSyncMessageTypes.GetProgress,
)
```

- [ ] **Step 3: Convert background setup**

Register typed listeners through domain setup functions imported by `runtimeMessages.ts` or a new `typedRuntimeMessages.ts` aggregator.

- [ ] **Step 4: Verify high-use domains**

Run:

```bash
pnpm vitest --run tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyManagement.emptyStateActions.test.tsx tests/entrypoints/options/pages/KeyManagement/KeyManagement.managedSiteStatusSupport.test.tsx tests/features/ManagedSiteModelSync/ManagedSiteModelSync.test.tsx tests/components/ApiCheckModalHost.test.tsx tests/entrypoints/content/redemptionAssist/index.test.ts tests/entrypoints/content/webAiApiCheck/index.test.ts
pnpm compile
```

Expected: all listed tests pass and TypeScript exits 0.

- [ ] **Step 5: Commit**

```bash
git add src tests
git commit -m "refactor(runtime): migrate feature runtime requests"
```

## Task 5: Constants and Legacy Runtime Cleanup

**Files:**

- Modify: `src/constants/runtimeActions.ts`
- Modify: `src/utils/browser/browserApi.ts`
- Modify: `tests/utils/browserApi.test.ts`
- Modify: `tests/utils/runtimeActions.test.ts`
- Modify: E2E specs using raw runtime action payloads.

- [ ] **Step 1: Prune migrated request/response constants**

Remove request/response runtime action entries that now live in domain `MessageTypes`.

Keep:

- `RuntimeMessageTypes` broadcast constants.
- Content/tab message constants.
- Any runtime event constants that are intentionally not request/response RPC.

- [ ] **Step 2: Remove unused helper surface**

If no callers remain, remove `sendRuntimeActionMessage` from `src/utils/browser/browserApi.ts`. Keep `sendRuntimeMessage` only if broadcast/event callers still need it. Keep `sendTabMessageWithRetry`.

- [ ] **Step 3: Rewrite E2E helpers**

Update runtime request E2E specs to call typed protocol helpers instead of raw `{ action }` payloads. Keep `tabs.sendMessage` E2E probes unchanged.

- [ ] **Step 4: Verify cleanup**

Run:

```bash
pnpm vitest --run tests/utils/browserApi.test.ts tests/utils/runtimeActions.test.ts tests/entrypoints/background/runtimeMessages.test.ts tests/entrypoints/background/runtimeMessages.more.test.ts
pnpm run validate:push
```

Expected: all listed tests pass, TypeScript exits 0, and knip reports no unused exports.

- [ ] **Step 5: Commit**

```bash
git add src tests e2e
git commit -m "refactor(runtime): remove legacy action rpc surface"
```

## Final Validation

- [ ] Run focused Vitest groups from all tasks.
- [ ] Run `pnpm compile`.
- [ ] Run `pnpm run validate:push`.
- [ ] Stage task-scoped changes and run `pnpm run validate:staged`.
- [ ] Run targeted E2E only if browser-level runtime behavior changed in a way unit tests cannot cover.

