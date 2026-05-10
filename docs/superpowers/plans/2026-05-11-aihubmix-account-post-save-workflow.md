# AIHubMix Account Post-Save Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make add-account "configure to managed site" run a foreground token-preparation workflow so AIHubMix one-time keys and Sub2API group selection are handled in UI before opening managed-site channel setup.

**Architecture:** Add a focused account token workflow module with constants, result types, and a pure foreground helper. Keep account persistence in `validateAndSaveAccount`, then orchestrate post-save steps in `AccountDialog` using existing `OneTimeApiKeyDialog`, `AddTokenDialog`, and `ChannelDialog` paths. Avoid magic strings by using exported constants for workflow steps, result kinds, error codes, and existing `SITE_TYPES` values.

**Tech Stack:** TypeScript, React, WXT, Vitest, Testing Library, i18next locale JSON, existing account/managed-site service modules.

---

## File Structure

- Create `src/services/accounts/accountPostSaveWorkflow/constants.ts`
  - Exports workflow step constants, result-kind constants, error-code constants, and derived TypeScript types.
- Create `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
  - Exports the foreground helper that checks existing keys, creates default keys, preserves AIHubMix full secrets, and returns structured results.
- Create `src/services/accounts/accountPostSaveWorkflow/index.ts`
  - Barrel export for the new workflow module.
- Modify `src/services/accounts/accountOperations.ts`
  - Add `ValidateAndSaveAccountOptions` and make `validateAndSaveAccount` optionally skip background auto-provisioning.
- Modify `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
  - Add post-save workflow state, token workflow orchestration, one-time-token state, Sub2API resume callback, and pass ensured tokens to `openWithAccount`.
- Modify `src/features/AccountManagement/components/AccountDialog/index.tsx`
  - Render `AddTokenDialog` for foreground Sub2API group selection and `OneTimeApiKeyDialog` for AIHubMix one-time keys.
- Modify `src/features/AccountManagement/components/AccountDialog/ActionButtons.tsx`
  - Show phase-specific quick-config loading text using workflow step constants mapped to i18n keys.
- Modify locale files:
  - `src/locales/zh-CN/accountDialog.json`
  - `src/locales/zh-TW/accountDialog.json`
  - `src/locales/en/accountDialog.json`
  - `src/locales/ja/accountDialog.json`
- Test files:
  - `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`
  - `tests/services/accountOperations.validateAndSaveAccount.test.ts`
  - `tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx`
  - `tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx`

---

### Task 1: Add Workflow Constants And Token Helper

**Files:**
- Create: `src/services/accounts/accountPostSaveWorkflow/constants.ts`
- Create: `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`
- Create: `src/services/accounts/accountPostSaveWorkflow/index.ts`
- Test: `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts`

- [ ] **Step 1: Write failing tests for the foreground token helper**

Create `tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts` with this complete content:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES,
  ENSURE_ACCOUNT_TOKEN_RESULT_KINDS,
  ensureAccountTokenForPostSaveWorkflow,
} from "~/services/accounts/accountPostSaveWorkflow"
import { DEFAULT_AUTO_PROVISION_TOKEN_NAME } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import { AuthTypeEnum, type ApiToken, type DisplaySiteData } from "~/types"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

const { fetchAccountTokensMock, createApiTokenMock, fetchUserGroupsMock } =
  vi.hoisted(() => ({
    fetchAccountTokensMock: vi.fn(),
    createApiTokenMock: vi.fn(),
    fetchUserGroupsMock: vi.fn(),
  }))

vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: vi.fn(() => ({
      fetchAccountTokens: (...args: unknown[]) =>
        fetchAccountTokensMock(...args),
      createApiToken: (...args: unknown[]) => createApiTokenMock(...args),
      fetchUserGroups: (...args: unknown[]) => fetchUserGroupsMock(...args),
    })),
  }
})

const buildToken = (overrides: Partial<ApiToken> = {}): ApiToken => ({
  id: 1,
  user_id: 7,
  key: "sk-existing",
  status: 1,
  name: "existing",
  created_time: 1,
  accessed_time: 1,
  expired_time: -1,
  remain_quota: -1,
  unlimited_quota: true,
  used_quota: 0,
  ...overrides,
})

const buildDisplayAccount = (
  overrides: Partial<DisplaySiteData> = {},
): DisplaySiteData =>
  ({
    id: "account-id",
    name: "Account",
    username: "user",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    health: { status: "healthy" },
    siteType: SITE_TYPES.NEW_API,
    baseUrl: "https://api.example.com",
    token: "access-token",
    userId: 7,
    authType: AuthTypeEnum.AccessToken,
    checkIn: { enableDetection: false },
    cookieAuthSessionCookie: "",
    ...overrides,
  }) as DisplaySiteData

const buildStoredAccount = (
  displayAccount: DisplaySiteData = buildDisplayAccount(),
) =>
  buildSiteAccount({
    id: displayAccount.id,
    site_name: displayAccount.name,
    site_url: displayAccount.baseUrl,
    site_type: displayAccount.siteType,
    authType: displayAccount.authType,
    account_info: {
      id: displayAccount.userId,
      access_token: displayAccount.token,
      username: displayAccount.username,
      quota: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
  })

describe("ensureAccountTokenForPostSaveWorkflow", () => {
  beforeEach(() => {
    fetchAccountTokensMock.mockReset()
    createApiTokenMock.mockReset()
    fetchUserGroupsMock.mockReset()
  })

  it("returns a ready result when the account already has a token", async () => {
    const displayAccount = buildDisplayAccount()
    const account = buildStoredAccount(displayAccount)
    const existingToken = buildToken({ id: 5, key: "sk-ready" })
    fetchAccountTokensMock.mockResolvedValueOnce([existingToken])

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
      token: existingToken,
      created: false,
    })
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("creates a default token for ordinary accounts without existing tokens", async () => {
    const displayAccount = buildDisplayAccount()
    const account = buildStoredAccount(displayAccount)
    const createdToken = buildToken({ id: 6, key: "sk-created" })
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(createdToken)

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: false,
    })
    expect(createApiTokenMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: displayAccount.baseUrl,
        accountId: displayAccount.id,
      }),
      expect.objectContaining({
        name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
        group: "",
      }),
    )
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("creates an AIHubMix token and marks the full secret as one-time", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
      token: "aihubmix-access-token",
    })
    const account = buildStoredAccount(displayAccount)
    const createdToken = buildToken({
      id: 7,
      key: "sk-aihubmix-full-secret",
      name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
    })
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(createdToken)

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: true,
    })
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("blocks AIHubMix when creation does not return a usable full secret", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
    })
    const account = buildStoredAccount(displayAccount)
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(true)

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable,
      message: "messages:aihubmix.createRequiresOneTimeKeyDialog",
    })
    expect(fetchAccountTokensMock).toHaveBeenCalledTimes(1)
  })

  it("blocks AIHubMix when creation returns a masked key", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
    })
    const account = buildStoredAccount(displayAccount)
    fetchAccountTokensMock.mockResolvedValueOnce([])
    createApiTokenMock.mockResolvedValueOnce(
      buildToken({ id: 8, key: "sk-***masked***" }),
    )

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toMatchObject({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable,
    })
  })

  it("creates a Sub2API token directly when one current group exists", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
    })
    const account = buildStoredAccount(displayAccount)
    const createdToken = buildToken({ id: 9, key: "sk-sub2", group: "vip" })
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({ vip: { ratio: 1 } })
    createApiTokenMock.mockResolvedValueOnce(createdToken)

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: createdToken,
      created: true,
      oneTimeSecret: false,
    })
    expect(createApiTokenMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ group: "vip" }),
    )
  })

  it("requires Sub2API group selection when multiple current groups exist", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
    })
    const account = buildStoredAccount(displayAccount)
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({
      default: { ratio: 1 },
      vip: { ratio: 2 },
    })

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
      allowedGroups: ["default", "vip"],
    })
    expect(createApiTokenMock).not.toHaveBeenCalled()
  })

  it("blocks Sub2API when no current group is available", async () => {
    const displayAccount = buildDisplayAccount({
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
    })
    const account = buildStoredAccount(displayAccount)
    fetchAccountTokensMock.mockResolvedValueOnce([])
    fetchUserGroupsMock.mockResolvedValueOnce({})

    await expect(
      ensureAccountTokenForPostSaveWorkflow({
        account,
        displaySiteData: displayAccount,
      }),
    ).resolves.toEqual({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
      message: "messages:sub2api.createRequiresAvailableGroup",
    })
  })
})
```

- [ ] **Step 2: Run the helper test to verify it fails**

Run:

```bash
pnpm vitest --run tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
```

Expected: FAIL because `~/services/accounts/accountPostSaveWorkflow` does not exist.

- [ ] **Step 3: Add workflow constants**

Create `src/services/accounts/accountPostSaveWorkflow/constants.ts`:

```ts
import type { ApiToken } from "~/types"

export const ACCOUNT_POST_SAVE_WORKFLOW_STEPS = {
  Idle: "idle",
  SavingAccount: "saving_account",
  LoadingSavedAccount: "loading_saved_account",
  CheckingToken: "checking_token",
  CreatingToken: "creating_token",
  WaitingForOneTimeKeyAcknowledgement:
    "waiting_for_one_time_key_acknowledgement",
  WaitingForSub2ApiGroupSelection: "waiting_for_sub2api_group_selection",
  OpeningManagedSiteDialog: "opening_managed_site_dialog",
  Completed: "completed",
  Failed: "failed",
} as const

export type AccountPostSaveWorkflowStep =
  (typeof ACCOUNT_POST_SAVE_WORKFLOW_STEPS)[keyof typeof ACCOUNT_POST_SAVE_WORKFLOW_STEPS]

export const ENSURE_ACCOUNT_TOKEN_RESULT_KINDS = {
  Ready: "ready",
  Created: "created",
  Sub2ApiSelectionRequired: "sub2api_selection_required",
  Blocked: "blocked",
} as const

export type EnsureAccountTokenResultKind =
  (typeof ENSURE_ACCOUNT_TOKEN_RESULT_KINDS)[keyof typeof ENSURE_ACCOUNT_TOKEN_RESULT_KINDS]

export const ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES = {
  SavedAccountNotFound: "saved_account_not_found",
  TokenCreationFailed: "token_creation_failed",
  TokenSecretUnavailable: "token_secret_unavailable",
  ManagedSiteConfigMissing: "managed_site_config_missing",
  UserCancelled: "user_cancelled",
} as const

export type AccountPostSaveWorkflowErrorCode =
  (typeof ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES)[keyof typeof ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES]

export type EnsureAccountTokenResult =
  | {
      kind: typeof ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready
      token: ApiToken
      created: false
    }
  | {
      kind: typeof ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created
      token: ApiToken
      created: true
      oneTimeSecret: boolean
    }
  | {
      kind: typeof ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired
      allowedGroups: string[]
    }
  | {
      kind: typeof ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked
      code: AccountPostSaveWorkflowErrorCode
      message: string
    }
```

- [ ] **Step 4: Add the foreground token helper**

Create `src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts`:

```ts
import { SITE_TYPES } from "~/constants/siteType"
import {
  generateDefaultTokenRequest,
} from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  resolveSub2ApiQuickCreateResolution,
} from "~/services/accounts/accountOperations"
import {
  hasUsableApiTokenKey,
  isMaskedApiTokenKey,
} from "~/services/apiService/common/apiKey"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import { getApiService } from "~/services/apiService"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import { t } from "~/utils/i18n/core"

import {
  ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES,
  ENSURE_ACCOUNT_TOKEN_RESULT_KINDS,
  type EnsureAccountTokenResult,
} from "./constants"

const isCreatedApiToken = (value: unknown): value is ApiToken =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Partial<ApiToken>).id === "number" &&
  typeof (value as Partial<ApiToken>).key === "string"

const hasUsableFullTokenSecret = (token: ApiToken): boolean =>
  hasUsableApiTokenKey(token.key) && !isMaskedApiTokenKey(token.key)

const buildCreateRequest = (
  account: SiteAccount,
): ApiServiceRequest => ({
  baseUrl: account.site_url,
  accountId: account.id,
  auth: {
    authType: account.authType,
    userId: account.account_info.id,
    accessToken: account.account_info.access_token,
    cookie: account.cookieAuth?.sessionCookie,
  },
})

async function createDefaultToken(params: {
  account: SiteAccount
  displaySiteData: DisplaySiteData
  group?: string
}): Promise<ApiToken | null> {
  const { account, displaySiteData, group } = params
  const tokenData = generateDefaultTokenRequest()
  if (typeof group === "string") {
    tokenData.group = group
  }

  const created = await getApiService(displaySiteData.siteType).createApiToken(
    buildCreateRequest(account),
    tokenData,
  )

  return isCreatedApiToken(created) ? created : null
}

export async function ensureAccountTokenForPostSaveWorkflow(params: {
  account: SiteAccount
  displaySiteData: DisplaySiteData
}): Promise<EnsureAccountTokenResult> {
  const { account, displaySiteData } = params
  const service = getApiService(displaySiteData.siteType)
  const tokens = await service.fetchAccountTokens({
    baseUrl: displaySiteData.baseUrl,
    accountId: displaySiteData.id,
    auth: {
      authType: displaySiteData.authType,
      userId: displaySiteData.userId,
      accessToken: displaySiteData.token,
      cookie: displaySiteData.cookieAuthSessionCookie,
    },
  })

  const existingToken = Array.isArray(tokens) ? tokens.at(-1) : undefined
  if (existingToken) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
      token: existingToken,
      created: false,
    }
  }

  if (displaySiteData.siteType === SITE_TYPES.SUB2API) {
    const resolution = await resolveSub2ApiQuickCreateResolution(displaySiteData)

    if (resolution.kind === "blocked") {
      return {
        kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
        code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
        message: resolution.message,
      }
    }

    if (resolution.kind === "selection_required") {
      return {
        kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
        allowedGroups: resolution.allowedGroups,
      }
    }

    const token = await createDefaultToken({
      account,
      displaySiteData,
      group: resolution.group,
    })

    if (!token) {
      return {
        kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
        code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
        message: t("messages:accountOperations.createTokenFailed"),
      }
    }

    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token,
      created: true,
      oneTimeSecret: false,
    }
  }

  const token = await createDefaultToken({ account, displaySiteData })

  if (!token) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code:
        displaySiteData.siteType === SITE_TYPES.AIHUBMIX
          ? ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable
          : ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
      message:
        displaySiteData.siteType === SITE_TYPES.AIHUBMIX
          ? t("messages:aihubmix.createRequiresOneTimeKeyDialog")
          : t("messages:accountOperations.createTokenFailed"),
    }
  }

  if (
    displaySiteData.siteType === SITE_TYPES.AIHUBMIX &&
    !hasUsableFullTokenSecret(token)
  ) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable,
      message: t("messages:aihubmix.createRequiresOneTimeKeyDialog"),
    }
  }

  return {
    kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
    token,
    created: true,
    oneTimeSecret: displaySiteData.siteType === SITE_TYPES.AIHUBMIX,
  }
}
```

- [ ] **Step 5: Add the workflow barrel export**

Create `src/services/accounts/accountPostSaveWorkflow/index.ts`:

```ts
export * from "./constants"
export * from "./ensureAccountToken"
```

- [ ] **Step 6: Run the helper test to verify it passes**

Run:

```bash
pnpm vitest --run tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

Run:

```bash
git add src/services/accounts/accountPostSaveWorkflow tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
git commit -m "feat(accounts): add post-save token workflow"
```

Expected: commit succeeds.

---

### Task 2: Let Save Skip Background Auto-Provisioning

**Files:**
- Modify: `src/services/accounts/accountOperations.ts`
- Test: `tests/services/accountOperations.validateAndSaveAccount.test.ts`

- [ ] **Step 1: Add a failing save-option test**

In `tests/services/accountOperations.validateAndSaveAccount.test.ts`, add this test before the final `})` of `describe("accountOperations validateAndSaveAccount", ...)`:

```ts
  it("skips background auto-provisioning when requested by a foreground workflow", async () => {
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValueOnce({
      ...DEFAULT_PREFERENCES,
      autoProvisionKeyOnAccountAdd: true,
      showTodayCashflow: false,
    })
    fetchAccountDataMock.mockResolvedValueOnce({
      quota: 12,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
      checkIn: CHECK_IN_DISABLED,
    })

    const result = await validateAndSaveAccount(
      "https://api.example.com",
      "Example",
      "user",
      "token",
      "1",
      "7.0",
      "",
      [],
      CHECK_IN_DISABLED,
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
      undefined,
      false,
      undefined,
      { skipAutoProvisionKeyOnAccountAdd: true },
    )

    expect(result.success).toBe(true)
    expect(ensureDefaultApiTokenForAccountMock).not.toHaveBeenCalled()
  })
```

- [ ] **Step 2: Run the save test to verify it fails**

Run:

```bash
pnpm vitest --run tests/services/accountOperations.validateAndSaveAccount.test.ts
```

Expected: FAIL because `validateAndSaveAccount` does not accept the options argument or ignores it.

- [ ] **Step 3: Add the save options type and condition**

In `src/services/accounts/accountOperations.ts`, add this exported type near `type TagIdsInput`:

```ts
export interface ValidateAndSaveAccountOptions {
  skipAutoProvisionKeyOnAccountAdd?: boolean
}
```

Change the `validateAndSaveAccount` signature from:

```ts
  excludeFromTotalBalance = false,
  sub2apiAuth?: Sub2ApiAuthConfig,
): Promise<AccountSaveResponse> {
```

to:

```ts
  excludeFromTotalBalance = false,
  sub2apiAuth?: Sub2ApiAuthConfig,
  options: ValidateAndSaveAccountOptions = {},
): Promise<AccountSaveResponse> {
```

Replace both successful-save calls:

```ts
    void autoProvisionKeyOnAccountAdd(
      accountId,
      shouldAutoProvisionKeyOnAccountAdd,
    )
```

with:

```ts
    if (!options.skipAutoProvisionKeyOnAccountAdd) {
      void autoProvisionKeyOnAccountAdd(
        accountId,
        shouldAutoProvisionKeyOnAccountAdd,
      )
    }
```

There is one call in the fresh-data success path and one call in the fallback partial-save path.

- [ ] **Step 4: Run the save test to verify it passes**

Run:

```bash
pnpm vitest --run tests/services/accountOperations.validateAndSaveAccount.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add src/services/accounts/accountOperations.ts tests/services/accountOperations.validateAndSaveAccount.test.ts
git commit -m "feat(accounts): allow foreground save workflows"
```

Expected: commit succeeds.

---

### Task 3: Orchestrate Post-Save Workflow In AccountDialog Hook

**Files:**
- Modify: `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Modify: `tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx`

- [ ] **Step 1: Add failing hook tests for foreground quick-config**

In `tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx`, update the hoisted mocks:

```ts
const {
  mockToast,
  mockValidateAndSaveAccount,
  mockValidateAndUpdateAccount,
  mockOpenWithAccount,
  mockOpenSub2ApiTokenCreationDialog,
  mockGetManagedSiteConfig,
  mockOpenSettingsTab,
  mockEnsureAccountTokenForPostSaveWorkflow,
} = vi.hoisted(() => ({
  mockToast: vi.fn(),
  mockValidateAndSaveAccount: vi.fn(),
  mockValidateAndUpdateAccount: vi.fn(),
  mockOpenWithAccount: vi.fn(),
  mockOpenSub2ApiTokenCreationDialog: vi.fn(),
  mockGetManagedSiteConfig: vi.fn(),
  mockOpenSettingsTab: vi.fn().mockResolvedValue(undefined),
  mockEnsureAccountTokenForPostSaveWorkflow: vi.fn(),
}))
```

Add imports:

```ts
import {
  ACCOUNT_POST_SAVE_WORKFLOW_STEPS,
  ENSURE_ACCOUNT_TOKEN_RESULT_KINDS,
} from "~/services/accounts/accountPostSaveWorkflow"
import type { ApiToken, DisplaySiteData } from "~/types"
```

Add this mock after the existing account operations mock:

```ts
vi.mock("~/services/accounts/accountPostSaveWorkflow", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/accounts/accountPostSaveWorkflow")
    >()

  return {
    ...actual,
    ensureAccountTokenForPostSaveWorkflow:
      mockEnsureAccountTokenForPostSaveWorkflow,
  }
})
```

Add helpers inside the `describe` block after `renderEditHook`:

```ts
  const buildDisplayAccount = (
    overrides: Partial<DisplaySiteData> = {},
  ): DisplaySiteData =>
    ({
      id: "saved-account-id",
      name: "Saved Account",
      username: "saved-user",
      balance: { USD: 0, CNY: 0 },
      todayConsumption: { USD: 0, CNY: 0 },
      todayIncome: { USD: 0, CNY: 0 },
      todayTokens: { upload: 0, download: 0 },
      health: { status: SiteHealthStatus.Healthy },
      siteType: SITE_TYPES.NEW_API,
      baseUrl: "https://api.example.com",
      token: "saved-token",
      userId: 12,
      authType: AuthTypeEnum.AccessToken,
      checkIn: { enableDetection: false },
      cookieAuthSessionCookie: "",
      ...overrides,
    }) as DisplaySiteData

  const buildToken = (overrides: Partial<ApiToken> = {}): ApiToken => ({
    id: 101,
    user_id: 12,
    key: "sk-created",
    status: 1,
    name: "user group (auto)",
    created_time: 1,
    accessed_time: 1,
    expired_time: -1,
    remain_quota: -1,
    unlimited_quota: true,
    used_quota: 0,
    ...overrides,
  })
```

In `beforeEach`, add:

```ts
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValue({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
      token: buildToken(),
      created: false,
    })
```

Add these tests before the existing `"reports a missing saved account during auto-config..."` test:

```ts
  it("saves new accounts for quick-config with background auto-provisioning skipped and passes the ensured token to ChannelDialog", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "Saved Account",
      site_url: "https://api.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.NEW_API,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 12,
        username: "saved-user",
        access_token: "saved-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount()
    const ensuredToken = buildToken({ key: "sk-ready" })

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValueOnce({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
      token: ensuredToken,
      created: false,
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://api.example.com")
      result.current.setters.setSiteName("Saved Account")
      result.current.setters.setUsername("saved-user")
      result.current.setters.setAccessToken("saved-token")
      result.current.setters.setUserId("12")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.NEW_API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(mockValidateAndSaveAccount).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      expect.any(Object),
      SITE_TYPES.NEW_API,
      AuthTypeEnum.AccessToken,
      "",
      "",
      false,
      undefined,
      { skipAutoProvisionKeyOnAccountAdd: true },
    )
    expect(mockEnsureAccountTokenForPostSaveWorkflow).toHaveBeenCalledWith({
      account: savedSiteAccount,
      displaySiteData: savedDisplayData,
    })
    expect(mockOpenWithAccount).toHaveBeenCalledWith(
      savedDisplayData,
      ensuredToken,
      expect.any(Function),
    )
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Completed,
    )
  })

  it("stores an AIHubMix one-time token and waits before opening ChannelDialog", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "AIHubMix",
      site_url: "https://console.aihubmix.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.AIHUBMIX,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 13,
        username: "aihubmix-user",
        access_token: "aihubmix-access-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount({
      siteType: SITE_TYPES.AIHUBMIX,
      baseUrl: "https://aihubmix.com",
      token: "aihubmix-access-token",
      userId: 13,
    })
    const oneTimeToken = buildToken({
      id: 202,
      user_id: 13,
      key: "sk-aihubmix-full-secret",
    })

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValueOnce({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: oneTimeToken,
      created: true,
      oneTimeSecret: true,
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://aihubmix.com")
      result.current.setters.setSiteName("AIHubMix")
      result.current.setters.setUsername("aihubmix-user")
      result.current.setters.setAccessToken("aihubmix-access-token")
      result.current.setters.setUserId("13")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.AIHUBMIX)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(result.current.state.postSaveOneTimeToken).toEqual(oneTimeToken)
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForOneTimeKeyAcknowledgement,
    )
    expect(mockOpenWithAccount).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.handlers.handlePostSaveOneTimeTokenClose()
    })

    expect(mockOpenWithAccount).toHaveBeenCalledWith(
      savedDisplayData,
      oneTimeToken,
      expect.any(Function),
    )
  })

  it("opens Sub2API token selection and resumes quick-config after token creation", async () => {
    const savedSiteAccount = buildSiteAccount({
      id: "saved-account-id",
      site_name: "Sub2API",
      site_url: "https://sub2.example.com",
      health: { status: SiteHealthStatus.Healthy },
      site_type: SITE_TYPES.SUB2API,
      exchange_rate: 7,
      authType: AuthTypeEnum.AccessToken,
      account_info: {
        ...buildSiteAccount().account_info,
        id: 14,
        username: "sub-user",
        access_token: "jwt-token",
      },
    }) as SiteAccount
    const savedDisplayData = buildDisplayAccount({
      siteType: SITE_TYPES.SUB2API,
      baseUrl: "https://sub2.example.com",
      token: "jwt-token",
      userId: 14,
    })
    const createdToken = buildToken({
      id: 303,
      user_id: 14,
      key: "sk-sub2-created",
      group: "vip",
    })

    vi.spyOn(accountStorage, "getAccountById").mockResolvedValue(
      savedSiteAccount,
    )
    vi.spyOn(accountStorage, "getDisplayDataById").mockResolvedValue(
      savedDisplayData,
    )
    mockEnsureAccountTokenForPostSaveWorkflow.mockResolvedValueOnce({
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
      allowedGroups: ["default", "vip"],
    })

    const { result } = renderAddHook()

    await waitFor(() => {
      expect(result.current.state).toBeTruthy()
    })

    await act(async () => {
      result.current.setters.setUrl("https://sub2.example.com")
      result.current.setters.setSiteName("Sub2API")
      result.current.setters.setUsername("sub-user")
      result.current.setters.setAccessToken("jwt-token")
      result.current.setters.setUserId("14")
      result.current.setters.setExchangeRate("7")
      result.current.setters.setSiteType(SITE_TYPES.SUB2API)
    })

    await act(async () => {
      await result.current.handlers.handleAutoConfig()
    })

    expect(result.current.state.postSaveSub2ApiAllowedGroups).toEqual([
      "default",
      "vip",
    ])
    expect(result.current.state.accountPostSaveWorkflowStep).toBe(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForSub2ApiGroupSelection,
    )
    expect(mockOpenWithAccount).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.handlers.handlePostSaveSub2ApiTokenCreated(
        createdToken,
      )
    })

    expect(mockOpenWithAccount).toHaveBeenCalledWith(
      savedDisplayData,
      createdToken,
      expect.any(Function),
    )
  })
```

- [ ] **Step 2: Run the hook tests to verify they fail**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx
```

Expected: FAIL because `useAccountDialog` does not expose the new workflow state or handlers.

- [ ] **Step 3: Import the workflow helper and constants in the hook**

In `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`, add imports:

```ts
import {
  ACCOUNT_POST_SAVE_WORKFLOW_STEPS,
  ENSURE_ACCOUNT_TOKEN_RESULT_KINDS,
  ensureAccountTokenForPostSaveWorkflow,
  type AccountPostSaveWorkflowStep,
} from "~/services/accounts/accountPostSaveWorkflow"
import type { ApiToken } from "~/types"
```

If `ApiToken` is already imported from `~/types`, merge it into the existing type import.

- [ ] **Step 4: Add workflow state and refs**

Near existing `isAutoConfiguring` state, add:

```ts
  const [accountPostSaveWorkflowStep, setAccountPostSaveWorkflowStep] =
    useState<AccountPostSaveWorkflowStep>(
      ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle,
    )
  const [postSaveOneTimeToken, setPostSaveOneTimeToken] =
    useState<ApiToken | null>(null)
  const [
    postSaveSub2ApiAllowedGroups,
    setPostSaveSub2ApiAllowedGroups,
  ] = useState<string[] | null>(null)
  const pendingPostSaveChannelRef = useRef<{
    displaySiteData: DisplaySiteData
    token?: ApiToken
  } | null>(null)
```

In `resetForm`, also reset them:

```ts
    setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
    setPostSaveOneTimeToken(null)
    setPostSaveSub2ApiAllowedGroups(null)
    pendingPostSaveChannelRef.current = null
```

- [ ] **Step 5: Add a helper that opens ChannelDialog from an ensured token**

Add this callback before `handleAutoConfig`:

```ts
  const openPostSaveManagedSiteDialog = useCallback(
    async (displaySiteData: DisplaySiteData, token: ApiToken) => {
      setAccountPostSaveWorkflowStep(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.OpeningManagedSiteDialog,
      )
      await openChannelDialog(displaySiteData, token, () => {
        if (onSuccess && targetAccountRef.current) {
          onSuccess(targetAccountRef.current)
        }
      })
      setAccountPostSaveWorkflowStep(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Completed,
      )
    },
    [onSuccess, openChannelDialog],
  )
```

- [ ] **Step 6: Add close/resume handlers**

Add these callbacks after `openPostSaveManagedSiteDialog`:

```ts
  const handlePostSaveOneTimeTokenClose = useCallback(async () => {
    setPostSaveOneTimeToken(null)
    const pending = pendingPostSaveChannelRef.current
    pendingPostSaveChannelRef.current = null
    if (!pending?.token) {
      setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
      return
    }

    await openPostSaveManagedSiteDialog(pending.displaySiteData, pending.token)
  }, [openPostSaveManagedSiteDialog])

  const handlePostSaveSub2ApiTokenCreated = useCallback(
    async (createdToken?: ApiToken) => {
      const pending = pendingPostSaveChannelRef.current
      setPostSaveSub2ApiAllowedGroups(null)

      if (!pending || !createdToken) {
        pendingPostSaveChannelRef.current = null
        setAccountPostSaveWorkflowStep(ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Idle)
        return
      }

      pendingPostSaveChannelRef.current = null
      await openPostSaveManagedSiteDialog(
        pending.displaySiteData,
        createdToken,
      )
    },
    [openPostSaveManagedSiteDialog],
  )
```

- [ ] **Step 7: Update `handleSaveAccount` options and save call**

Change the `handleSaveAccount` options type from:

```ts
  const handleSaveAccount = async (options?: {
    skipSub2ApiKeyPrompt?: boolean
  }) => {
```

to:

```ts
  const handleSaveAccount = async (options?: {
    skipSub2ApiKeyPrompt?: boolean
    skipAutoProvisionKeyOnAccountAdd?: boolean
  }) => {
```

Change the `validateAndSaveAccount(...)` call by adding the new final argument:

```ts
              sub2apiAuth,
              {
                skipAutoProvisionKeyOnAccountAdd:
                  options?.skipAutoProvisionKeyOnAccountAdd === true,
              },
```

Keep `validateAndUpdateAccount` unchanged.

- [ ] **Step 8: Replace the quick-config token path**

In `handleAutoConfig`, replace:

```ts
        targetAccount = (
          await handleSaveAccount({ skipSub2ApiKeyPrompt: true })
        ).accountId
```

with:

```ts
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.SavingAccount,
        )
        targetAccount = (
          await handleSaveAccount({
            skipSub2ApiKeyPrompt: true,
            skipAutoProvisionKeyOnAccountAdd: true,
          })
        ).accountId
```

After setting `targetAccountRef.current = targetAccount`, add step updates around loading:

```ts
      setAccountPostSaveWorkflowStep(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.LoadingSavedAccount,
      )
```

Replace the final `await openChannelDialog(displaySiteData, null, ...)` block with:

```ts
      if (typeof targetAccount !== "string") {
        await openChannelDialog(displaySiteData, null, () => {
          if (onSuccess && targetAccountRef.current) {
            onSuccess(targetAccountRef.current)
          }
        })
        setAccountPostSaveWorkflowStep(
          ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Completed,
        )
        return
      }

      setAccountPostSaveWorkflowStep(
        ACCOUNT_POST_SAVE_WORKFLOW_STEPS.CheckingToken,
      )
      const ensureResult = await ensureAccountTokenForPostSaveWorkflow({
        account: siteAccount,
        displaySiteData,
      })

      switch (ensureResult.kind) {
        case ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready:
        case ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created:
          if (
            ensureResult.kind === ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created &&
            ensureResult.oneTimeSecret
          ) {
            pendingPostSaveChannelRef.current = {
              displaySiteData,
              token: ensureResult.token,
            }
            setPostSaveOneTimeToken(ensureResult.token)
            setAccountPostSaveWorkflowStep(
              ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForOneTimeKeyAcknowledgement,
            )
            return
          }

          await openPostSaveManagedSiteDialog(displaySiteData, ensureResult.token)
          return
        case ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired:
          pendingPostSaveChannelRef.current = { displaySiteData }
          setPostSaveSub2ApiAllowedGroups(ensureResult.allowedGroups)
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForSub2ApiGroupSelection,
          )
          return
        case ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked:
          toast.error(ensureResult.message)
          setAccountPostSaveWorkflowStep(
            ACCOUNT_POST_SAVE_WORKFLOW_STEPS.Failed,
          )
          return
      }
```

- [ ] **Step 9: Expose workflow state and handlers from the hook**

In the returned `state`, add:

```ts
      accountPostSaveWorkflowStep,
      postSaveOneTimeToken,
      postSaveSub2ApiAllowedGroups,
```

In the returned `handlers`, add:

```ts
      handlePostSaveOneTimeTokenClose,
      handlePostSaveSub2ApiTokenCreated,
```

- [ ] **Step 10: Run the hook tests**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx
```

Expected: PASS after addressing any TypeScript import collisions.

- [ ] **Step 11: Commit Task 3**

Run:

```bash
git add src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx
git commit -m "feat(accounts): orchestrate post-save quick config"
```

Expected: commit succeeds.

---

### Task 4: Render Foreground Dialogs And Loading Copy

**Files:**
- Modify: `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`
- Modify: `src/features/AccountManagement/components/AccountDialog/index.tsx`
- Modify: `src/features/AccountManagement/components/AccountDialog/ActionButtons.tsx`
- Modify: `src/locales/zh-CN/accountDialog.json`
- Modify: `src/locales/zh-TW/accountDialog.json`
- Modify: `src/locales/en/accountDialog.json`
- Modify: `src/locales/ja/accountDialog.json`
- Test: `tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx`

- [ ] **Step 1: Expose the saved Sub2API account from the hook**

In `src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts`, add state near `postSaveSub2ApiAllowedGroups`:

```ts
  const [postSaveSub2ApiAccount, setPostSaveSub2ApiAccount] =
    useState<DisplaySiteData | null>(null)
```

Reset it in `resetForm`:

```ts
    setPostSaveSub2ApiAccount(null)
```

When setting Sub2API selection state in `handleAutoConfig`, add:

```ts
          setPostSaveSub2ApiAccount(displaySiteData)
```

In `handlePostSaveSub2ApiTokenCreated`, add this before any return:

```ts
      setPostSaveSub2ApiAccount(null)
```

Expose it in returned `state`:

```ts
      postSaveSub2ApiAccount,
```

Run the hook test to confirm this state-only addition stays green:

```bash
pnpm vitest --run tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Render `AddTokenDialog` and `OneTimeApiKeyDialog` in `AccountDialog`**

In `src/features/AccountManagement/components/AccountDialog/index.tsx`, add imports:

```ts
import { useTranslation } from "react-i18next"

import AddTokenDialog from "~/features/KeyManagement/components/AddTokenDialog"
import { OneTimeApiKeyDialog } from "~/features/KeyManagement/components/OneTimeApiKeyDialog"
import { DEFAULT_AUTO_PROVISION_TOKEN_NAME } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
```

Inside `AccountDialog`, add:

```ts
  const { t } = useTranslation("messages")
```

Before `return`, add:

```ts
  const postSaveSub2ApiCreatePrefill =
    state.postSaveSub2ApiAllowedGroups &&
    state.postSaveSub2ApiAllowedGroups.length > 0
      ? {
          modelId: "",
          defaultName: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
          group: state.postSaveSub2ApiAllowedGroups.includes("default")
            ? "default"
            : state.postSaveSub2ApiAllowedGroups[0] ?? "default",
          allowedGroups: state.postSaveSub2ApiAllowedGroups,
        }
      : undefined
```

Before the closing fragment `</>`, after `ManagedSiteConfigPromptDialog`, add this complete block:

```tsx
      {state.postSaveSub2ApiAccount && postSaveSub2ApiCreatePrefill ? (
        <AddTokenDialog
          isOpen={true}
          onClose={() =>
            void handlers.handlePostSaveSub2ApiTokenCreated(undefined)
          }
          availableAccounts={[state.postSaveSub2ApiAccount]}
          preSelectedAccountId={state.postSaveSub2ApiAccount.id}
          createPrefill={postSaveSub2ApiCreatePrefill}
          prefillNotice={t("sub2api.createRequiresGroupSelection")}
          onSuccess={handlers.handlePostSaveSub2ApiTokenCreated}
          showOneTimeKeyDialog={false}
        />
      ) : null}

      <OneTimeApiKeyDialog
        isOpen={!!state.postSaveOneTimeToken}
        token={state.postSaveOneTimeToken}
        onClose={handlers.handlePostSaveOneTimeTokenClose}
      />
```

- [ ] **Step 3: Add workflow loading label support to `ActionButtons`**

In `src/features/AccountManagement/components/AccountDialog/ActionButtons.tsx`, import:

```ts
import {
  ACCOUNT_POST_SAVE_WORKFLOW_STEPS,
  type AccountPostSaveWorkflowStep,
} from "~/services/accounts/accountPostSaveWorkflow"
```

Add prop:

```ts
  accountPostSaveWorkflowStep: AccountPostSaveWorkflowStep
```

Add it to the destructured props.

Add this mapping inside `ActionButtons` before `return`:

```ts
  const autoConfigLoadingLabelKeyByStep: Partial<
    Record<AccountPostSaveWorkflowStep, string>
  > = {
    [ACCOUNT_POST_SAVE_WORKFLOW_STEPS.SavingAccount]:
      "accountDialog:actions.workflow.savingAccount",
    [ACCOUNT_POST_SAVE_WORKFLOW_STEPS.LoadingSavedAccount]:
      "accountDialog:actions.workflow.loadingSavedAccount",
    [ACCOUNT_POST_SAVE_WORKFLOW_STEPS.CheckingToken]:
      "accountDialog:actions.workflow.checkingToken",
    [ACCOUNT_POST_SAVE_WORKFLOW_STEPS.CreatingToken]:
      "accountDialog:actions.workflow.creatingToken",
    [ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForOneTimeKeyAcknowledgement]:
      "accountDialog:actions.workflow.waitingForOneTimeKey",
    [ACCOUNT_POST_SAVE_WORKFLOW_STEPS.WaitingForSub2ApiGroupSelection]:
      "accountDialog:actions.workflow.waitingForSub2ApiGroup",
    [ACCOUNT_POST_SAVE_WORKFLOW_STEPS.OpeningManagedSiteDialog]:
      "accountDialog:actions.workflow.openingManagedSiteDialog",
  }
  const autoConfigLoadingLabel = t(
    autoConfigLoadingLabelKeyByStep[accountPostSaveWorkflowStep] ??
      "accountDialog:actions.configuring",
  )
```

Change the loading button text from:

```tsx
          {isAutoConfiguring
            ? t("accountDialog:actions.configuring")
            : t("accountDialog:actions.configToManagedSite", {
```

to:

```tsx
          {isAutoConfiguring
            ? autoConfigLoadingLabel
            : t("accountDialog:actions.configToManagedSite", {
```

In `AccountDialog/index.tsx`, pass the new prop to `ActionButtons`:

```tsx
            accountPostSaveWorkflowStep={state.accountPostSaveWorkflowStep}
```

- [ ] **Step 4: Add locale keys**

In each `src/locales/*/accountDialog.json`, add an `actions.workflow` object under existing `actions`.

For `src/locales/zh-CN/accountDialog.json`:

```json
"workflow": {
  "savingAccount": "正在保存账号...",
  "loadingSavedAccount": "正在读取已保存账号...",
  "checkingToken": "正在检查 API 密钥...",
  "creatingToken": "正在创建默认密钥...",
  "waitingForOneTimeKey": "请先保存一次性密钥...",
  "waitingForSub2ApiGroup": "请选择 Sub2API 分组...",
  "openingManagedSiteDialog": "正在打开渠道配置..."
}
```

For `src/locales/zh-TW/accountDialog.json`:

```json
"workflow": {
  "savingAccount": "正在儲存帳號...",
  "loadingSavedAccount": "正在讀取已儲存帳號...",
  "checkingToken": "正在檢查 API 金鑰...",
  "creatingToken": "正在建立預設金鑰...",
  "waitingForOneTimeKey": "請先保存一次性金鑰...",
  "waitingForSub2ApiGroup": "請選擇 Sub2API 分組...",
  "openingManagedSiteDialog": "正在開啟渠道配置..."
}
```

For `src/locales/en/accountDialog.json`:

```json
"workflow": {
  "savingAccount": "Saving account...",
  "loadingSavedAccount": "Loading saved account...",
  "checkingToken": "Checking API keys...",
  "creatingToken": "Creating default key...",
  "waitingForOneTimeKey": "Save the one-time key first...",
  "waitingForSub2ApiGroup": "Choose a Sub2API group...",
  "openingManagedSiteDialog": "Opening channel setup..."
}
```

For `src/locales/ja/accountDialog.json`:

```json
"workflow": {
  "savingAccount": "アカウントを保存しています...",
  "loadingSavedAccount": "保存済みアカウントを読み込んでいます...",
  "checkingToken": "API キーを確認しています...",
  "creatingToken": "デフォルトキーを作成しています...",
  "waitingForOneTimeKey": "ワンタイムキーを先に保存してください...",
  "waitingForSub2ApiGroup": "Sub2API グループを選択してください...",
  "openingManagedSiteDialog": "チャンネル設定を開いています..."
}
```

Use valid JSON commas according to each file's existing structure.

- [ ] **Step 5: Run targeted tests and i18n dry-run**

Run:

```bash
pnpm vitest --run tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx
pnpm run i18n:extract:ci
```

Expected: both PASS. If `i18n:extract:ci` reports locale updates, inspect the reported keys and adjust source/i18n JSON so it passes without uncommitted extractor changes.

- [ ] **Step 6: Commit Task 4**

Run:

```bash
git add src/features/AccountManagement/components/AccountDialog src/features/AccountManagement/components/AccountDialog/hooks/useAccountDialog.ts src/locales/zh-CN/accountDialog.json src/locales/zh-TW/accountDialog.json src/locales/en/accountDialog.json src/locales/ja/accountDialog.json
git commit -m "feat(accounts): show post-save quick config prompts"
```

Expected: commit succeeds.

---

### Task 5: Lock ChannelDialog No-Recreate Behavior

**Files:**
- Modify: `tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx`

- [ ] **Step 1: Add the regression test**

In `tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx`, add this test near the existing `openWithAccount` tests that use `ensureAccountApiTokenSpy`:

```ts
  it("does not ensure or create a token when openWithAccount receives a token", async () => {
    const providedToken = buildApiToken({
      id: 123,
      key: "sk-provided-token",
    })
    const mockService: Partial<ManagedSiteService> = {
      messagesKey: "newapi",
      getConfig: vi.fn(async () => ({
        baseUrl: "https://managed.example.com",
        token: "admin-token",
        userId: "1",
      })),
      prepareChannelFormData: vi.fn(
        async () =>
          ({
            name: "Auto channel",
            type: ChannelType.OpenAI,
            key: providedToken.key,
            base_url: "https://upstream.example.com",
            models: ["gpt-4"],
            groups: ["default"],
            priority: 0,
            weight: 0,
            status: 1,
          }) satisfies ChannelFormData,
      ),
      searchChannel: vi.fn(async () => ({
        items: [],
        total: 0,
        type_counts: {},
      })),
    }
    getManagedSiteServiceSpy.mockResolvedValue(
      mockService as ManagedSiteService,
    )
    getAccountByIdSpy.mockResolvedValue(buildSiteAccount())

    const { result } = await renderChannelDialogHook()

    await act(async () => {
      await result.current.dialog.openWithAccount(
        buildDisplaySiteData(),
        providedToken,
      )
    })

    expect(ensureAccountApiTokenSpy).not.toHaveBeenCalled()
    expect(mockFetchAccountTokens).not.toHaveBeenCalled()
    expect(mockService.prepareChannelFormData).toHaveBeenCalledWith(
      expect.anything(),
      providedToken,
    )
    expect(result.current.context.state.isOpen).toBe(true)
  })
```

If the local helper names differ, use the existing names from this file. Do not introduce new factories if equivalent helpers already exist.

- [ ] **Step 2: Run the ChannelDialog regression test file**

Run:

```bash
pnpm vitest --run tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
```

Expected: PASS. This should pass without production changes because `openWithAccount` already skips token ensure when `accountToken` is provided.

- [ ] **Step 3: Commit Task 5**

Run:

```bash
git add tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
git commit -m "test(accounts): lock provided-token channel setup"
```

Expected: commit succeeds.

---

### Task 6: Full Validation And Cleanup

**Files:**
- Review all files changed by Tasks 1-5.

- [ ] **Step 1: Run all affected tests**

Run:

```bash
pnpm vitest --run tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.validateAndSaveAccount.test.ts tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
```

Expected: PASS.

- [ ] **Step 2: Run staged validation**

Run:

```bash
pnpm run validate:staged
```

Expected: PASS. This runs lint-staged and staged i18n checks.

- [ ] **Step 3: Run i18n extract CI**

Run:

```bash
pnpm run i18n:extract:ci
```

Expected: PASS with no unexpected locale updates.

- [ ] **Step 4: Inspect final diff**

Run:

```bash
git status --porcelain
git diff --stat HEAD
git diff HEAD -- src/services/accounts/accountPostSaveWorkflow src/services/accounts/accountOperations.ts src/features/AccountManagement/components/AccountDialog tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts tests/services/accountOperations.validateAndSaveAccount.test.ts tests/features/AccountManagement/hooks/useAccountDialog.saveAndAutoConfig.test.tsx tests/components/UseChannelDialog.duplicateChannelWarning.test.tsx
```

Expected: only task-scoped implementation, tests, and locale changes are present. No generated artifacts, debug logs, unrelated formatting, or accidental docs changes.

- [ ] **Step 5: Commit any validation fixes**

If Steps 1-4 required code or test fixes, first identify the changed files:

```bash
git status --porcelain
```

Then stage only the task-scoped files that were fixed, using explicit paths. For example, if validation required changes to the workflow helper and its test, run:

```bash
git add src/services/accounts/accountPostSaveWorkflow/ensureAccountToken.ts tests/services/accountPostSaveWorkflow.ensureAccountToken.test.ts
git commit -m "fix(accounts): stabilize post-save workflow"
```

Expected: either no commit is needed, or a focused validation-fix commit is created.
