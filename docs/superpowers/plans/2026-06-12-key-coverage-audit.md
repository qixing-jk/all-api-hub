# Key Coverage Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-06-12-key-coverage-audit-design.md`

**Goal:** Replace the existing one-key repair flow with a manual key coverage audit that can backfill missing group keys, list invalid group keys, and delete selected invalid keys after explicit confirmation.

**Architecture:** Keep the current Key Management header entrypoint and `RepairMissingKeysDialog`, but make the header action open the tool without starting remote writes. Add a group-aware account audit helper, extend the existing repair runner progress model compatibly, add a typed delete-invalid-keys message, and split the dialog result area into `账号覆盖` and `异常密钥` views.

**Tech Stack:** TypeScript, React, WXT extension messaging, Vitest, Testing Library, existing shared UI primitives.

---

## File Structure

- Create `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
  - Owns group-aware coverage calculation for one account.
  - Fetches tokens and groups.
  - Creates missing group keys.
  - Returns account-level coverage plus invalid-token findings.

- Modify `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
  - Export helper constants and token request builder for group-specific default keys.
  - Keep `ensureDefaultApiTokenForAccount` behavior stable.

- Modify `src/types/accountKeyAutoProvisioning.ts`
  - Add coverage and invalid-token result types.
  - Extend progress summary compatibly with optional count fields.
  - Add batch-delete request/result types.

- Modify `src/services/accounts/accountKeyAutoProvisioning/messaging.ts`
  - Add `DeleteInvalidTokens` message.

- Modify `src/services/accounts/accountKeyAutoProvisioning/repair.ts`
  - Call the new group-aware helper for eligible accounts.
  - Preserve existing skip behavior.
  - Add delete-invalid-token handler with serial `for...of await` deletion.
  - Update progress and summary counts after deletion.

- Modify `src/features/KeyManagement/KeyManagement.tsx`
  - Change header action so it opens the dialog without auto-start.
  - Keep auto-open behavior for already-running jobs.

- Modify `src/features/KeyManagement/components/Header.tsx`
  - Rename action copy through locale key only.
  - Keep the same button position and icon.

- Modify `src/features/KeyManagement/components/RepairMissingKeysDialog.tsx`
  - Add initial explanation and explicit start button.
  - Add view switch for account coverage vs invalid keys.
  - Add invalid-key selection, bulk delete confirmation, serial delete progress, and partial-success rendering.

- Modify `src/locales/zh-CN/keyManagement.json`
  - Update Chinese source copy for the renamed audit flow and new invalid-key UI.

- Modify sibling locale files under `src/locales/{en,ja,vi,zh-TW}/keyManagement.json`
  - Keep key shapes consistent.
  - Use clear direct copy; do not rely on extraction to invent placeholder copy.

- Modify `src/services/productAnalytics/events.ts` only if a separate destructive action id is needed.
  - Prefer adding `DeleteInvalidAccountTokens: "delete_invalid_account_tokens"` if existing `DeleteAccountToken` cannot distinguish batch invalid-key deletion.

- Modify `src/services/productAnalytics/privacy.ts` only if new analytics fields are added.
  - Counts only; no names, ids, URLs, origins, group names, or backend messages.

- Modify `tests/services/accountKeyRepair.test.ts`
  - Add service/runner tests for group coverage and invalid-key deletion.

- Modify `tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx`
  - Add UI tests for explicit start, view switch, invalid-key selection, confirmation, and partial delete results.

## Shared Type Shape

Use this concrete shape as the implementation target. Keep fields optional where older stored progress blobs may exist.

```ts
export interface AccountKeyRepairInvalidToken {
  accountId: string
  accountName: string
  siteType: AccountSiteType
  siteUrlOrigin: string
  tokenId: number
  tokenName: string
  group: string
  reason: "groupUnavailable"
  errorMessage?: string
}

export interface AccountKeyRepairDeletedInvalidToken
  extends AccountKeyRepairInvalidToken {
  deletedAt: number
}

export interface AccountKeyRepairFailedInvalidTokenDelete
  extends AccountKeyRepairInvalidToken {
  errorMessage: string
}

export interface AccountKeyRepairDeleteInvalidTokensRequest {
  tokens: AccountKeyRepairInvalidToken[]
}

export interface AccountKeyRepairDeleteInvalidTokensResult {
  deleted: AccountKeyRepairDeletedInvalidToken[]
  failed: AccountKeyRepairFailedInvalidTokenDelete[]
}
```

Extend `AccountKeyRepairAccountResult`:

```ts
export interface AccountKeyRepairAccountResult {
  accountId: string
  accountName: string
  siteType: AccountSiteType
  siteUrlOrigin: string
  outcome: AccountKeyRepairOutcome
  skipReason?: AccountKeyRepairSkipReason
  errorMessage?: string
  finishedAt: number
  availableGroups?: string[]
  coveredGroups?: string[]
  createdGroups?: string[]
  missingGroups?: string[]
  invalidTokens?: AccountKeyRepairInvalidToken[]
}
```

Extend `summary`:

```ts
summary: {
  created: number
  alreadyHad: number
  skipped: number
  failed: number
  availableGroups?: number
  coveredGroups?: number
  createdKeys?: number
  invalidKeys?: number
  deletedKeys?: number
  deleteFailed?: number
}
```

## Task 1: Add Group Coverage Helper

**Files:**
- Create: `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`
- Modify: `src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts`
- Modify: `src/types/accountKeyAutoProvisioning.ts`
- Test: `tests/services/accountKeyRepair.test.ts`

- [ ] **Step 1: Add failing tests for group coverage creation and invalid-key detection**

In `tests/services/accountKeyRepair.test.ts`, update the hoisted mocks so the `ensureDefaultToken` mock also exposes the new helper:

```ts
const mocks = vi.hoisted(() => {
  const storageMap = new Map<string, unknown>()

  class StorageMock {
    async get(key: string) {
      return storageMap.get(key)
    }

    async set(key: string, value: unknown) {
      storageMap.set(key, value)
    }
  }

  return {
    storageMap,
    StorageMock,
    getAllAccounts: vi.fn(),
    convertToDisplayData: vi.fn(),
    ensureDefaultApiTokenForAccount: vi.fn(),
    ensureAccountKeysForAvailableGroups: vi.fn(),
    deleteInvalidAccountToken: vi.fn(),
    sendRuntimeMessage: vi.fn(),
    safeRandomUUID: vi.fn(() => "job-123"),
  }
})
```

Update the module mock:

```ts
vi.mock(
  "~/services/accounts/accountKeyAutoProvisioning/groupCoverage",
  () => ({
    ensureAccountKeysForAvailableGroups:
      mocks.ensureAccountKeysForAvailableGroups,
    deleteInvalidAccountToken: mocks.deleteInvalidAccountToken,
  }),
)
```

Then add this test under `describe("accountKeyRepair", ...)`:

```ts
it("records group coverage and invalid keys from the group-aware audit helper", async () => {
  const account = buildSiteAccount({
    id: "new-api-1",
    site_type: "new-api",
    site_url: "https://relay.example.com",
    authType: AuthTypeEnum.AccessToken,
    disabled: false,
    account_info: {
      id: "101",
      access_token: "access-token",
      username: "valid",
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
  })

  mocks.getAllAccounts.mockResolvedValue([account])
  mocks.convertToDisplayData.mockReturnValue([
    buildDisplaySiteData({
      id: account.id,
      name: "Relay Account",
      baseUrl: account.site_url,
      siteType: "new-api",
      authType: AuthTypeEnum.AccessToken,
      userId: "101",
      token: "access-token",
    }),
  ])
  mocks.ensureAccountKeysForAvailableGroups.mockResolvedValueOnce({
    created: true,
    availableGroups: ["default", "vip"],
    coveredGroups: ["default", "vip"],
    createdGroups: ["vip"],
    missingGroups: [],
    invalidTokens: [
      {
        accountId: "new-api-1",
        accountName: "Relay Account",
        siteType: "new-api",
        siteUrlOrigin: "https://relay.example.com",
        tokenId: 9,
        tokenName: "old group key",
        group: "old",
        reason: "groupUnavailable",
      },
    ],
  })

  const { accountKeyRepairRunner } = await import(
    "~/services/accounts/accountKeyAutoProvisioning/repair"
  )

  await accountKeyRepairRunner.start()

  await vi.waitFor(async () => {
    const progress = await accountKeyRepairRunner.getProgress()
    expect(progress.state).toBe("completed")
  })

  const progress = await accountKeyRepairRunner.getProgress()
  expect(progress.summary).toMatchObject({
    created: 1,
    alreadyHad: 0,
    skipped: 0,
    failed: 0,
    availableGroups: 2,
    coveredGroups: 2,
    createdKeys: 1,
    invalidKeys: 1,
  })
  expect(progress.results).toEqual([
    expect.objectContaining({
      accountId: "new-api-1",
      outcome: "created",
      availableGroups: ["default", "vip"],
      coveredGroups: ["default", "vip"],
      createdGroups: ["vip"],
      invalidTokens: [
        expect.objectContaining({
          tokenId: 9,
          tokenName: "old group key",
          group: "old",
          reason: "groupUnavailable",
        }),
      ],
    }),
  ])
})
```

- [ ] **Step 2: Run the failing repair test**

Run:

```powershell
pnpm vitest run tests/services/accountKeyRepair.test.ts
```

Expected: FAIL because `groupCoverage` helper does not exist and `repair.ts` still imports `ensureDefaultApiTokenForAccount`.

- [ ] **Step 3: Extend the progress types**

In `src/types/accountKeyAutoProvisioning.ts`, add the invalid-token and delete-result interfaces from the "Shared Type Shape" section above.

Keep existing fields and add optional fields to `AccountKeyRepairAccountResult` and `AccountKeyRepairProgress["summary"]`.

- [ ] **Step 4: Create the group coverage helper**

Create `src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import { getApiService } from "~/services/apiService"
import { API_ERROR_CODES } from "~/services/apiService/common/errors"
import type { CreateTokenRequest } from "~/services/apiService/common/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import type {
  AccountKeyRepairInvalidToken,
  AccountKeyRepairDeleteInvalidTokensResult,
} from "~/types/accountKeyAutoProvisioning"
import { getErrorMessage } from "~/utils/core/error"
import { t } from "~/utils/i18n/core"

import {
  DEFAULT_AUTO_PROVISION_TOKEN_NAME,
  generateDefaultTokenRequest,
} from "./ensureDefaultToken"

export interface AccountKeyCoverageResult {
  created: boolean
  availableGroups: string[]
  coveredGroups: string[]
  createdGroups: string[]
  missingGroups: string[]
  invalidTokens: AccountKeyRepairInvalidToken[]
}

const normalizeGroupName = (value: unknown) =>
  typeof value === "string" ? value.trim() : ""

const isFeatureUnsupportedError = (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  "code" in error &&
  (error as { code?: unknown }).code === API_ERROR_CODES.FEATURE_UNSUPPORTED

export function buildGroupDefaultTokenRequest(group: string): CreateTokenRequest {
  return {
    ...generateDefaultTokenRequest(),
    name:
      group && group !== "default"
        ? `${group} group (auto)`
        : DEFAULT_AUTO_PROVISION_TOKEN_NAME,
    group,
  }
}

export function createAccountApiRequest(
  account: SiteAccount,
  displaySiteData: DisplaySiteData,
): ApiServiceRequest {
  return {
    baseUrl: displaySiteData.baseUrl || account.site_url,
    accountId: displaySiteData.id || account.id,
    auth: {
      authType: displaySiteData.authType,
      userId: displaySiteData.userId,
      accessToken: displaySiteData.token,
      cookie: displaySiteData.cookieAuthSessionCookie,
    },
  }
}

export async function ensureAccountKeysForAvailableGroups(params: {
  account: SiteAccount
  displaySiteData: DisplaySiteData
  accountName: string
  siteUrlOrigin: string
}): Promise<AccountKeyCoverageResult> {
  const { account, displaySiteData, accountName, siteUrlOrigin } = params
  const service = getApiService(displaySiteData.siteType)
  const request = createAccountApiRequest(account, displaySiteData)

  const tokens = await service.fetchAccountTokens(request)
  let groups: string[]

  try {
    const groupsData = await service.fetchUserGroups(request)
    groups = Object.keys(groupsData)
      .map(normalizeGroupName)
      .filter(Boolean)
  } catch (error) {
    if (!isFeatureUnsupportedError(error)) {
      throw error
    }
    groups = []
  }

  const uniqueGroups = Array.from(new Set(groups))

  if (uniqueGroups.length === 0) {
    if (tokens.length > 0) {
      return {
        created: false,
        availableGroups: [],
        coveredGroups: [],
        createdGroups: [],
        missingGroups: [],
        invalidTokens: [],
      }
    }

    if (displaySiteData.siteType === SITE_TYPES.SUB2API) {
      throw new Error(t("messages:sub2api.createRequiresGroup"))
    }

    if (displaySiteData.siteType === SITE_TYPES.AIHUBMIX) {
      throw new Error(t("messages:aihubmix.createRequiresOneTimeKeyDialog"))
    }

    await service.createApiToken(request, generateDefaultTokenRequest())
    return {
      created: true,
      availableGroups: [],
      coveredGroups: [],
      createdGroups: [""],
      missingGroups: [],
      invalidTokens: [],
    }
  }

  const availableGroupSet = new Set(uniqueGroups)
  const coveredGroupSet = new Set<string>()
  const invalidTokens: AccountKeyRepairInvalidToken[] = []

  for (const token of tokens) {
    const group = normalizeGroupName(token.group)
    if (!group) continue
    if (availableGroupSet.has(group)) {
      coveredGroupSet.add(group)
      continue
    }

    invalidTokens.push({
      accountId: displaySiteData.id,
      accountName,
      siteType: displaySiteData.siteType,
      siteUrlOrigin,
      tokenId: token.id,
      tokenName: token.name,
      group,
      reason: "groupUnavailable",
    })
  }

  const createdGroups: string[] = []
  const missingGroups: string[] = []

  for (const group of uniqueGroups) {
    if (coveredGroupSet.has(group)) continue
    try {
      await service.createApiToken(request, buildGroupDefaultTokenRequest(group))
      coveredGroupSet.add(group)
      createdGroups.push(group)
    } catch (error) {
      missingGroups.push(group)
      const message = getErrorMessage(error)
      if (message) {
        invalidTokens.push({
          accountId: displaySiteData.id,
          accountName,
          siteType: displaySiteData.siteType,
          siteUrlOrigin,
          tokenId: -1,
          tokenName: group,
          group,
          reason: "groupUnavailable",
          errorMessage: message,
        })
      }
    }
  }

  return {
    created: createdGroups.length > 0,
    availableGroups: uniqueGroups,
    coveredGroups: uniqueGroups.filter((group) => coveredGroupSet.has(group)),
    createdGroups,
    missingGroups,
    invalidTokens: invalidTokens.filter((token) => token.tokenId >= 0),
  }
}

export async function deleteInvalidAccountToken(params: {
  token: AccountKeyRepairInvalidToken
  account: SiteAccount
  displaySiteData: DisplaySiteData
}): Promise<AccountKeyRepairDeleteInvalidTokensResult["deleted"][number]> {
  const { token, account, displaySiteData } = params
  const service = getApiService(displaySiteData.siteType)
  const request = createAccountApiRequest(account, displaySiteData)
  await service.deleteApiToken(request, token.tokenId)
  return {
    ...token,
    deletedAt: Date.now(),
  }
}
```

- [ ] **Step 5: Update repair runner to call the new helper**

In `src/services/accounts/accountKeyAutoProvisioning/repair.ts`, replace the import:

```ts
import {
  deleteInvalidAccountToken,
  ensureAccountKeysForAvailableGroups,
} from "./groupCoverage"
```

In `processEligibleAccount`, replace the call to `ensureDefaultApiTokenForAccount` with:

```ts
const result = await ensureAccountKeysForAvailableGroups({
  account,
  displaySiteData,
  accountName,
  siteUrlOrigin: originKey,
})

await this.recordResult({
  accountId: account.id,
  accountName,
  siteType: account.site_type,
  siteUrlOrigin: originKey,
  outcome: result.created ? "created" : "alreadyHad",
  availableGroups: result.availableGroups,
  coveredGroups: result.coveredGroups,
  createdGroups: result.createdGroups,
  missingGroups: result.missingGroups,
  invalidTokens: result.invalidTokens,
  finishedAt: Date.now(),
})
```

Update `recordResult` to increment optional summary counts:

```ts
const availableGroupCount = result.availableGroups?.length ?? 0
const coveredGroupCount = result.coveredGroups?.length ?? 0
const createdKeyCount = result.createdGroups?.length ?? 0
const invalidKeyCount = result.invalidTokens?.length ?? 0

return {
  ...prev,
  results: nextResults,
  summary: {
    ...nextSummary,
    availableGroups: (prev.summary.availableGroups ?? 0) + availableGroupCount,
    coveredGroups: (prev.summary.coveredGroups ?? 0) + coveredGroupCount,
    createdKeys: (prev.summary.createdKeys ?? 0) + createdKeyCount,
    invalidKeys: (prev.summary.invalidKeys ?? 0) + invalidKeyCount,
    deletedKeys: prev.summary.deletedKeys ?? 0,
    deleteFailed: prev.summary.deleteFailed ?? 0,
  },
  totals: {
    ...prev.totals,
    processedAccounts: isEligibleOutcome
      ? prev.totals.processedAccounts + 1
      : prev.totals.processedAccounts,
    processedEligibleAccounts: nextProcessedEligibleAccounts,
  },
}
```

- [ ] **Step 6: Update existing tests to mock the new helper**

Where existing tests expected `ensureDefaultApiTokenForAccount`, update expectations to `ensureAccountKeysForAvailableGroups`.

For created result mocks, return:

```ts
mocks.ensureAccountKeysForAvailableGroups.mockResolvedValueOnce({
  created: true,
  availableGroups: [],
  coveredGroups: [],
  createdGroups: [""],
  missingGroups: [],
  invalidTokens: [],
})
```

For already-had result mocks, return:

```ts
mocks.ensureAccountKeysForAvailableGroups.mockResolvedValueOnce({
  created: false,
  availableGroups: [],
  coveredGroups: [],
  createdGroups: [],
  missingGroups: [],
  invalidTokens: [],
})
```

- [ ] **Step 7: Run service tests**

Run:

```powershell
pnpm vitest run tests/services/accountKeyRepair.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit service helper**

```powershell
git add src/types/accountKeyAutoProvisioning.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts src/services/accounts/accountKeyAutoProvisioning/repair.ts tests/services/accountKeyRepair.test.ts
git commit -m "feat(key-management): audit group key coverage"
```

## Task 2: Add Typed Invalid-Key Delete Message

**Files:**
- Modify: `src/services/accounts/accountKeyAutoProvisioning/messaging.ts`
- Modify: `src/services/accounts/accountKeyAutoProvisioning/repair.ts`
- Test: `tests/services/accountKeyRepair.test.ts`

- [ ] **Step 1: Add failing delete message test**

Add this test to `tests/services/accountKeyRepair.test.ts`:

```ts
it("deletes selected invalid tokens serially and records partial failure", async () => {
  const account = buildSiteAccount({
    id: "new-api-1",
    site_type: "new-api",
    site_url: "https://relay.example.com",
    authType: AuthTypeEnum.AccessToken,
    disabled: false,
    account_info: {
      id: "101",
      access_token: "access-token",
      username: "valid",
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
  })
  const displayAccount = buildDisplaySiteData({
    id: account.id,
    name: "Relay Account",
    baseUrl: account.site_url,
    siteType: "new-api",
    authType: AuthTypeEnum.AccessToken,
    userId: "101",
    token: "access-token",
  })
  const invalidTokens = [
    {
      accountId: "new-api-1",
      accountName: "Relay Account",
      siteType: "new-api",
      siteUrlOrigin: "https://relay.example.com",
      tokenId: 9,
      tokenName: "old one",
      group: "old",
      reason: "groupUnavailable" as const,
    },
    {
      accountId: "new-api-1",
      accountName: "Relay Account",
      siteType: "new-api",
      siteUrlOrigin: "https://relay.example.com",
      tokenId: 10,
      tokenName: "old two",
      group: "old-2",
      reason: "groupUnavailable" as const,
    },
  ]

  mocks.getAllAccounts.mockResolvedValue([account])
  mocks.convertToDisplayData.mockReturnValue([displayAccount])
  mocks.deleteInvalidAccountToken
    .mockResolvedValueOnce({ ...invalidTokens[0], deletedAt: 123 })
    .mockRejectedValueOnce(new Error("delete boom"))

  const { deleteInvalidAccountTokens } = await import(
    "~/services/accounts/accountKeyAutoProvisioning/repair"
  )

  await expect(
    deleteInvalidAccountTokens({ tokens: invalidTokens }),
  ).resolves.toEqual({
    success: true,
    data: {
      deleted: [{ ...invalidTokens[0], deletedAt: 123 }],
      failed: [{ ...invalidTokens[1], errorMessage: "delete boom" }],
    },
  })

  expect(mocks.deleteInvalidAccountToken.mock.calls.map((call) => call[0].token.tokenId)).toEqual([9, 10])
})
```

- [ ] **Step 2: Run the failing delete test**

Run:

```powershell
pnpm vitest run tests/services/accountKeyRepair.test.ts -t "deletes selected invalid tokens"
```

Expected: FAIL because delete message/handler is not implemented.

- [ ] **Step 3: Extend messaging protocol**

In `src/services/accounts/accountKeyAutoProvisioning/messaging.ts`, import delete types:

```ts
import type {
  AccountKeyRepairDeleteInvalidTokensRequest,
  AccountKeyRepairDeleteInvalidTokensResult,
  AccountKeyRepairProgress,
} from "~/types/accountKeyAutoProvisioning"
```

Add message type:

```ts
DeleteInvalidTokens: "accountKeyRepair:deleteInvalidTokens",
```

Update protocol map:

```ts
[AccountKeyRepairMessageTypes.DeleteInvalidTokens](
  request: AccountKeyRepairDeleteInvalidTokensRequest,
): RuntimeMessageResponse<AccountKeyRepairDeleteInvalidTokensResult>
```

- [ ] **Step 4: Implement delete handler in repair service**

In `repair.ts`, export:

```ts
export async function deleteInvalidAccountTokens(
  request: AccountKeyRepairDeleteInvalidTokensRequest,
) {
  const allAccounts = await accountStorage.getAllAccounts()
  const displaySiteDataById = new Map(
    accountStorage
      .convertToDisplayData(allAccounts, allAccounts)
      .map((account) => [account.id, account] as const),
  )
  const accountById = new Map(allAccounts.map((account) => [account.id, account]))
  const deleted: AccountKeyRepairDeleteInvalidTokensResult["deleted"] = []
  const failed: AccountKeyRepairDeleteInvalidTokensResult["failed"] = []

  for (const token of request.tokens) {
    const account = accountById.get(token.accountId)
    const displaySiteData = displaySiteDataById.get(token.accountId)
    if (!account || !displaySiteData) {
      failed.push({
        ...token,
        errorMessage: "account_not_found",
      })
      continue
    }

    try {
      const result = await deleteInvalidAccountToken({
        token,
        account,
        displaySiteData,
      })
      deleted.push(result)
    } catch (error) {
      failed.push({
        ...token,
        errorMessage: getErrorMessage(error) || "delete_failed",
      })
    }
  }

  accountKeyRepairRunner.recordInvalidTokenDeletionResultForCurrentProgress({
    deleted,
    failed,
  })

  return { success: true as const, data: { deleted, failed } }
}
```

Expose a public method on `AccountKeyRepairRunner`:

```ts
async recordInvalidTokenDeletionResultForCurrentProgress(
  result: AccountKeyRepairDeleteInvalidTokensResult,
) {
  await this.queueProgressUpdate((prev) => {
    const deletedIds = new Set(result.deleted.map((token) => `${token.accountId}:${token.tokenId}`))
    return {
      ...prev,
      results: prev.results.map((accountResult) => ({
        ...accountResult,
        invalidTokens: accountResult.invalidTokens?.filter(
          (token) => !deletedIds.has(`${token.accountId}:${token.tokenId}`),
        ),
      })),
      summary: {
        ...prev.summary,
        invalidKeys: Math.max(
          0,
          (prev.summary.invalidKeys ?? 0) - result.deleted.length,
        ),
        deletedKeys: (prev.summary.deletedKeys ?? 0) + result.deleted.length,
        deleteFailed: (prev.summary.deleteFailed ?? 0) + result.failed.length,
      },
    }
  })
}
```

- [ ] **Step 5: Register delete message listener**

In `setupAccountKeyRepairMessagingListeners`, add:

```ts
onAccountKeyRepairMessage(
  AccountKeyRepairMessageTypes.DeleteInvalidTokens,
  async (request) => {
    try {
      return await deleteInvalidAccountTokens(request)
    } catch (error) {
      return toAccountKeyRepairFailure(error)
    }
  },
),
```

- [ ] **Step 6: Run service tests**

Run:

```powershell
pnpm vitest run tests/services/accountKeyRepair.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit delete message**

```powershell
git add src/types/accountKeyAutoProvisioning.ts src/services/accounts/accountKeyAutoProvisioning/messaging.ts src/services/accounts/accountKeyAutoProvisioning/repair.ts tests/services/accountKeyRepair.test.ts
git commit -m "feat(key-management): delete invalid group keys"
```

## Task 3: Make Dialog Manual-Start And Rename Entry Point

**Files:**
- Modify: `src/features/KeyManagement/KeyManagement.tsx`
- Modify: `src/features/KeyManagement/components/Header.tsx`
- Modify: `src/features/KeyManagement/components/RepairMissingKeysDialog.tsx`
- Modify: `src/locales/zh-CN/keyManagement.json`
- Modify: `src/locales/en/keyManagement.json`
- Modify: `src/locales/ja/keyManagement.json`
- Modify: `src/locales/vi/keyManagement.json`
- Modify: `src/locales/zh-TW/keyManagement.json`
- Test: `tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx`

- [ ] **Step 1: Add failing manual-start UI test**

In `tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx`, update the first test or add a new one:

```tsx
it("opens the key check dialog without starting until the user confirms", async () => {
  sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
    if (message === AccountKeyRepairMessageTypes.GetProgress) {
      return { success: true, data: idleProgress }
    }
    if (message === AccountKeyRepairMessageTypes.Start) {
      return { success: true, data: startProgress }
    }
    return { success: false }
  })

  render(<KeyManagement />)

  fireEvent.click(
    await screen.findByRole("button", {
      name: "keyManagement:repairMissingKeys.action",
    }),
  )

  expect(
    screen.getByText("keyManagement:repairMissingKeys.initialNotice"),
  ).toBeInTheDocument()
  expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
    AccountKeyRepairMessageTypes.GetProgress,
    undefined,
  )
  expect(sendRuntimeActionMessageMock).not.toHaveBeenCalledWith(
    AccountKeyRepairMessageTypes.Start,
    undefined,
  )

  fireEvent.click(
    screen.getByRole("button", {
      name: "keyManagement:repairMissingKeys.actions.start",
    }),
  )

  await waitFor(() => {
    expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
      AccountKeyRepairMessageTypes.Start,
      undefined,
    )
  })
})
```

- [ ] **Step 2: Run failing UI test**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx -t "opens the key check dialog"
```

Expected: FAIL because opening currently starts the repair.

- [ ] **Step 3: Stop auto-starting from the header button**

In `src/features/KeyManagement/KeyManagement.tsx`, change:

```ts
const handleRepairMissingKeys = () => {
  setRepairStartOnOpen(true)
  setIsRepairOpen(true)
}
```

to:

```ts
const handleRepairMissingKeys = () => {
  setRepairStartOnOpen(false)
  setIsRepairOpen(true)
}
```

Keep the existing page-load running-job recovery as:

```ts
if (response.data.state === "running") {
  setRepairStartOnOpen(false)
  setIsRepairOpen(true)
}
```

- [ ] **Step 4: Add explicit start action to dialog**

In `RepairMissingKeysDialog.tsx`, add:

```ts
const [isStarting, setIsStarting] = useState(false)

const handleStartAudit = async () => {
  setIsStarting(true)
  setError("")
  try {
    const response = await sendAccountKeyRepairMessage(
      AccountKeyRepairMessageTypes.Start,
    )
    if (response?.success && response.data) {
      startedAnalyticsJobIdRef.current = response.data.jobId
      void trackProductAnalyticsActionStarted(repairMissingKeysAnalyticsContext)
      setProgress(response.data)
      return
    }

    void trackProductAnalyticsActionCompleted({
      ...repairMissingKeysAnalyticsContext,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      insights: getRepairStartFailureInsights(
        progressRef.current,
        accountsRef.current,
      ),
    })
    setError(t("repairMissingKeys.messages.startFailed"))
  } catch {
    void trackProductAnalyticsActionCompleted({
      ...repairMissingKeysAnalyticsContext,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      insights: getRepairStartFailureInsights(
        progressRef.current,
        accountsRef.current,
      ),
    })
    setError(t("repairMissingKeys.messages.startFailed"))
  } finally {
    setIsStarting(false)
  }
}
```

Replace the `startOnOpen` effect body with:

```ts
if (isOpen && startOnOpen) {
  void handleStartAudit()
}
```

Render the initial state when progress is idle:

```tsx
{!progress || progress.state === "idle" ? (
  <Card>
    <CardContent padding="md" className="space-y-3">
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {t("repairMissingKeys.initialNotice")}
      </p>
      <Alert description={t("repairMissingKeys.remoteWriteNotice")} />
      <Button
        type="button"
        onClick={() => void handleStartAudit()}
        loading={isStarting}
      >
        {t("repairMissingKeys.actions.start")}
      </Button>
    </CardContent>
  </Card>
) : null}
```

- [ ] **Step 5: Update locale keys**

In every `src/locales/*/keyManagement.json`, add these keys under `repairMissingKeys`:

```json
{
  "action": "密钥检查",
  "title": "密钥覆盖检查",
  "description": "检查每个账号的可用分组，为缺少密钥的分组创建默认密钥，并列出分组不可用的异常密钥。",
  "initialNotice": "开始后会检查已保存账号的可用分组，并为缺少密钥的分组创建默认密钥。",
  "remoteWriteNotice": "此操作可能会在对应网站创建新密钥；不会自动删除任何密钥。",
  "actions": {
    "start": "开始检查并补齐",
    "rerun": "重新检查"
  }
}
```

Use localized equivalents in non-Chinese files while keeping the same key shape.

- [ ] **Step 6: Update old tests that assumed start-on-open**

In existing `KeyManagementRepairMissingKeys.test.tsx` tests, after opening the dialog, click the new start button before expecting `AccountKeyRepairMessageTypes.Start`:

```ts
fireEvent.click(
  screen.getByRole("button", {
    name: "keyManagement:repairMissingKeys.actions.start",
  }),
)
```

- [ ] **Step 7: Run UI test**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx
```

Expected: PASS.

- [ ] **Step 8: Run i18n staged check after locale edits**

Run:

```powershell
pnpm run i18n:extract:ci
```

Expected: PASS with no unexpected locale updates.

- [ ] **Step 9: Commit manual-start UI**

```powershell
git add src/features/KeyManagement/KeyManagement.tsx src/features/KeyManagement/components/Header.tsx src/features/KeyManagement/components/RepairMissingKeysDialog.tsx src/locales/zh-CN/keyManagement.json src/locales/en/keyManagement.json src/locales/ja/keyManagement.json src/locales/vi/keyManagement.json src/locales/zh-TW/keyManagement.json tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx
git commit -m "feat(key-management): require explicit key check start"
```

## Task 4: Add Account Coverage And Invalid-Key Views

**Files:**
- Modify: `src/features/KeyManagement/components/RepairMissingKeysDialog.tsx`
- Modify: `src/locales/*/keyManagement.json`
- Test: `tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx`

- [ ] **Step 1: Add failing view-switch test**

Add test data:

```ts
const coverageProgress: AccountKeyRepairProgress = {
  jobId: "job-coverage",
  state: "completed",
  startedAt: 1,
  updatedAt: 2,
  finishedAt: 2,
  totals: {
    enabledAccounts: 1,
    eligibleAccounts: 1,
    processedAccounts: 1,
    processedEligibleAccounts: 1,
  },
  summary: {
    created: 1,
    alreadyHad: 0,
    skipped: 0,
    failed: 0,
    availableGroups: 2,
    coveredGroups: 2,
    createdKeys: 1,
    invalidKeys: 1,
  },
  results: [
    {
      accountId: "account-enabled",
      accountName: "Enabled Site",
      siteType: "new-api",
      siteUrlOrigin: "https://enabled.example.com",
      outcome: "created",
      availableGroups: ["default", "vip"],
      coveredGroups: ["default", "vip"],
      createdGroups: ["vip"],
      missingGroups: [],
      invalidTokens: [
        {
          accountId: "account-enabled",
          accountName: "Enabled Site",
          siteType: "new-api",
          siteUrlOrigin: "https://enabled.example.com",
          tokenId: 9,
          tokenName: "old group key",
          group: "old",
          reason: "groupUnavailable",
        },
      ],
      finishedAt: 2,
    },
  ],
}
```

Add test:

```tsx
it("switches between account coverage and invalid key views", async () => {
  sendRuntimeActionMessageMock.mockImplementation(async (message: any) => {
    if (message === AccountKeyRepairMessageTypes.GetProgress) {
      return { success: true, data: coverageProgress }
    }
    return { success: false }
  })

  render(<KeyManagement />)

  fireEvent.click(
    await screen.findByRole("button", {
      name: "keyManagement:repairMissingKeys.action",
    }),
  )

  expect(screen.getByRole("button", {
    name: "keyManagement:repairMissingKeys.views.accountCoverage",
  })).toHaveAttribute("aria-pressed", "true")
  expect(screen.getByText("vip")).toBeInTheDocument()
  expect(screen.queryByText("old group key")).not.toBeInTheDocument()

  fireEvent.click(screen.getByRole("button", {
    name: "keyManagement:repairMissingKeys.views.invalidKeys",
  }))

  expect(screen.getByText("old group key")).toBeInTheDocument()
  expect(screen.getByText("old")).toBeInTheDocument()
})
```

- [ ] **Step 2: Run failing view-switch test**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx -t "switches between account coverage"
```

Expected: FAIL because no view switch exists.

- [ ] **Step 3: Add view state and derived invalid tokens**

In `RepairMissingKeysDialog.tsx`, add:

```ts
type RepairResultView = "accountCoverage" | "invalidKeys"

const [activeView, setActiveView] =
  useState<RepairResultView>("accountCoverage")

const invalidTokens = useMemo(() => {
  return visibleResults.flatMap((result) => result.invalidTokens ?? [])
}, [visibleResults])
```

Reset on close:

```ts
if (!isOpen) {
  setSearchTerm("")
  setOutcomeFilter(null)
  setActiveView("accountCoverage")
}
```

- [ ] **Step 4: Render compact segmented view switch**

Add below summary cards:

```tsx
<div className="flex flex-wrap gap-2" role="group" aria-label={t("repairMissingKeys.views.label")}>
  {(["accountCoverage", "invalidKeys"] as const).map((view) => (
    <Button
      key={view}
      type="button"
      size="sm"
      variant={activeView === view ? "default" : "outline"}
      aria-pressed={activeView === view}
      onClick={() => setActiveView(view)}
    >
      {t(`repairMissingKeys.views.${view}`)}
      {view === "invalidKeys" && invalidTokens.length > 0 ? (
        <Badge variant="warning" size="sm" className="ml-2">
          {invalidTokens.length}
        </Badge>
      ) : null}
    </Button>
  ))}
</div>
```

- [ ] **Step 5: Render coverage details in account rows**

Inside account result rows, add details when present:

```tsx
{result.availableGroups ? (
  <div className="mt-2 flex flex-wrap gap-2 text-xs">
    <Badge variant="outline" size="sm">
      {t("repairMissingKeys.coverage.groupsCovered", {
        covered: result.coveredGroups?.length ?? 0,
        total: result.availableGroups.length,
      })}
    </Badge>
    {(result.createdGroups ?? []).map((group) => (
      <Badge key={group} variant="success" size="sm">
        {t("repairMissingKeys.coverage.createdGroup", { group })}
      </Badge>
    ))}
    {(result.missingGroups ?? []).map((group) => (
      <Badge key={group} variant="warning" size="sm">
        {t("repairMissingKeys.coverage.missingGroup", { group })}
      </Badge>
    ))}
  </div>
) : null}
```

- [ ] **Step 6: Render invalid-key list**

When `activeView === "invalidKeys"`, render:

```tsx
{invalidTokens.length === 0 ? (
  <EmptyState
    icon={<MagnifyingGlassIcon className="h-12 w-12" />}
    title={t("repairMissingKeys.invalidKeys.emptyTitle")}
    description={t("repairMissingKeys.invalidKeys.emptyDescription")}
    className="py-10"
  />
) : (
  <ul className="dark:divide-dark-bg-tertiary divide-y">
    {invalidTokens.map((token) => (
      <li key={`${token.accountId}-${token.tokenId}`} className="px-4 py-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <div className="truncate text-sm font-medium">{token.tokenName}</div>
            <div className="dark:text-dark-text-secondary truncate text-xs text-gray-500">
              {token.accountName} · {token.siteUrlOrigin}
            </div>
            <div className="text-xs text-amber-700 dark:text-amber-300">
              {t("repairMissingKeys.invalidKeys.groupUnavailable", {
                group: token.group,
              })}
            </div>
          </div>
          <Badge variant="warning" size="sm" className="shrink-0">
            {t("repairMissingKeys.invalidKeys.badge")}
          </Badge>
        </div>
      </li>
    ))}
  </ul>
)}
```

- [ ] **Step 7: Add locale keys**

Under `repairMissingKeys`, add:

```json
"views": {
  "label": "结果视图",
  "accountCoverage": "账号覆盖",
  "invalidKeys": "异常密钥"
},
"coverage": {
  "groupsCovered": "已覆盖 {{covered}}/{{total}} 个分组",
  "createdGroup": "已创建：{{group}}",
  "missingGroup": "未补齐：{{group}}"
},
"invalidKeys": {
  "badge": "异常",
  "emptyTitle": "没有异常密钥",
  "emptyDescription": "本次检查未发现分组不可用的密钥。",
  "groupUnavailable": "分组 {{group}} 当前不可用"
}
```

Update sibling locales with the same key shape.

- [ ] **Step 8: Run UI and i18n checks**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx
pnpm run i18n:extract:ci
```

Expected: PASS.

- [ ] **Step 9: Commit view split**

```powershell
git add src/features/KeyManagement/components/RepairMissingKeysDialog.tsx src/locales/zh-CN/keyManagement.json src/locales/en/keyManagement.json src/locales/ja/keyManagement.json src/locales/vi/keyManagement.json src/locales/zh-TW/keyManagement.json tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx
git commit -m "feat(key-management): split audit result views"
```

## Task 5: Add Invalid-Key Selection And Batch Delete UI

**Files:**
- Modify: `src/features/KeyManagement/components/RepairMissingKeysDialog.tsx`
- Modify: `src/locales/*/keyManagement.json`
- Test: `tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx`

- [ ] **Step 1: Add failing batch-delete UI test**

Add:

```tsx
it("deletes selected invalid keys after destructive confirmation", async () => {
  sendRuntimeActionMessageMock.mockImplementation(async (message: any, data: any) => {
    if (message === AccountKeyRepairMessageTypes.GetProgress) {
      return { success: true, data: coverageProgress }
    }
    if (message === AccountKeyRepairMessageTypes.DeleteInvalidTokens) {
      return {
        success: true,
        data: {
          deleted: [{ ...data.tokens[0], deletedAt: 123 }],
          failed: [],
        },
      }
    }
    return { success: false }
  })

  render(<KeyManagement />)

  fireEvent.click(
    await screen.findByRole("button", {
      name: "keyManagement:repairMissingKeys.action",
    }),
  )
  fireEvent.click(screen.getByRole("button", {
    name: "keyManagement:repairMissingKeys.views.invalidKeys",
  }))
  fireEvent.click(screen.getByRole("checkbox", {
    name: "old group key",
  }))

  fireEvent.click(screen.getByRole("button", {
    name: "keyManagement:repairMissingKeys.invalidKeys.deleteSelected",
  }))

  expect(screen.getByText("keyManagement:repairMissingKeys.deleteConfirm.description")).toBeInTheDocument()

  fireEvent.click(screen.getByTestId("repair-invalid-keys-confirm-delete"))

  await waitFor(() => {
    expect(sendRuntimeActionMessageMock).toHaveBeenCalledWith(
      AccountKeyRepairMessageTypes.DeleteInvalidTokens,
      {
        tokens: [
          expect.objectContaining({
            tokenId: 9,
            tokenName: "old group key",
          }),
        ],
      },
    )
  })
})
```

- [ ] **Step 2: Run failing batch-delete UI test**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx -t "deletes selected invalid keys"
```

Expected: FAIL because selection and delete UI do not exist.

- [ ] **Step 3: Add selection state**

In `RepairMissingKeysDialog.tsx`, import `Checkbox` and `DestructiveConfirmDialog` from shared UI.

Add:

```ts
const [selectedInvalidTokenKeys, setSelectedInvalidTokenKeys] = useState<Set<string>>(
  () => new Set(),
)
const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false)
const [isDeletingInvalidKeys, setIsDeletingInvalidKeys] = useState(false)
const [deleteResultMessage, setDeleteResultMessage] = useState("")

const getInvalidTokenKey = (token: AccountKeyRepairInvalidToken) =>
  `${token.accountId}:${token.tokenId}`

const selectedInvalidTokens = useMemo(() => {
  return invalidTokens.filter((token) =>
    selectedInvalidTokenKeys.has(getInvalidTokenKey(token)),
  )
}, [invalidTokens, selectedInvalidTokenKeys])
```

- [ ] **Step 4: Add invalid-key toolbar controls**

Above the invalid-key list, render:

```tsx
<div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
  <label className="flex items-center gap-2 text-sm">
    <Checkbox
      checked={
        invalidTokens.length > 0 &&
        selectedInvalidTokens.length === invalidTokens.length
      }
      onCheckedChange={(checked) => {
        setSelectedInvalidTokenKeys(
          checked
            ? new Set(invalidTokens.map(getInvalidTokenKey))
            : new Set(),
        )
      }}
      aria-label={t("repairMissingKeys.invalidKeys.selectAll")}
    />
    {t("repairMissingKeys.invalidKeys.selectAll")}
  </label>
  <div className="flex items-center gap-2">
    <span className="text-xs text-gray-500 dark:text-gray-400">
      {t("repairMissingKeys.invalidKeys.selectedCount", {
        count: selectedInvalidTokens.length,
      })}
    </span>
    <Button
      type="button"
      size="sm"
      variant="destructive"
      disabled={selectedInvalidTokens.length === 0}
      onClick={() => setIsDeleteConfirmOpen(true)}
    >
      {t("repairMissingKeys.invalidKeys.deleteSelected")}
    </Button>
  </div>
</div>
```

- [ ] **Step 5: Add per-row checkboxes**

Inside each invalid-key row:

```tsx
<Checkbox
  checked={selectedInvalidTokenKeys.has(getInvalidTokenKey(token))}
  onCheckedChange={(checked) => {
    const key = getInvalidTokenKey(token)
    setSelectedInvalidTokenKeys((prev) => {
      const next = new Set(prev)
      if (checked) {
        next.add(key)
      } else {
        next.delete(key)
      }
      return next
    })
  }}
  aria-label={token.tokenName}
/>
```

- [ ] **Step 6: Add destructive confirmation and delete handler**

Add:

```ts
const handleConfirmDeleteInvalidKeys = async () => {
  if (selectedInvalidTokens.length === 0) return
  setIsDeletingInvalidKeys(true)
  setDeleteResultMessage("")
  try {
    const response = await sendAccountKeyRepairMessage(
      AccountKeyRepairMessageTypes.DeleteInvalidTokens,
      { tokens: selectedInvalidTokens },
    )
    if (!response?.success || !response.data) {
      setDeleteResultMessage(t("repairMissingKeys.invalidKeys.deleteFailed"))
      return
    }

    const deletedKeys = new Set(response.data.deleted.map(getInvalidTokenKey))
    setSelectedInvalidTokenKeys((prev) => {
      const next = new Set(prev)
      for (const key of deletedKeys) next.delete(key)
      return next
    })
    setProgress((current) => {
      if (!current) return current
      return {
        ...current,
        results: current.results.map((result) => ({
          ...result,
          invalidTokens: result.invalidTokens?.filter(
            (token) => !deletedKeys.has(getInvalidTokenKey(token)),
          ),
        })),
        summary: {
          ...current.summary,
          invalidKeys: Math.max(
            0,
            (current.summary.invalidKeys ?? 0) - response.data.deleted.length,
          ),
          deletedKeys:
            (current.summary.deletedKeys ?? 0) + response.data.deleted.length,
          deleteFailed:
            (current.summary.deleteFailed ?? 0) + response.data.failed.length,
        },
      }
    })
    setDeleteResultMessage(
      response.data.failed.length > 0
        ? t("repairMissingKeys.invalidKeys.deletePartial", {
            deleted: response.data.deleted.length,
            failed: response.data.failed.length,
          })
        : t("repairMissingKeys.invalidKeys.deleteSuccess", {
            count: response.data.deleted.length,
          }),
    )
    setIsDeleteConfirmOpen(false)
  } finally {
    setIsDeletingInvalidKeys(false)
  }
}
```

Render:

```tsx
<DestructiveConfirmDialog
  isOpen={isDeleteConfirmOpen}
  onClose={() => setIsDeleteConfirmOpen(false)}
  title={t("repairMissingKeys.deleteConfirm.title", {
    count: selectedInvalidTokens.length,
  })}
  description={t("repairMissingKeys.deleteConfirm.description")}
  cancelLabel={t("common:actions.cancel")}
  confirmLabel={t("repairMissingKeys.deleteConfirm.confirm")}
  confirmButtonTestId="repair-invalid-keys-confirm-delete"
  isWorking={isDeletingInvalidKeys}
  size="md"
  details={
    <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-gray-600 dark:text-gray-400">
      {selectedInvalidTokens.slice(0, 5).map((token) => (
        <li key={getInvalidTokenKey(token)}>
          {token.tokenName} · {token.accountName}
        </li>
      ))}
      {selectedInvalidTokens.length > 5 ? (
        <li>
          {t("repairMissingKeys.deleteConfirm.more", {
            count: selectedInvalidTokens.length - 5,
          })}
        </li>
      ) : null}
    </ul>
  }
  onConfirm={() => void handleConfirmDeleteInvalidKeys()}
/>
```

- [ ] **Step 7: Add locale keys**

Under `repairMissingKeys.invalidKeys`, add:

```json
"selectAll": "全选当前结果",
"selectedCount": "已选择 {{count}} 个异常密钥",
"deleteSelected": "删除所选",
"deleteSuccess": "已删除 {{count}} 个异常密钥",
"deletePartial": "已删除 {{deleted}} 个，{{failed}} 个删除失败",
"deleteFailed": "删除异常密钥失败"
```

Under `repairMissingKeys`, add:

```json
"deleteConfirm": {
  "title": "删除 {{count}} 个异常密钥？",
  "description": "这些密钥会同时从对应网站删除，无法通过扩展恢复。请确认它们的分组已不再使用。",
  "confirm": "删除所选密钥",
  "more": "以及另外 {{count}} 个"
}
```

Update sibling locales with the same key shape.

- [ ] **Step 8: Run UI and i18n checks**

Run:

```powershell
pnpm vitest run tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx
pnpm run i18n:extract:ci
```

Expected: PASS.

- [ ] **Step 9: Commit invalid-key delete UI**

```powershell
git add src/features/KeyManagement/components/RepairMissingKeysDialog.tsx src/locales/zh-CN/keyManagement.json src/locales/en/keyManagement.json src/locales/ja/keyManagement.json src/locales/vi/keyManagement.json src/locales/zh-TW/keyManagement.json tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx
git commit -m "feat(key-management): confirm batch invalid key deletion"
```

## Task 6: Analytics And Final Validation

**Files:**
- Modify: `src/services/productAnalytics/events.ts`
- Modify: `src/services/productAnalytics/privacy.ts`
- Modify: `src/features/KeyManagement/components/RepairMissingKeysDialog.tsx`
- Test: `tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx`

- [ ] **Step 1: Decide whether a new analytics action id is needed**

If batch invalid-key deletion currently completes under `RepairMissingAccountKeys`, add a separate action id.

In `src/services/productAnalytics/events.ts`, add:

```ts
DeleteInvalidAccountTokens: "delete_invalid_account_tokens",
```

No new privacy allow-list entries are required if the implementation only uses existing insight fields:

- `itemCount`
- `selectedCount`
- `successCount`
- `failureCount`
- `statusKind`

- [ ] **Step 2: Track invalid-key delete completion**

In `RepairMissingKeysDialog.tsx`, add context:

```ts
const deleteInvalidKeysAnalyticsContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.KeyManagement,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.DeleteInvalidAccountTokens,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsKeyManagementRepairDialog,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
}
```

At delete start:

```ts
void trackProductAnalyticsActionStarted(deleteInvalidKeysAnalyticsContext)
```

At delete completion:

```ts
void trackProductAnalyticsActionCompleted({
  ...deleteInvalidKeysAnalyticsContext,
  result:
    response.data.failed.length > 0
      ? PRODUCT_ANALYTICS_RESULTS.Failure
      : PRODUCT_ANALYTICS_RESULTS.Success,
  insights: {
    itemCount: selectedInvalidTokens.length,
    selectedCount: selectedInvalidTokens.length,
    successCount: response.data.deleted.length,
    failureCount: response.data.failed.length,
    statusKind:
      response.data.failed.length > 0
        ? PRODUCT_ANALYTICS_STATUS_KINDS.Warning
        : PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
  },
})
```

On thrown/immediate failure:

```ts
void trackProductAnalyticsActionCompleted({
  ...deleteInvalidKeysAnalyticsContext,
  result: PRODUCT_ANALYTICS_RESULTS.Failure,
  errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
  insights: {
    itemCount: selectedInvalidTokens.length,
    selectedCount: selectedInvalidTokens.length,
    successCount: 0,
    failureCount: selectedInvalidTokens.length,
    statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Error,
  },
})
```

- [ ] **Step 3: Add analytics test**

In `KeyManagementRepairMissingKeys.test.tsx`, extend the batch-delete test:

```ts
await waitFor(() => {
  expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledWith(
    expect.objectContaining({
      actionId: "delete_invalid_account_tokens",
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: expect.objectContaining({
        itemCount: 1,
        selectedCount: 1,
        successCount: 1,
        failureCount: 0,
      }),
    }),
  )
})
```

- [ ] **Step 4: Run focused tests**

Run:

```powershell
pnpm vitest run tests/services/accountKeyRepair.test.ts tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Run related tests**

Run:

```powershell
pnpm vitest related --run src/services/accounts/accountKeyAutoProvisioning/repair.ts src/services/accounts/accountKeyAutoProvisioning/groupCoverage.ts src/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken.ts src/features/KeyManagement/components/RepairMissingKeysDialog.tsx src/features/KeyManagement/KeyManagement.tsx
```

Expected: PASS.

- [ ] **Step 6: Run i18n validation**

Run:

```powershell
pnpm run i18n:extract:ci
```

Expected: PASS.

- [ ] **Step 7: Run commit gate**

Stage only task-scoped files:

```powershell
git add src/services/accounts/accountKeyAutoProvisioning src/types/accountKeyAutoProvisioning.ts src/features/KeyManagement src/locales/zh-CN/keyManagement.json src/locales/en/keyManagement.json src/locales/ja/keyManagement.json src/locales/vi/keyManagement.json src/locales/zh-TW/keyManagement.json src/services/productAnalytics/events.ts src/services/productAnalytics/privacy.ts tests/services/accountKeyRepair.test.ts tests/entrypoints/options/KeyManagementRepairMissingKeys.test.tsx
pnpm run validate:staged
```

Expected: PASS.

- [ ] **Step 8: Commit final analytics/validation cleanup**

```powershell
git commit -m "chore(key-management): validate key coverage audit"
```

## Self-Review Notes

- Spec coverage:
  - Manual start: Task 3.
  - Existing dialog shell reuse: Tasks 3-5.
  - Group-aware coverage and invalid-token detection: Task 1.
  - Bulk invalid-key deletion with explicit confirmation: Tasks 2 and 5.
  - Serial deletion: Task 2 service handler.
  - Unsupported site boundaries: Task 1 tests and helper behavior.
  - Privacy-safe telemetry: Task 6.
  - No new sidebar/page-level tab/scheduler: preserved by all UI tasks.

- E2E decision:
  - No E2E is planned. This feature's first-version risks are service branching,
    dialog state, confirmation copy, and partial success, all covered by focused
    Vitest and Testing Library tests.

- Implementation guardrails:
  - Do not add a new concurrency setting.
  - Do not make the header button start the audit.
  - Do not automatically delete invalid keys.
  - Do not record key names, group names, token ids, account ids, URLs, origins,
    or backend error text in analytics.
