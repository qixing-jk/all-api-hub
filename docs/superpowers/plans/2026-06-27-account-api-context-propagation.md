# Account API Context Propagation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Propagate prepared Account API context from the highest reliable workflow boundary so downstream protocol, adapter, and common service code no longer relies on hidden account-storage lookup.

**Architecture:** Keep the existing accounts-owned context builders as the source of truth: immediate UI actions build from a display account snapshot, long-lived work resolves by stable `accountId`, and account-owned flows that already hold `SiteAccount` build directly from that stored account. First replace hand-built stored-account requests in scheduler/background services, then move token lifecycle and repair orchestration to pass prepared `AccountApiContext`/`ApiServiceRequest` downward, and only then shrink `resolveLegacyAccountAwareRequest(...)` to an explicit compatibility path.

**Tech Stack:** TypeScript, Vitest, WXT extension services, account API context builders, site adapter capabilities, pnpm.

**Spec:** `docs/superpowers/specs/2026-06-26-account-api-context-display-data-design.md`

---

## File Structure

Already exists and should be reused:

- `src/services/accounts/utils/apiServiceRequest.ts`
  - Exports `DisplayAccountApiSnapshot`, `AccountApiContext`, `DisplayAccountApiCapabilityContext`, `createDisplayAccountRequestContext(...)`, `createDisplayAccountApiContext(...)`, `createAccountApiRequestFromStoredAccount(...)`, and `resolveStoredAccountApiContext(...)`.
  - Do not add another request-context module unless this file becomes too large for the focused changes below.
- `src/services/accounts/utils/legacyAccountAwareRequest.ts`
  - Keep as the legacy `baseUrl + userId` compatibility helper.

Modify in the implementation slice:

- `src/services/accounts/defaultTokenLifecycle/lifecycle.ts`
  - Add prepared-context entry points for token lifecycle work.
  - Keep display-snapshot wrappers for immediate UI compatibility.
- `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
  - Make post-save automation accept/pass `accountId` or already-prepared stored context at the workflow boundary.
  - Keep the old display-snapshot inventory wrapper only as a compatibility wrapper.
- `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
  - Let background auto-provision use `SiteAccount`/stored account context directly instead of requiring `DisplaySiteData`.
- `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
  - Keep the existing `SiteAccount` request source and stop using `DisplaySiteData` for request construction.
- `src/services/accounts/accountKeyAutoProvisioning/repair.ts`
  - Treat repair as a background workflow: pass account ids/stored accounts through the runner and only use display data for names/results.
- `src/services/accounts/accountOperations.ts`
  - Update `autoProvisionKeyOnAccountAdd(...)` to use stored-account context where the workflow has already crossed a tick/storage boundary.
  - Keep shared UI/managed-site `ensureAccountApiToken(...)` as a display-snapshot compatibility wrapper until its callers are audited.
  - Keep quick-create resolution as a display-snapshot UI path.
- `src/services/siteAnnouncements/scheduler.ts`
  - Replace private `createApiRequestFromAccount(...)` with `createAccountApiRequestFromStoredAccount(account).request`.
  - Keep scheduler inputs as `accountIds`; resolve stored accounts once at the scheduler/manual-check boundary.
- `src/services/history/usageHistory/sync.ts`
  - Replace private `buildApiRequestForAccount(...)` with `createAccountApiRequestFromStoredAccount(account).request`.
- `src/services/redemption/redeemService.ts`
  - Use `createAccountApiRequestFromStoredAccount(account).request` for redemption requests after resolving `accountId` to `SiteAccount`.
- `src/services/apiService/common/utils.ts`
  - After the migrated account-owned workflows no longer depend on fallback, convert `fetchApi(...)` and `fetchApiData(...)` to transport pass-through.
  - Leave `resolveLegacyAccountAwareRequest(...)` callable only from explicit compatibility tests/helpers.

Focused tests to update:

- `tests/services/accounts/apiServiceRequest.test.ts`
- `tests/services/accounts/defaultTokenLifecycle.test.ts`
- `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`
- `tests/services/accountOperations.ensureAccountApiToken.test.ts`
- `tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts`
- `tests/services/accountKeyRepair.test.ts`
- `tests/services/accountKeyGroupCoverage.test.ts`
- `tests/services/siteAnnouncements/scheduler.test.ts`
- `tests/services/usageHistory/sync.test.ts`
- `tests/services/redeemService.test.ts`
- `tests/services/apiService/common/utils.test.ts`
- `tests/services/accounts/legacyAccountAwareRequest.test.ts`

Do not modify:

- `src/types/index.ts`
  - Do not rename or delete `DisplaySiteData` fields in this slice.
- `src/services/apiAdapters/**`
  - Adapter capabilities already accept prepared `ApiServiceRequest`; do not widen them to `DisplaySiteData`.
- `src/services/apiTransport/**`
  - Transport should remain unaware of account storage and display snapshots.
- `src/services/apiService/common/index.ts` account-data behavior unless a migrated caller test proves it still depends on hidden fallback.
- App locale files, settings search definitions, telemetry schemas, or Playwright E2E tests.

Telemetry decision: none. This is internal request-context propagation with no new user action, setting, or visible state.

Settings search decision: none. No settings UI, anchors, search targets, or deep links change.

E2E decision: no new Playwright E2E. The primary risk is request-source selection and storage lookup ownership; focused Vitest tests are the right layer.

---

### Task 1: Replace Stored-Account Request Builders

**Files:**

- Modify: `src/services/siteAnnouncements/scheduler.ts`
- Modify: `src/services/history/usageHistory/sync.ts`
- Modify: `src/services/redemption/redeemService.ts`
- Test: `tests/services/siteAnnouncements/scheduler.test.ts`
- Test: `tests/services/usageHistory/sync.test.ts`
- Test: `tests/services/redeemService.test.ts`

- [ ] **Step 1: Add a failing scheduler test for stored context decoration**

In `tests/services/siteAnnouncements/scheduler.test.ts`, update the account-storage mock so no display account lookup is needed:

```ts
vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getEnabledAccounts: getEnabledAccountsMock,
    getAccountById: getAccountByIdMock,
  },
}))
```

Add this test under `describe("siteAnnouncementScheduler", () => { ... })`:

```ts
  it("uses the stored-account API context for provider requests", async () => {
    providerFetchMock.mockResolvedValue({
      providerId: SITE_ANNOUNCEMENT_PROVIDER_IDS.Sub2Api,
      siteKey: "sub2api:sub-1:https://sub.example.com",
      status: "success",
      announcements: [],
    })
    const account = createAccount({
      id: "sub-1",
      site_type: "sub2api",
      site_url: "https://sub.example.com",
      authType: AuthTypeEnum.Cookie,
      account_info: {
        id: "stored-user",
        access_token: "stored-access-token",
        username: "stored-user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
      cookieAuth: { sessionCookie: "stored-session-cookie" },
      sub2apiAuth: {
        refreshToken: "stored-refresh-token",
        tokenExpiresAt: 123456,
      },
    })
    getEnabledAccountsMock.mockResolvedValue([account])

    const response = await resolveSiteAnnouncementsCheckNowMessage({})

    expect(response).toMatchObject({ success: true })
    expect(providerFetchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiRequest: expect.objectContaining({
          baseUrl: "https://sub.example.com",
          accountId: "sub-1",
          auth: expect.objectContaining({
            authType: AuthTypeEnum.Cookie,
            userId: "stored-user",
            accessToken: "stored-access-token",
            cookie: "stored-session-cookie",
          }),
          sub2apiAuthSession: expect.any(Object),
        }),
      }),
    )
  })
```

- [ ] **Step 2: Run the scheduler test and verify it fails**

Run:

```powershell
pnpm vitest --run tests/services/siteAnnouncements/scheduler.test.ts
```

Expected: FAIL because `scheduler.ts` still manually builds the request and does not attach the Sub2API auth-session port from the stored context builder.

- [ ] **Step 3: Replace manual request construction in site announcements**

In `src/services/siteAnnouncements/scheduler.ts`, remove:

```ts
import type { ApiServiceRequest } from "~/services/apiService/common/type"
```

Add:

```ts
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
```

Delete the private `createApiRequestFromAccount(...)` helper.

Change `createProviderRequest(...)`:

```ts
function createProviderRequest(
  account: SiteAccount,
  provider: SiteAnnouncementProvider,
): SiteAnnouncementProviderRequest {
  return {
    accountId: account.id,
    siteName: account.site_name,
    siteType: account.site_type,
    baseUrl: account.site_url,
    providerId: provider.id,
    apiRequest: createAccountApiRequestFromStoredAccount(account).request,
  }
}
```

- [ ] **Step 4: Replace manual request construction in usage-history sync**

In `src/services/history/usageHistory/sync.ts`, remove `type ApiServiceRequest` from the common type import and add:

```ts
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
```

Delete the private `buildApiRequestForAccount(...)` helper.

Change:

```ts
  const apiRequest = buildApiRequestForAccount(account)
```

to:

```ts
  const apiRequest = createAccountApiRequestFromStoredAccount(account)
    .request as ApiServiceRequest
```

The cast is acceptable only if TypeScript cannot infer the `Sub2ApiAuthSessionRequest` extension as assignable to `ApiServiceRequest`; do not keep the cast if `tsc` accepts the expression without it.

- [ ] **Step 5: Replace manual request construction in redemption**

In `src/services/redemption/redeemService.ts`, add:

```ts
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
```

Change:

```ts
      const creditedAmount = await redemption.redeem({
        request: {
          baseUrl: account.site_url,
          accountId,
          auth: {
            authType: account.authType,
            userId: account.account_info.id,
            accessToken: account.account_info.access_token,
            cookie: account.cookieAuth?.sessionCookie,
          },
        },
        code,
      })
```

to:

```ts
      const creditedAmount = await redemption.redeem({
        request: createAccountApiRequestFromStoredAccount(account).request,
        code,
      })
```

- [ ] **Step 6: Run focused tests and related checks**

Run:

```powershell
pnpm vitest --run tests/services/siteAnnouncements/scheduler.test.ts
pnpm vitest --run tests/services/usageHistory/sync.test.ts tests/services/redeemService.test.ts
pnpm compile
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

Run:

```powershell
git status --porcelain
git add src/services/siteAnnouncements/scheduler.ts src/services/history/usageHistory/sync.ts src/services/redemption/redeemService.ts tests/services/siteAnnouncements/scheduler.test.ts tests/services/usageHistory/sync.test.ts tests/services/redeemService.test.ts
git commit -m "refactor(accounts): reuse stored api request context"
```

Expected: commit succeeds. If hooks modify files, inspect `git status --porcelain` and `git diff --cached` before retrying.

---

### Task 2: Add Prepared Token Lifecycle APIs

**Files:**

- Modify: `src/services/accounts/defaultTokenLifecycle/lifecycle.ts`
- Test: `tests/services/accounts/defaultTokenLifecycle.test.ts`

- [ ] **Step 1: Add failing tests for request-source ownership**

In `tests/services/accounts/defaultTokenLifecycle.test.ts`, update the import from `~/services/accounts/defaultTokenLifecycle`:

```ts
import {
  buildGroupDefaultTokenRequest,
  createDefaultTokenFromDecision,
  DEFAULT_TOKEN_INVENTORY_STATE_KINDS,
  DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS,
  DEFAULT_TOKEN_LIFECYCLE_ERRORS,
  DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS,
  ensureDefaultTokenLifecycle,
  ensureDefaultTokenLifecycleWithContext,
  generateDefaultTokenRequest,
  inspectDefaultTokenInventory,
  inspectDefaultTokenInventoryWithContext,
  resolveDefaultTokenLifecycleDecision,
  resolveDefaultTokenLifecycleDecisionWithContext,
  selectSingleNewApiTokenByIdDiff,
} from "~/services/accounts/defaultTokenLifecycle"
```

Add this type import:

```ts
import type { AccountApiContext } from "~/services/accounts/utils/apiServiceRequest"
```

Add this helper next to `buildRequest()`:

```ts
const buildPreparedContext = (
  request: ApiServiceRequest = buildRequest(),
): AccountApiContext => ({
  accountId: request.accountId ?? "account-id",
  siteType: SITE_TYPES.NEW_API,
  request,
})
```

Add these tests under `describe("defaultTokenLifecycle inventory helpers", () => { ... })`:

```ts
  it("inspects inventory from a prepared request context", async () => {
    const request = buildRequest()
    const existingToken = buildToken({ id: 12, key: "sk-prepared" })
    fetchAccountTokensMock.mockResolvedValueOnce([existingToken])
    isInventoryTokenUsableMock.mockReturnValueOnce(true)

    await expect(
      inspectDefaultTokenInventoryWithContext({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        context: buildPreparedContext(request),
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Present,
      token: existingToken,
      existingTokenIds: [12],
      hasUsableSecret: true,
    })

    expect(getSiteAdapterMock).toHaveBeenCalledWith(SITE_TYPES.NEW_API)
    expect(fetchAccountTokensMock).toHaveBeenCalledWith(request)
  })
```

Add this test under `describe("defaultTokenLifecycle decision and create helpers", () => { ... })`:

```ts
  it("resolves creation decisions from a prepared request context", async () => {
    const resolveDefaultTokenCreationMock = vi
      .fn()
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups,
      })
      .mockReturnValueOnce({
        kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
        tokenData: buildGroupDefaultTokenRequest("vip"),
        oneTimeSecret: false,
        recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch,
      })
    const fetchUserGroupsMock = vi.fn().mockResolvedValueOnce({
      vip: { desc: "VIP", ratio: 2 },
    })

    getSiteAdapterMock.mockReturnValueOnce({
      keyManagement: {
        fetchTokens: vi.fn(),
        createToken: vi.fn(),
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
        userGroups: { fetch: fetchUserGroupsMock },
      },
      tokenProvisioning: {
        isInventoryTokenUsable: vi.fn(),
        resolveDefaultTokenCreation: resolveDefaultTokenCreationMock,
        classifyCreatedToken: vi.fn(),
        getRepairPolicy: vi.fn(),
      },
    })

    await expect(
      resolveDefaultTokenLifecycleDecisionWithContext({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        context: buildPreparedContext(),
      }),
    ).resolves.toMatchObject({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: expect.objectContaining({ group: "vip" }),
    })

    expect(fetchUserGroupsMock).toHaveBeenCalledWith(buildRequest())
  })
```

Add this test under `describe("ensureDefaultTokenLifecycle", () => { ... })`:

```ts
  it("uses the prepared stored request for both inventory and token creation", async () => {
    const request = {
      baseUrl: "https://stored.example.invalid",
      accountId: "stored-account-id",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "stored-user-id",
        accessToken: "stored-access-token",
        cookie: "stored-session-cookie",
      },
    }
    const createdToken = buildToken({ id: 17, key: "sk-created" })
    const createTokenMock = vi.fn().mockResolvedValueOnce(createdToken)
    const resolveDefaultTokenCreationMock = vi.fn(() => ({
      kind: DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create,
      tokenData: generateDefaultTokenRequest(),
      oneTimeSecret: false,
      recoverCreatedToken: TOKEN_CREATION_SECRET_RECOVERY.CreatedResponseFirst,
    }))

    fetchAccountTokensMock.mockResolvedValueOnce([])
    getSiteAdapterMock.mockReturnValueOnce({
      keyManagement: {
        fetchTokens: (...args: unknown[]) => fetchAccountTokensMock(...args),
        createToken: createTokenMock,
        updateToken: vi.fn(),
        resolveTokenKey: vi.fn(),
        deleteToken: vi.fn(),
        fetchAvailableModels: vi.fn(),
      },
      tokenProvisioning: {
        isInventoryTokenUsable: vi.fn(),
        resolveDefaultTokenCreation: resolveDefaultTokenCreationMock,
        classifyCreatedToken: vi.fn(() => ({
          kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
          token: createdToken,
          oneTimeSecret: false,
        })),
        getRepairPolicy: vi.fn(),
      },
    })

    await expect(
      ensureDefaultTokenLifecycleWithContext({
        workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
        context: buildPreparedContext(request),
      }),
    ).resolves.toEqual({
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: false,
      existingTokenIds: [],
    })

    expect(fetchAccountTokensMock).toHaveBeenCalledWith(request)
    expect(createTokenMock).toHaveBeenCalledWith(
      request,
      generateDefaultTokenRequest(),
    )
  })
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run:

```powershell
pnpm vitest --run tests/services/accounts/defaultTokenLifecycle.test.ts
```

Expected: FAIL because `inspectDefaultTokenInventoryWithContext(...)`, `resolveDefaultTokenLifecycleDecisionWithContext(...)`, and `ensureDefaultTokenLifecycleWithContext(...)` are not exported.

- [ ] **Step 3: Add prepared-context lifecycle APIs**

In `src/services/accounts/defaultTokenLifecycle/lifecycle.ts`, update the imports:

```ts
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import {
  createAccountApiRequestFromStoredAccount,
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
  requireDisplayAccountTokenProvisioning,
  type AccountApiContext,
} from "~/services/accounts/utils/apiServiceRequest"
```

Add this helper below `MissingUserGroupsCapabilityError`:

```ts
const requireTokenLifecycleCapabilities = (context: AccountApiContext) => {
  const adapter = getSiteAdapter(context.siteType)

  return {
    keyManagement: requireDisplayAccountKeyManagement(
      { siteType: context.siteType },
      adapter.keyManagement,
    ),
    tokenProvisioning: requireDisplayAccountTokenProvisioning(
      { siteType: context.siteType },
      adapter.tokenProvisioning,
    ),
  }
}
```

Add the prepared inventory API above the existing `inspectDefaultTokenInventory(...)` wrapper:

```ts
/**
 * Fetches the current default-token inventory from an already prepared context.
 */
export async function inspectDefaultTokenInventoryWithContext(params: {
  workflow: TokenProvisioningWorkflow
  context: AccountApiContext
}): Promise<DefaultTokenInventoryState> {
  const { keyManagement, tokenProvisioning } =
    requireTokenLifecycleCapabilities(params.context)

  return inspectDefaultTokenInventoryWithCapabilities({
    workflow: params.workflow,
    keyManagement,
    tokenProvisioning,
    request: params.context.request,
  })
}
```

Change `inspectDefaultTokenInventory(...)` to delegate through the display-snapshot builder:

```ts
export async function inspectDefaultTokenInventory(params: {
  workflow: TokenProvisioningWorkflow
  displaySiteData: DisplaySiteData
}): Promise<DefaultTokenInventoryState> {
  return inspectDefaultTokenInventoryWithContext({
    workflow: params.workflow,
    context: createDisplayAccountApiContext(params.displaySiteData),
  })
}
```

Add the prepared decision API above the existing `resolveDefaultTokenLifecycleDecision(...)` wrapper:

```ts
/**
 * Resolves lifecycle-level default-token creation policy from a prepared context.
 */
export async function resolveDefaultTokenLifecycleDecisionWithContext(params: {
  workflow: TokenProvisioningWorkflow
  context: AccountApiContext
  defaultTokenData?: ResolveDefaultTokenCreationRequest["defaultTokenData"]
  explicitGroup?: string
  missingUserGroupsMessage?: string
}): Promise<DefaultTokenCreationDecision> {
  const { keyManagement, tokenProvisioning } =
    requireTokenLifecycleCapabilities(params.context)

  return resolveDefaultTokenCreationWithUserGroups({
    keyManagement,
    tokenProvisioning,
    request: params.context.request,
    decisionRequest: {
      workflow: params.workflow,
      defaultTokenData:
        params.defaultTokenData ?? generateDefaultTokenRequest(),
      explicitGroup: params.explicitGroup,
    },
    missingUserGroupsMessage: params.missingUserGroupsMessage,
  })
}
```

Change `resolveDefaultTokenLifecycleDecision(...)` to delegate:

```ts
export async function resolveDefaultTokenLifecycleDecision(params: {
  workflow: TokenProvisioningWorkflow
  displaySiteData: DisplaySiteData
  defaultTokenData?: ResolveDefaultTokenCreationRequest["defaultTokenData"]
  explicitGroup?: string
  missingUserGroupsMessage?: string
}): Promise<DefaultTokenCreationDecision> {
  return resolveDefaultTokenLifecycleDecisionWithContext({
    workflow: params.workflow,
    context: createDisplayAccountApiContext(params.displaySiteData),
    defaultTokenData: params.defaultTokenData,
    explicitGroup: params.explicitGroup,
    missingUserGroupsMessage: params.missingUserGroupsMessage,
  })
}
```

Add the prepared ensure API above the existing `ensureDefaultTokenLifecycle(...)` wrapper:

```ts
/**
 * Ensures a default token exists using an already prepared request context.
 */
export async function ensureDefaultTokenLifecycleWithContext(params: {
  workflow: TokenProvisioningWorkflow
  context: AccountApiContext
  createContext?: AccountApiContext
  defaultTokenData?: ResolveDefaultTokenCreationRequest["defaultTokenData"]
  explicitGroup?: string
  inspectInventory?: boolean
}): Promise<DefaultTokenLifecycleResult> {
  const { workflow, context } = params

  if (workflow === TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection) {
    throw new Error(
      DEFAULT_TOKEN_LIFECYCLE_ERRORS.QuickCreateSelectionIsDecisionOnly,
    )
  }

  let existingTokenIds: number[] = []
  const { keyManagement, tokenProvisioning } =
    requireTokenLifecycleCapabilities(context)

  if (params.inspectInventory !== false) {
    const inventoryState = await inspectDefaultTokenInventoryWithCapabilities({
      workflow,
      keyManagement,
      tokenProvisioning,
      request: context.request,
    })
    existingTokenIds = inventoryState.existingTokenIds

    if (
      inventoryState.kind === DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Present &&
      inventoryState.hasUsableSecret
    ) {
      return {
        kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Ready,
        token: inventoryState.token,
        created: false,
        existingTokenIds,
      }
    }
  }

  let decision: DefaultTokenCreationDecision
  try {
    decision = await resolveDefaultTokenCreationWithUserGroups({
      keyManagement,
      tokenProvisioning,
      request: context.request,
      decisionRequest: {
        workflow,
        defaultTokenData:
          params.defaultTokenData ?? generateDefaultTokenRequest(),
        explicitGroup: params.explicitGroup,
      },
    })
  } catch (error) {
    if (!(error instanceof MissingUserGroupsCapabilityError)) {
      throw error
    }

    return {
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
      reason: DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.MissingUserGroups,
      existingTokenIds,
      cause: error,
    }
  }

  if (
    decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired
  ) {
    return {
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.SelectionRequired,
      allowedGroups: decision.allowedGroups,
      existingTokenIds,
    }
  }

  if (decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked) {
    return {
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
      reason: decision.reason,
      existingTokenIds,
    }
  }

  if (decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups) {
    return {
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
      reason: DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.MissingUserGroups,
      existingTokenIds,
    }
  }

  if (
    params.inspectInventory === false &&
    decision.recoverCreatedToken ===
      TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch &&
    existingTokenIds.length === 0
  ) {
    existingTokenIds = getTokenIds(
      sanitizeApiTokens(await keyManagement.fetchTokens(context.request)),
    )
  }

  return await createDefaultTokenFromDecision({
    workflow,
    keyManagement,
    tokenProvisioning,
    createRequest: (params.createContext ?? context).request,
    inventoryRequest: context.request,
    decision,
    existingTokenIds,
  })
}
```

Change `ensureDefaultTokenLifecycle(...)` to be a compatibility wrapper. It should preserve current behavior for mixed display/stored callers by passing display context as inventory context and stored context as create context:

```ts
export async function ensureDefaultTokenLifecycle(params: {
  workflow: TokenProvisioningWorkflow
  account: SiteAccount
  displaySiteData: DisplaySiteData
  defaultTokenData?: ResolveDefaultTokenCreationRequest["defaultTokenData"]
  explicitGroup?: string
  inspectInventory?: boolean
}): Promise<DefaultTokenLifecycleResult> {
  return ensureDefaultTokenLifecycleWithContext({
    workflow: params.workflow,
    context: createDisplayAccountApiContext(params.displaySiteData),
    createContext: createAccountApiRequestFromStoredAccount(params.account),
    defaultTokenData: params.defaultTokenData,
    explicitGroup: params.explicitGroup,
    inspectInventory: params.inspectInventory,
  })
}
```

- [ ] **Step 4: Run the focused test and verify it passes**

Run:

```powershell
pnpm vitest --run tests/services/accounts/defaultTokenLifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```powershell
git status --porcelain
git add src/services/accounts/defaultTokenLifecycle/lifecycle.ts tests/services/accounts/defaultTokenLifecycle.test.ts
git commit -m "refactor(accounts): add prepared token lifecycle contexts"
```

Expected: commit succeeds. If hooks modify files, inspect `git status --porcelain` and `git diff --cached` before retrying.

---

### Task 3: Move Post-Save And Background Ensure To Stored Context

**Files:**

- Modify: `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
- Modify: `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
- Modify: `src/services/accounts/accountOperations.ts`
- Test: `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`
- Test: `tests/services/accountOperations.ensureAccountApiToken.test.ts`
- Test: `tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts`

- [ ] **Step 1: Add failing tests for stored-context workflow behavior**

In `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`, keep the default-token lifecycle import focused on helpers that the test file calls directly:

```ts
import {
  DEFAULT_TOKEN_INVENTORY_STATE_KINDS,
  inspectDefaultTokenInventory,
  selectSingleNewApiTokenByIdDiff,
} from "~/services/accounts/defaultTokenLifecycle"
```

Update the post-save workflow import to include the stored-account entry point:

```ts
import {
  ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES,
  ENSURE_ACCOUNT_TOKEN_RESULT_KINDS,
  ensureAccountTokenForPostSaveWorkflow,
  ensureAccountTokenForPostSaveWorkflowFromStoredAccount,
  inspectAccountTokenInventory,
} from "~/services/accounts/accountPostSaveWorkflow"
```

Add this test under `describe("ensureAccountTokenForPostSaveWorkflow", () => { ... })`:

```ts
  it("can run post-save automation from the stored account context without display request fields", async () => {
    const account = buildSiteAccount({
      id: "stored-account-id",
      site_name: "Stored Account",
      site_url: "https://stored.example.invalid",
      site_type: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.Cookie,
      cookieAuth: { sessionCookie: "stored-session-cookie" },
      account_info: {
        id: "stored-user-id",
        access_token: "stored-access-token",
        username: "stored-user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    const createdToken = buildToken({ id: 88, key: "sk-created" })

    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(createdToken)
    classifyCreatedTokenMock.mockReturnValueOnce({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
      token: createdToken,
      oneTimeSecret: false,
    })

    await expect(
      ensureAccountTokenForPostSaveWorkflowFromStoredAccount({
        account,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: false,
    })

    const expectedStoredRequest = {
      baseUrl: "https://stored.example.invalid",
      accountId: "stored-account-id",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "stored-user-id",
        accessToken: "stored-access-token",
        cookie: "stored-session-cookie",
      },
    }

    expect(fetchAccountTokensMock).toHaveBeenCalledWith(expectedStoredRequest)
    expect(createApiTokenMock).toHaveBeenCalledWith(
      expectedStoredRequest,
      expect.objectContaining({ name: DEFAULT_AUTO_PROVISION_TOKEN_NAME }),
    )
  })
```

Keep a compatibility assertion for the old display-shaped wrapper so immediate Account Dialog call sites are not broken in this slice:

```ts
  it("keeps the post-save display wrapper as a compatibility path", async () => {
    const displayAccount = buildDisplayAccount()
    const account = buildStoredAccount(displayAccount)
    const existingToken = buildToken({ id: 5, key: "sk-ready" })
    fetchAccountTokensMock.mockResolvedValueOnce([existingToken])

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toMatchObject({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
      token: existingToken,
      created: false,
    })
  })
```

In `tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts`, replace the existing test named `"shows failure feedback when saved account display data is invalid for auto-provision"` with a stored-account expectation:

```ts
  it("does not require saved display request fields for background auto-provision", async () => {
    const invalidDisplaySiteData: Partial<DisplaySiteData> = {
      id: "invalid-display-account",
      name: "Invalid Display",
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://api.example.com",
      authType: AuthTypeEnum.AccessToken,
      userId: "1",
      token: "",
      cookieAuthSessionCookie: "",
    }
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValueOnce(
      invalidDisplaySiteData as DisplaySiteData,
    )

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Test Site",
      "tester",
      "test-token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      "unknown",
      AuthTypeEnum.AccessToken,
      "",
    )

    expect(result.success).toBe(true)

    await flushPromises()
    await flushPromises()

    expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledWith(
      expect.objectContaining({
        account: expect.objectContaining({
          id: expect.any(String),
          site_url: "https://api.example.com",
          account_info: expect.objectContaining({
            id: "1",
            access_token: "test-token",
          }),
        }),
      }),
    )
    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
    expect(toastErrorMock).not.toHaveBeenCalled()
  })
```

In the existing `"uses the disambiguated account label for the auto-provision flow"` test, update the final expectation because `ensureDefaultApiTokenForAccount(...)` no longer receives display data:

```ts
    expect(ensureDefaultApiTokenForAccountMock).toHaveBeenCalledWith({
      account: expect.objectContaining({
        site_name: "Test Site",
        account_info: expect.objectContaining({
          username: "tester-2",
        }),
      }),
    })
```

In `tests/services/accountOperations.ensureAccountApiToken.test.ts`, update every `ensureDefaultApiTokenForAccount({ account, displaySiteData })` call to pass only the stored account:

```ts
await expect(
  ensureDefaultApiTokenForAccount({
    account: SITE_ACCOUNT,
  }),
).resolves.toEqual({ token, created: false })
```

For the existing test named `"uses display account fields for inventory reads and stored account fields for token creation"`, replace the expectation with stored-account request fields for both inventory and creation:

```ts
    expect(fetchAccountTokensMock).toHaveBeenNthCalledWith(
      1,
      expectedStoredRequest,
    )
    expect(fetchAccountTokensMock).toHaveBeenNthCalledWith(
      2,
      expectedStoredRequest,
    )
    expect(createApiTokenMock).toHaveBeenCalledWith(
      expectedStoredRequest,
      expect.objectContaining({
        name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        group: "",
      }),
    )
```

Do not change tests that call `ensureAccountApiToken(...)`; those continue to prove the shared UI/managed-site compatibility wrapper behavior. Moving that wrapper to stored-only context requires the caller audit in the next step.

- [ ] **Step 2: Run the focused tests and verify they fail**

Run:

```powershell
pnpm vitest --run tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts
```

Expected: FAIL because post-save/background auto-provision still uses display-snapshot request fields for inventory reads. `tests/services/accountOperations.ensureAccountApiToken.test.ts` should continue to pass and protects the shared UI compatibility wrapper.

- [ ] **Step 3: Update post-save and background ensure helpers to pass stored context**

In `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`, import the prepared lifecycle helper and stored-account context builder:

```ts
import { createAccountApiRequestFromStoredAccount } from "~/services/accounts/utils/apiServiceRequest"
```

Update the lifecycle import:

```ts
import {
  DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS,
  DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS,
  ensureDefaultTokenLifecycleWithContext,
  inspectDefaultTokenInventory,
  selectSingleNewApiTokenByIdDiff,
} from "~/services/accounts/defaultTokenLifecycle"
```

Add a stored-account entry point and keep `ensureAccountTokenForPostSaveWorkflow(...)` as a compatibility wrapper:

```ts
export async function ensureAccountTokenForPostSaveWorkflowFromStoredAccount(params: {
  account: SiteAccount
}): Promise<EnsureAccountTokenResult> {
  const storedContext = createAccountApiRequestFromStoredAccount(params.account)
  const result = await ensureDefaultTokenLifecycleWithContext({
    workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
    context: storedContext,
    createContext: storedContext,
  })
```

Move the current result mapping into this stored-account function unchanged.

Then change the old wrapper so existing display-shaped callers keep compiling while the request source is stored:

```ts
export function ensureAccountTokenForPostSaveWorkflow(params: {
  account: SiteAccount
  displaySiteData: DisplaySiteData
}): Promise<EnsureAccountTokenResult> {
  return ensureAccountTokenForPostSaveWorkflowFromStoredAccount({
    account: params.account,
  })
}
```

In `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`, import `createAccountApiRequestFromStoredAccount` and `ensureDefaultTokenLifecycleWithContext`, then change `ensureDefaultApiTokenForAccount(...)` so display data is no longer a request source:

```ts
export async function ensureDefaultApiTokenForAccount(params: {
  account: SiteAccount
}): Promise<{ token: ApiToken; created: boolean }> {
  const { account } = params
  const storedContext = createAccountApiRequestFromStoredAccount(account)
  const result = await ensureDefaultTokenLifecycleWithContext({
    workflow: TOKEN_PROVISIONING_WORKFLOWS.BackgroundAutoProvision,
    context: storedContext,
    createContext: storedContext,
  })
```

Leave the result/error mapping unchanged.

Do not change `ensureAccountApiToken(...)` in `src/services/accounts/accountOperations.ts` in this task. It is used by immediate UI and managed-site flows such as `ChannelDialog`, `KiloCodeExportDialog`, and managed-site providers. Keep it on `ensureDefaultTokenLifecycle(...)` until those callers are classified.

Add this audit command to the task notes and leave each caller untouched:

```powershell
rg "ensureAccountApiToken\\(" src/components src/services/managedSites src/features
```

Expected callers remain classified as shared UI/managed-site compatibility paths, not background/cross-tick accountId-only work.

Do not change `resolveDefaultTokenQuickCreateResolution(...)`: it is an immediate UI decision path and should keep `DisplaySiteData`.

- [ ] **Step 4: Remove unnecessary display-data fetches from auto-provision after add**

In `src/services/accounts/accountOperations.ts`, keep the stored account validation in `autoProvisionKeyOnAccountAdd(...)` and stop reading display data solely to build API requests.

Replace this block:

```ts
    const displaySiteData =
      (await accountStorage.getDisplayDataById(accountId)) ??
      accountStorage.convertToDisplayData(account)
    const hasToken =
      typeof displaySiteData?.token === "string" &&
      displaySiteData.token.trim().length > 0
    const hasCookie =
      typeof displaySiteData?.cookieAuthSessionCookie === "string" &&
      displaySiteData.cookieAuthSessionCookie.trim().length > 0

    if (
      typeof displaySiteData?.id !== "string" ||
      displaySiteData.id.trim().length === 0 ||
      typeof displaySiteData?.baseUrl !== "string" ||
      displaySiteData.baseUrl.trim().length === 0 ||
      typeof displaySiteData?.siteType !== "string" ||
      displaySiteData.siteType.trim().length === 0 ||
      displaySiteData.authType === AuthTypeEnum.None ||
      typeof displaySiteData.userId !== "string" ||
      displaySiteData.userId.trim().length === 0 ||
      (displaySiteData.authType === AuthTypeEnum.AccessToken && !hasToken) ||
      (displaySiteData.authType === AuthTypeEnum.Cookie &&
        !hasToken &&
        !hasCookie)
    ) {
      throw new Error(ACCOUNT_KEY_REPAIR_ERRORS.InvalidDisplaySiteData)
    }

    const { created } = await ensureDefaultApiTokenForAccount({ account })
```

with:

```ts
    const { created } = await ensureDefaultApiTokenForAccount({ account })
```

The background helper no longer accepts `displaySiteData`; the request must come from `account`.

Update success toast account names to use `account.site_name`:

```ts
          accountName: account.site_name,
```

- [ ] **Step 5: Run focused tests and update expectations that intentionally changed**

Run:

```powershell
pnpm vitest --run tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts
```

Expected: PASS after updating test expectations from display request to stored request for post-save/background ensure while preserving shared `ensureAccountApiToken(...)` compatibility behavior.

- [ ] **Step 6: Commit Task 3**

Run:

```powershell
git status --porcelain
git add src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/services/accounts/accountOperations.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts
git commit -m "refactor(accounts): resolve background token context once"
```

Expected: commit succeeds. If hooks modify files, inspect `git status --porcelain` and `git diff --cached` before retrying.

---

### Task 4: Route Repair Workflows Through Stored Account Requests

**Files:**

- Modify: `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
- Modify: `src/services/accounts/accountKeyAutoProvisioning/repair.ts`
- Test: `tests/services/accountKeyGroupCoverage.test.ts`
- Test: `tests/services/accountKeyRepair.test.ts`

- [ ] **Step 1: Add failing tests for repair request source**

In `tests/services/accountKeyGroupCoverage.test.ts`, add this regression test so a stale display snapshot cannot affect remote token requests or adapter selection:

```ts
  it("uses stored account context for group coverage token APIs and adapter lookup", async () => {
    const account = buildSiteAccount({
      id: "stored-account-id",
      site_url: "https://stored.example.invalid",
      site_type: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.Cookie,
      cookieAuth: { sessionCookie: "stored-session-cookie" },
      account_info: {
        id: "stored-user-id",
        access_token: "stored-access-token",
        username: "stored-user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    const displaySiteData = buildDisplaySiteData({
      id: "display-account-id",
      baseUrl: "https://display.example.invalid",
      siteType: SITE_TYPES.SUB2API,
      authType: AuthTypeEnum.Cookie,
      userId: "display-user-id",
      token: "display-access-token",
      cookieAuthSessionCookie: "display-session-cookie",
    })

    mocks.fetchAccountTokens.mockResolvedValueOnce([])
    mocks.fetchUserGroups.mockResolvedValueOnce({
      default: { desc: "Default", ratio: 1 },
    })
    mocks.createApiToken.mockResolvedValueOnce({ id: 1, key: "sk-created" })
    mocks.classifyCreatedToken.mockReturnValueOnce({
      kind: CREATED_TOKEN_SECRET_DECISION_KINDS.Usable,
      token: { id: 1, key: "sk-created" },
      oneTimeSecret: false,
    })

    await ensureAccountKeysForAvailableGroups({
      account,
      displaySiteData,
      accountName: "Stored Account",
      siteUrlOrigin: "https://stored.example.invalid",
    })

    const expectedStoredRequest = {
      baseUrl: "https://stored.example.invalid",
      accountId: "stored-account-id",
      auth: {
        authType: AuthTypeEnum.Cookie,
        userId: "stored-user-id",
        accessToken: "stored-access-token",
        cookie: "stored-session-cookie",
      },
    }

    const { getSiteAdapter } = await import("~/services/apiAdapters/registry")
    expect(getSiteAdapter).toHaveBeenCalledWith(SITE_TYPES.NEW_API)
    expect(mocks.fetchAccountTokens).toHaveBeenCalledWith(expectedStoredRequest)
    expect(mocks.fetchUserGroups).toHaveBeenCalledWith(expectedStoredRequest)
    expect(mocks.createApiToken).toHaveBeenCalledWith(
      expectedStoredRequest,
      expect.any(Object),
    )
  })
```

In `tests/services/accountKeyRepair.test.ts`, update the runner expectation in `"records skipped, created, and failed outcomes during a repair run"` so invalid display data is not treated as a request-construction failure for an otherwise valid stored account. The expected summary should become:

```ts
    mocks.ensureAccountKeysForAvailableGroups
      .mockResolvedValueOnce({
        created: true,
        availableGroups: [],
        coveredGroups: [],
        createdGroups: [""],
        missingGroups: [],
        invalidTokens: [],
      })
      .mockResolvedValueOnce({
        created: true,
        availableGroups: [],
        coveredGroups: [],
        createdGroups: [""],
        missingGroups: [],
        invalidTokens: [],
      })

    expect(progress.totals).toMatchObject({
      enabledAccounts: 4,
      eligibleAccounts: 2,
      processedAccounts: 2,
      processedEligibleAccounts: 2,
    })
    expect(progress.summary).toEqual({
      created: 2,
      alreadyHad: 0,
      skipped: 2,
      failed: 0,
      availableGroups: 0,
      coveredGroups: 0,
      createdKeys: 2,
      renamedKeys: 0,
      renameFailed: 0,
      invalidKeys: 0,
      deletedKeys: 0,
      deleteFailed: 0,
    })
```

Also expect `mocks.ensureAccountKeysForAvailableGroups` to be called twice.

- [ ] **Step 2: Run focused tests and verify failures**

Run:

```powershell
pnpm vitest --run tests/services/accountKeyGroupCoverage.test.ts tests/services/accountKeyRepair.test.ts
```

Expected: the repair-runner test fails until repair stops treating display-account request fields as required for background work. The group-coverage test is regression coverage and should pass once the implementation uses `account.site_type` for adapter lookup and the stored-account request for token APIs.

- [ ] **Step 3: Keep display data in group coverage as metadata only**

In `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`, `ensureAccountKeysForAvailableGroups(...)` already builds `request` from `createAccountApiRequestFromStoredAccount(account)`. Keep that behavior.

Use the stored account site type for adapter and capability lookup:

```ts
  const adapter = getSiteAdapter(account.site_type)
  const capabilitySite = { siteType: account.site_type }
  const keyManagement = requireDisplayAccountKeyManagement(
    capabilitySite,
    adapter.keyManagement,
  )
  const tokenProvisioning = requireDisplayAccountTokenProvisioning(
    capabilitySite,
    adapter.tokenProvisioning,
  )
```

Narrow display-data usage to metadata:

```ts
  const accountId = account.id
```

For result `siteType`, prefer `account.site_type`:

```ts
      siteType: account.site_type,
```

In `deleteInvalidAccountToken(...)`, also use `account.site_type` for adapter/capability lookup:

```ts
  const adapter = getSiteAdapter(account.site_type)
  const keyManagement = requireDisplayAccountKeyManagement(
    { siteType: account.site_type },
    adapter.keyManagement,
  )
```

Do not replace `request` construction with display snapshot data, and do not use `displaySiteData.siteType` for adapter selection.

- [ ] **Step 4: Stop validating display request fields in the repair runner**

In `src/services/accounts/accountKeyAutoProvisioning/repair.ts`, inside `processEligibleAccount(...)`, replace the block that checks `displaySiteData.id`, `baseUrl`, `siteType`, `userId`, `token`, and `cookieAuthSessionCookie`.

Keep only stored-account request validation by constructing the request in the group coverage helper. The runner should do this:

```ts
      const displaySiteData: DisplaySiteData =
        displaySiteDataById.get(account.id) ??
        accountStorage.convertToDisplayData(account)
      const resolvedAccountName = displaySiteData.name || accountName

      const result = await ensureAccountKeysForAvailableGroups({
        account,
        displaySiteData,
        accountName: resolvedAccountName,
        siteUrlOrigin: originKey,
        abortSignal,
        renameAutoTemplateTokens: options.renameAutoTemplateTokens,
      })
```

If `createAccountApiRequestFromStoredAccount(account)` later throws `StoredAccountApiContextError`, let the existing catch record a failed result with the stable error message. Do not convert it to `ACCOUNT_KEY_REPAIR_ERRORS.InvalidDisplaySiteData`.

- [ ] **Step 5: Run focused tests and verify pass**

Run:

```powershell
pnpm vitest --run tests/services/accountKeyGroupCoverage.test.ts tests/services/accountKeyRepair.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 4**

Run:

```powershell
git status --porcelain
git add src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts src/services/accounts/accountKeyAutoProvisioning/repair.ts tests/services/accountKeyGroupCoverage.test.ts tests/services/accountKeyRepair.test.ts
git commit -m "refactor(accounts): keep repair requests account-owned"
```

Expected: commit succeeds.

---

### Task 5: Preserve Immediate UI Snapshot Paths

**Files:**

- Modify only if tests need expectation updates:
  - `tests/features/AccountManagement/components/CopyKeyDialog.test.tsx`
  - `tests/entrypoints/options/pages/ModelList/ModelKeyDialog.test.tsx`
  - `tests/components/VerifyCliSupportDialog.test.tsx`
  - `tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx`
- No production change expected unless an earlier task accidentally migrated UI paths.

- [ ] **Step 1: Verify immediate UI call sites still use display snapshot context**

Run:

```powershell
rg "createDisplayAccountApiContext\\(|createDisplayAccountRequestContext\\(" src/features src/components
```

Expected call sites include immediate user actions such as:

```text
src/features/AccountManagement/components/CopyKeyDialog/hooks/useCopyKeyDialog.ts
src/features/ModelList/components/ModelKeyDialog/hooks/useModelKeyDialog.ts
src/components/dialogs/ChannelDialog/hooks/useChannelDialog.ts
src/components/dialogs/VerifyApiDialog/index.tsx
src/components/dialogs/VerifyCliSupportDialog/index.tsx
src/features/KeyManagement/hooks/useKeyManagement.ts
src/features/TokenProvisioning/components/AddTokenDialog/index.tsx
src/features/TokenProvisioning/components/AddTokenDialog/hooks/useTokenData.ts
```

Do not convert these to `resolveStoredAccountApiContext(...)` in this plan. They are immediate UI operations using the currently visible account snapshot.

- [ ] **Step 2: Verify quick-create resolution remains display-snapshot based**

Run:

```powershell
rg "resolveDefaultTokenQuickCreateResolution\\(" src/features src/components src/services/accounts
```

Expected: immediate UI selection flows still pass `DisplaySiteData`. This is intentional because quick-create group selection reflects the visible account state.

- [ ] **Step 3: Run existing UI-focused tests that cover snapshot paths**

Run:

```powershell
pnpm vitest --run tests/features/AccountManagement/components/CopyKeyDialog.test.tsx tests/entrypoints/options/pages/ModelList/ModelKeyDialog.test.tsx tests/components/VerifyCliSupportDialog.test.tsx tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx
```

Expected: PASS. If a path fails because a UI flow was converted to stored lookup, revert that production change and keep the UI snapshot path.

- [ ] **Step 4: Commit only if tests or production code changed**

If no files changed, skip this step.

If test expectations needed correction, run:

```powershell
git status --porcelain
git add tests/features/AccountManagement/components/CopyKeyDialog.test.tsx tests/entrypoints/options/pages/ModelList/ModelKeyDialog.test.tsx tests/components/VerifyCliSupportDialog.test.tsx tests/entrypoints/options/pages/KeyManagement/useKeyManagement.test.tsx
git commit -m "test(accounts): preserve display snapshot api actions"
```

Expected: commit succeeds.

---

### Task 6: Shrink Common Fetch Legacy Fallback To Explicit Compatibility

**Files:**

- Modify: `src/services/apiService/common/utils.ts`
- Test: `tests/services/apiService/common/utils.test.ts`
- Test: `tests/services/accounts/legacyAccountAwareRequest.test.ts`

- [ ] **Step 1: Add failing tests that common fetch no longer resolves legacy context**

In `tests/services/apiService/common/utils.test.ts`, remove the hoisted `mockResolveLegacyAccountAwareRequest`, the `vi.mock("~/services/accounts/utils/legacyAccountAwareRequest", ...)` block, and the `beforeEach` reset/setup for that mock.

Then change the expectations for `fetchApiData(...)` and `fetchApi(...)` so they call transport with the original request.

Replace the `fetchApiData` compatibility-resolution test with:

```ts
    it("passes requests directly to transport without account-aware lookup", async () => {
      const request = {
        baseUrl: "https://example.invalid",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "token",
          userId: "123",
        },
      }
      const options = { endpoint: "/api/test" }
      mockFetchApiData.mockResolvedValueOnce({ ok: true })

      await expect(fetchApiData(request, options)).resolves.toEqual({
        ok: true,
      })

      expect(mockFetchApiData).toHaveBeenCalledWith(request, options)
    })
```

Replace the `fetchApi` compatibility-resolution test with:

```ts
    it("passes response requests directly to transport without account-aware lookup", async () => {
      const request = {
        baseUrl: "https://example.invalid",
        auth: {
          authType: AuthTypeEnum.AccessToken,
          accessToken: "token",
          userId: "123",
        },
      }
      const options = { endpoint: "/api/test" }
      mockFetchApi.mockResolvedValueOnce({ success: true, data: { ok: true } })

      await expect(fetchApi(request, options, true)).resolves.toEqual({
        success: true,
        data: { ok: true },
      })

      expect(mockFetchApi).toHaveBeenCalledWith(request, options, true)
    })
```

Keep `tests/services/accounts/legacyAccountAwareRequest.test.ts` unchanged; it owns legacy lookup behavior.

- [ ] **Step 2: Run the focused tests and verify failure**

Run:

```powershell
pnpm vitest --run tests/services/apiService/common/utils.test.ts tests/services/accounts/legacyAccountAwareRequest.test.ts
```

Expected: FAIL because `fetchApi(...)` and `fetchApiData(...)` still call `resolveLegacyAccountAwareRequest(...)`.

- [ ] **Step 3: Remove default legacy lookup from common fetch wrappers**

In `src/services/apiService/common/utils.ts`, remove:

```ts
import { resolveLegacyAccountAwareRequest } from "~/services/accounts/utils/legacyAccountAwareRequest"
```

Change `fetchApiData(...)`:

```ts
export async function fetchApiData<T>(
  request: ApiServiceRequest,
  options: FetchApiOptions,
): Promise<T> {
  return await transportFetchApiData(request, options)
}
```

Keep the existing `fetchApi(...)` overload declarations and change only the implementation:

```ts
export function fetchApi<T>(
  request: ApiServiceRequest,
  options: FetchApiOptions,
  _normalResponseType: true,
): Promise<T>
export function fetchApi<T>(
  request: ApiServiceRequest,
  options: FetchApiOptions,
  _normalResponseType?: false,
): Promise<ApiResponse<T>>
export async function fetchApi<T>(
  request: ApiServiceRequest,
  options: FetchApiOptions,
  _normalResponseType?: boolean,
): Promise<T | ApiResponse<T>> {
  return await transportFetchApi(
    request,
    options,
    _normalResponseType as true,
  )
}
```

Do not delete `src/services/accounts/utils/legacyAccountAwareRequest.ts`.

- [ ] **Step 4: Run focused common and migrated workflow tests**

Run:

```powershell
pnpm vitest --run tests/services/apiService/common/utils.test.ts tests/services/accounts/legacyAccountAwareRequest.test.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accounts/defaultTokenLifecycle.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts tests/services/accountKeyRepair.test.ts tests/services/accountKeyGroupCoverage.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run fetch-caller audit and migration gates**

Before accepting the removal of default common-fetch fallback, enumerate the remaining common fetch wrapper callers:

```powershell
rg "fetchApi(Data)?\\(" src/services src/features src/components
rg "baseUrl: .*auth:|auth: \\{" src/services src/features src/components
```

Classify every account-site request builder touched by the output as one of:

- Prepared account context: carries `accountId` or is built from `createDisplayAccountRequestContext(...)`, `createDisplayAccountApiContext(...)`, `resolveStoredAccountApiContext(...)`, or `createAccountApiRequestFromStoredAccount(account)`.
- Public/no-account request: endpoint does not need account-owned session/cookie enrichment.
- Managed-session synthetic request: intentionally not a stored account.
- Explicit legacy compatibility path: must call `resolveLegacyAccountAwareRequest(...)` directly from an accounts-owned boundary.

If any account-owned caller still depends on `baseUrl + userId` enrichment without `accountId`, fix that caller before removing fallback from `common/utils.ts`.

Run:

```powershell
rg "resolveLegacyAccountAwareRequest" src tests
rg "accountStorage" src/services/apiService/common
rg "getAccountByBaseUrlAndUserId" src/services/apiService src/services/apiAdapters src/services/apiTransport
rg "DisplaySiteData" src/services/apiService src/services/apiAdapters src/services/apiTransport
```

Expected:

- `resolveLegacyAccountAwareRequest` appears only in:
  - `src/services/accounts/utils/legacyAccountAwareRequest.ts`
  - `tests/services/accounts/legacyAccountAwareRequest.test.ts`
  - optionally comments in migration docs/plans.
- `accountStorage` has no matches in `src/services/apiService/common`.
- `getAccountByBaseUrlAndUserId` has no matches in `src/services/apiService`, `src/services/apiAdapters`, or `src/services/apiTransport`.
- `DisplaySiteData` has no new matches in protocol, adapter, or transport modules. Existing unrelated matches should be reported, not rewritten.

- [ ] **Step 6: Commit Task 6**

Run:

```powershell
git status --porcelain
git add src/services/apiService/common/utils.ts tests/services/apiService/common/utils.test.ts tests/services/accounts/legacyAccountAwareRequest.test.ts
git commit -m "refactor(api-service): make common fetch context-explicit"
```

Expected: commit succeeds.

---

### Task 7: Final Validation And Handoff

**Files:**

- No production changes expected.
- Optional updates only for test expectation cleanup from previous tasks.

- [ ] **Step 1: Run related Vitest coverage for migrated account workflows**

Run:

```powershell
pnpm vitest --run tests/services/accounts/apiServiceRequest.test.ts tests/services/accounts/defaultTokenLifecycle.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts tests/services/accountKeyRepair.test.ts tests/services/accountKeyGroupCoverage.test.ts tests/services/siteAnnouncements/scheduler.test.ts tests/services/usageHistory/sync.test.ts tests/services/redeemService.test.ts tests/services/apiService/common/utils.test.ts tests/services/accounts/legacyAccountAwareRequest.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run API-service account-data backend tests as regression coverage**

Run:

```powershell
pnpm vitest --run tests/services/apiService/common/accountData.test.ts tests/services/apiService/anyrouter.index.test.ts tests/services/apiService/wong/index.test.ts tests/services/apiService/veloera/channelApi.test.ts tests/services/apiService/doneHub/channelApi.test.ts tests/services/apiService/sub2api/index.test.ts tests/services/apiService/aihubmix/index.test.ts
```

Expected: PASS. These ensure removing common fetch fallback did not break prepared requests in account-data adapters.

- [ ] **Step 3: Run ownership gates**

Run:

```powershell
rg "accountStorage" src/services/apiService src/services/apiAdapters src/services/apiTransport
rg "getAccountByBaseUrlAndUserId" src/services/apiService src/services/apiAdapters src/services/apiTransport
rg "resolveLegacyAccountAwareRequest" src tests
rg "fetchApi(Data)?\\(" src/services src/features src/components
rg "createDisplayAccountApiContext\\(|createDisplayAccountRequestContext\\(" src/services/accounts src/features src/components
rg "resolveStoredAccountApiContext\\(|createAccountApiRequestFromStoredAccount\\(" src/services/accounts src/features src/components
```

Expected:

- No storage lookup from `apiService`, `apiAdapters`, or `apiTransport`.
- Legacy resolver remains accounts-owned and test-owned only.
- Remaining common fetch wrapper callers are classified as prepared account context, public/no-account request, managed-session synthetic request, or explicit legacy compatibility path.
- Immediate UI files still use display snapshot context.
- AccountId-only background/retry/repair/cross-tick boundaries use `resolveStoredAccountApiContext(accountId)`; account-owned flows that already hold `SiteAccount` use `createAccountApiRequestFromStoredAccount(account)`.

- [ ] **Step 4: Run staged validation**

Run:

```powershell
git status --porcelain
git add src/services/accounts/defaultTokenLifecycle/lifecycle.ts src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts src/services/accounts/accountKeyAutoProvisioning/repair.ts src/services/accounts/accountOperations.ts src/services/siteAnnouncements/scheduler.ts src/services/history/usageHistory/sync.ts src/services/redemption/redeemService.ts src/services/apiService/common/utils.ts tests/services/accounts/apiServiceRequest.test.ts tests/services/accounts/defaultTokenLifecycle.test.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.ensureAccountApiToken.test.ts tests/services/accountOperations.autoProvisionKeyOnAccountAdd.test.ts tests/services/accountKeyRepair.test.ts tests/services/accountKeyGroupCoverage.test.ts tests/services/siteAnnouncements/scheduler.test.ts tests/services/usageHistory/sync.test.ts tests/services/redeemService.test.ts tests/services/apiService/common/utils.test.ts tests/services/accounts/legacyAccountAwareRequest.test.ts
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 5: Run push-level validation**

Run:

```powershell
pnpm run validate:push
```

Expected: PASS. This implementation changes shared request-context wiring and common fetch behavior, so `compile` and `knip` coverage from the push gate are required.

- [ ] **Step 6: Inspect final diff**

Run:

```powershell
git diff --stat 08f047d4ab519b5108ab7391648f0c10c1ba6bf2..HEAD
git diff 08f047d4ab519b5108ab7391648f0c10c1ba6bf2..HEAD -- src/services/siteAnnouncements/scheduler.ts src/services/history/usageHistory/sync.ts src/services/redemption/redeemService.ts src/services/accounts/defaultTokenLifecycle/lifecycle.ts src/services/accounts/accountOperations.ts src/services/apiService/common/utils.ts
```

Expected:

- Token lifecycle exposes prepared-context APIs and keeps display wrappers for immediate UI compatibility.
- Stored-account scheduler/background services reuse `createAccountApiRequestFromStoredAccount(account)` instead of hand-building account API requests.
- Post-save/background helpers use stored account context for inventory and creation; shared `ensureAccountApiToken(...)` remains a display-snapshot compatibility wrapper pending caller audit.
- Repair request construction is account-owned; display data is metadata only.
- Common fetch wrappers call transport directly.
- `resolveLegacyAccountAwareRequest(...)` is still present but no longer the default path.
- No secrets, tokens, cookies, private endpoints, or real service-specific test data were added.

- [ ] **Step 7: Commit final validation-only adjustments if needed**

If Task 7 required no file changes, skip this step.

If a final validation command exposed a task-scoped cleanup that belongs to an earlier task, return to that task's commit step and include the exact files changed there. Do not create a generic validation commit with ambiguous scope.

Expected: the final history remains a sequence of task-scoped commits, or this step is skipped because validation required no additional file changes.

---

## Follow-Up Work Not In This Slice

- Convert post-save workflow entry points in `AccountDialog` to store/pass `accountId` when they are truly cross-tick jobs rather than same-tick save continuations.
- Migrate shared `ensureAccountApiToken(...)` after classifying `ChannelDialog`, `KiloCodeExportDialog`, and managed-site provider callers as immediate UI snapshot, account-owned stored account, or explicit compatibility paths.
- Decide whether account-data refresh should gain explicit prepared fetch wrappers after common fetch fallback is removed. Do this only if a real caller still lacks `accountId`.
- Delete `resolveLegacyAccountAwareRequest(...)` after every remaining caller either passes explicit context or is proven not to need account-owned request enrichment.
- Consider a small static ownership check if storage lookup starts reappearing in protocol or adapter modules.

---

## Final Handoff Checklist

- [ ] Focused Vitest commands from Tasks 1-7 passed.
- [ ] `pnpm run validate:staged` passed.
- [ ] `pnpm run validate:push` passed.
- [ ] Immediate UI operations use `createDisplayAccountApiContext(...)` or `createDisplayAccountRequestContext(...)` from display snapshots.
- [ ] AccountId-only background/retry/repair/cross-tick boundaries use `resolveStoredAccountApiContext(accountId)`.
- [ ] Account-owned flows that already hold `SiteAccount` use `createAccountApiRequestFromStoredAccount(account)`.
- [ ] Protocol, adapter, common service, and transport modules do not accept full `DisplaySiteData` as an Account API request source.
- [ ] `src/services/apiService/common` does not import `accountStorage`.
- [ ] `resolveLegacyAccountAwareRequest(...)` remains accounts-owned and is not called by common fetch wrappers.
- [ ] Telemetry decision reported: none.
- [ ] Settings search decision reported: none.
- [ ] E2E decision reported: no new E2E; focused Vitest is the right layer.
- [ ] Maintainability decision reported: reused existing accounts-owned context builders; no new parallel context abstraction added; legacy lookup intentionally left as a compatibility helper until the remaining surface is proven migrated.
