import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeMessageTypes } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { TOKEN_PROVISIONING_REPAIR_POLICY_KINDS } from "~/services/apiAdapters/contracts/tokenProvisioning"
import { AuthTypeEnum, type DisplaySiteData, type SiteAccount } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_ERRORS,
  ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS,
  ACCOUNT_KEY_REPAIR_JOB_STATES,
  ACCOUNT_KEY_REPAIR_OUTCOMES,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
} from "~/types/accountKeyAutoProvisioning"
import {
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

const mocks = vi.hoisted(() => {
  const storageMap = new Map<string, unknown>()
  const pendingStorageSets: Array<() => void> = []
  let shouldBlockNextStorageSet = false
  let shouldRejectNextStorageSet = false

  class StorageMock {
    async get(key: string) {
      return storageMap.get(key)
    }

    async set(key: string, value: unknown) {
      storageMap.set(key, value)
      if (shouldBlockNextStorageSet) {
        shouldBlockNextStorageSet = false
        await new Promise<void>((resolve) => {
          pendingStorageSets.push(resolve)
        })
      }
      if (shouldRejectNextStorageSet) {
        shouldRejectNextStorageSet = false
        throw new Error("storage write failed")
      }
    }
  }

  return {
    storageMap,
    pendingStorageSets,
    blockNextStorageSet: () => {
      shouldBlockNextStorageSet = true
    },
    rejectNextStorageSet: () => {
      shouldRejectNextStorageSet = true
    },
    resolveNextStorageSet: () => {
      pendingStorageSets.shift()?.()
    },
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

vi.mock("@plasmohq/storage", () => ({
  Storage: mocks.StorageMock,
}))

vi.mock("~/services/accounts/accountStorage", () => ({
  accountStorage: {
    getAllAccounts: mocks.getAllAccounts,
    convertToDisplayData: mocks.convertToDisplayData,
  },
}))

vi.mock("~/services/accounts/accountKeyAutoProvisioning/groupCoverage", () => ({
  ensureAccountKeysForAvailableGroups:
    mocks.ensureAccountKeysForAvailableGroups,
  deleteInvalidAccountToken: mocks.deleteInvalidAccountToken,
}))

vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteAdapter: vi.fn((siteType: string) => ({
    siteType,
    tokenProvisioning:
      siteType === SITE_TYPES.SUB2API
        ? {
            getRepairPolicy: () => ({
              kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Skipped,
              skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api,
            }),
          }
        : siteType === SITE_TYPES.AIHUBMIX
          ? {
              getRepairPolicy: () => ({
                kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Skipped,
                skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.AihubmixOneTimeKey,
              }),
            }
          : {
              getRepairPolicy: () => ({
                kind: TOKEN_PROVISIONING_REPAIR_POLICY_KINDS.Eligible,
              }),
            },
  })),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: mocks.sendRuntimeMessage,
  }
})

vi.mock("~/utils/core/identifier", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/core/identifier")>()
  return {
    ...actual,
    safeRandomUUID: mocks.safeRandomUUID,
  }
})

describe("accountKeyRepair", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    mocks.pendingStorageSets.splice(0)
    mocks.getAllAccounts.mockReset()
    mocks.convertToDisplayData.mockReset()
    mocks.ensureAccountKeysForAvailableGroups.mockReset()
    mocks.deleteInvalidAccountToken.mockReset()
    mocks.sendRuntimeMessage.mockReset()
    mocks.safeRandomUUID.mockReset()
    mocks.safeRandomUUID.mockImplementation(() => "job-123")
    mocks.storageMap.clear()
  })

  it("returns idle progress when no repair state has been stored", async () => {
    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(accountKeyRepairRunner.getProgress()).resolves.toEqual({
      jobId: "idle",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Idle,
      totals: {
        enabledAccounts: 0,
        eligibleAccounts: 0,
        processedAccounts: 0,
        processedEligibleAccounts: 0,
      },
      summary: {
        created: 0,
        alreadyHad: 0,
        skipped: 0,
        failed: 0,
      },
      results: [],
    })
  })

  it("returns stored progress snapshots when a previous repair run was persisted", async () => {
    mocks.storageMap.set("accountKeyRepair_progress", {
      jobId: "job-stored",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
      totals: {
        enabledAccounts: 4,
        eligibleAccounts: 3,
        processedAccounts: 3,
        processedEligibleAccounts: 3,
      },
      summary: {
        created: 1,
        alreadyHad: 1,
        skipped: 1,
        failed: 0,
      },
      results: [
        { accountId: "acc-1", outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created },
      ],
    })

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(accountKeyRepairRunner.getProgress()).resolves.toMatchObject({
      jobId: "job-stored",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
      summary: {
        created: 1,
        alreadyHad: 1,
        skipped: 1,
        failed: 0,
      },
    })
  })

  it("records skipped, created, and failed outcomes during a repair run", async () => {
    const sub2apiAccount = buildSiteAccount({
      id: "sub2api-1",
      site_type: SITE_TYPES.SUB2API,
      site_url: "https://sub2api.example.com",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
    })
    const aihubmixAccount = buildSiteAccount({
      id: "aihubmix-1",
      site_type: SITE_TYPES.AIHUBMIX,
      site_url: "https://aihubmix.com/dashboard",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
    })
    const validAccount = buildSiteAccount({
      id: "new-api-1",
      site_type: "new-api",
      site_url: "https://shared.example.com",
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
    const invalidDisplayAccount = buildSiteAccount({
      id: "bad-cookie-1",
      site_type: "new-api",
      site_url: "https://cookie.example.com",
      authType: AuthTypeEnum.Cookie,
      disabled: false,
      account_info: {
        id: "202",
        access_token: "",
        username: "cookie-user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })

    mocks.getAllAccounts.mockResolvedValue([
      sub2apiAccount,
      aihubmixAccount,
      validAccount,
      invalidDisplayAccount,
    ])
    mocks.convertToDisplayData.mockReturnValue([
      buildDisplaySiteData({
        id: sub2apiAccount.id,
        name: "Sub2API",
        baseUrl: sub2apiAccount.site_url,
        siteType: sub2apiAccount.site_type,
        authType: AuthTypeEnum.AccessToken,
        userId: "1",
        token: "sub2api-token",
      }),
      buildDisplaySiteData({
        id: aihubmixAccount.id,
        name: "AIHubMix",
        baseUrl: aihubmixAccount.site_url,
        siteType: aihubmixAccount.site_type,
        authType: AuthTypeEnum.AccessToken,
        userId: "2",
        token: "aihubmix-token",
      }),
      buildDisplaySiteData({
        id: validAccount.id,
        name: "Valid Account",
        baseUrl: validAccount.site_url,
        siteType: SITE_TYPES.NEW_API,
        authType: AuthTypeEnum.AccessToken,
        userId: "101",
        token: "access-token",
      }),
      buildDisplaySiteData({
        id: invalidDisplayAccount.id,
        name: "Broken Cookie Account",
        baseUrl: invalidDisplayAccount.site_url,
        siteType: SITE_TYPES.NEW_API,
        authType: AuthTypeEnum.Cookie,
        userId: "202",
        token: "",
        cookieAuthSessionCookie: "",
      }),
    ])
    mocks.ensureAccountKeysForAvailableGroups.mockResolvedValueOnce({
      created: true,
      availableGroups: [],
      coveredGroups: [],
      createdGroups: [""],
      missingGroups: [],
      invalidTokens: [],
    })
    mocks.sendRuntimeMessage.mockResolvedValue(undefined)

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    const started = await accountKeyRepairRunner.start()
    expect(started).toMatchObject({
      jobId: "job-123",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
    })

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress.state).toBe(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed)
    })

    const progress = await accountKeyRepairRunner.getProgress()
    expect(progress.totals).toMatchObject({
      enabledAccounts: 4,
      eligibleAccounts: 2,
      processedAccounts: 2,
      processedEligibleAccounts: 2,
    })
    expect(progress.summary).toEqual({
      created: 1,
      alreadyHad: 0,
      skipped: 2,
      failed: 1,
      availableGroups: 0,
      coveredGroups: 0,
      createdKeys: 1,
      invalidKeys: 0,
      deletedKeys: 0,
      deleteFailed: 0,
    })
    expect(progress.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: "sub2api-1",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api,
          siteUrlOrigin: "https://sub2api.example.com",
        }),
        expect.objectContaining({
          accountId: "aihubmix-1",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.AihubmixOneTimeKey,
          siteUrlOrigin: "https://aihubmix.com",
        }),
        expect.objectContaining({
          accountId: "new-api-1",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
          siteUrlOrigin: "https://shared.example.com",
        }),
        expect.objectContaining({
          accountId: "bad-cookie-1",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
          errorMessage: ACCOUNT_KEY_REPAIR_ERRORS.InvalidDisplaySiteData,
          siteUrlOrigin: "https://cookie.example.com",
        }),
      ]),
    )
    expect(mocks.ensureAccountKeysForAvailableGroups).toHaveBeenCalledTimes(1)
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      {
        type: RuntimeMessageTypes.AccountKeyRepairProgress,
        payload: expect.objectContaining({ jobId: "job-123" }),
      },
      { maxAttempts: 1 },
    )
  })

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
        siteType: SITE_TYPES.NEW_API,
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
          siteType: SITE_TYPES.NEW_API,
          siteUrlOrigin: "https://relay.example.com",
          tokenId: 9,
          tokenName: "old group key",
          group: "old",
          reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
        },
      ],
    })

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await accountKeyRepairRunner.start()

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress.state).toBe(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed)
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
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
        availableGroups: ["default", "vip"],
        coveredGroups: ["default", "vip"],
        createdGroups: ["vip"],
        invalidTokens: [
          expect.objectContaining({
            tokenId: 9,
            tokenName: "old group key",
            group: "old",
            reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
          }),
        ],
      }),
    ])
  })

  it("marks unresolved group provisioning as failed instead of already covered", async () => {
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
        siteType: SITE_TYPES.NEW_API,
        authType: AuthTypeEnum.AccessToken,
        userId: "101",
        token: "access-token",
      }),
    ])
    mocks.ensureAccountKeysForAvailableGroups.mockResolvedValueOnce({
      created: false,
      availableGroups: ["default", "vip"],
      coveredGroups: ["default"],
      createdGroups: [],
      missingGroups: ["vip"],
      invalidTokens: [],
    })

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await accountKeyRepairRunner.start()

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress.state).toBe(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed)
    })

    const progress = await accountKeyRepairRunner.getProgress()
    expect(progress.summary).toMatchObject({
      created: 0,
      alreadyHad: 0,
      failed: 1,
      availableGroups: 2,
      coveredGroups: 1,
      createdKeys: 0,
    })
    expect(progress.results).toEqual([
      expect.objectContaining({
        accountId: "new-api-1",
        outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Failed,
        availableGroups: ["default", "vip"],
        coveredGroups: ["default"],
        missingGroups: ["vip"],
      }),
    ])
  })

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
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      userId: "101",
      token: "access-token",
    })
    const invalidTokens = [
      {
        accountId: "new-api-1",
        accountName: "Relay Account",
        siteType: SITE_TYPES.NEW_API,
        siteUrlOrigin: "https://relay.example.com",
        tokenId: 9,
        tokenName: "old one",
        group: "old",
        reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
      },
      {
        accountId: "new-api-1",
        accountName: "Relay Account",
        siteType: SITE_TYPES.NEW_API,
        siteUrlOrigin: "https://relay.example.com",
        tokenId: 10,
        tokenName: "old two",
        group: "old-2",
        reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
      },
    ]

    mocks.getAllAccounts.mockResolvedValue([account])
    mocks.convertToDisplayData.mockReturnValue([displayAccount])
    let resolveFirstDelete!: (
      value: (typeof invalidTokens)[number] & { deletedAt: number },
    ) => void
    mocks.deleteInvalidAccountToken
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstDelete = resolve
          }),
      )
      .mockRejectedValueOnce(new Error("delete boom"))

    const { deleteInvalidAccountTokens } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    const deleteResult = deleteInvalidAccountTokens({ tokens: invalidTokens })

    await vi.waitFor(() => {
      expect(mocks.deleteInvalidAccountToken).toHaveBeenCalledTimes(1)
    })
    expect(
      mocks.deleteInvalidAccountToken.mock.calls[0]?.[0].token.tokenId,
    ).toBe(9)

    resolveFirstDelete({ ...invalidTokens[0], deletedAt: 123 })

    await vi.waitFor(() => {
      expect(mocks.deleteInvalidAccountToken).toHaveBeenCalledTimes(2)
    })

    await expect(deleteResult).resolves.toEqual({
      success: true,
      data: {
        deleted: [{ ...invalidTokens[0], deletedAt: 123 }],
        failed: [{ ...invalidTokens[1], errorMessage: "delete boom" }],
      },
    })

    expect(
      mocks.deleteInvalidAccountToken.mock.calls.map(
        (call) => call[0].token.tokenId,
      ),
    ).toEqual([9, 10])
  })

  it("preserves stored audit progress when deleting after a cold start", async () => {
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
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      userId: "101",
      token: "access-token",
    })
    const invalidTokens = [
      {
        accountId: "new-api-1",
        accountName: "Relay Account",
        siteType: SITE_TYPES.NEW_API,
        siteUrlOrigin: "https://relay.example.com",
        tokenId: 9,
        tokenName: "old one",
        group: "old",
        reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
      },
      {
        accountId: "new-api-1",
        accountName: "Relay Account",
        siteType: SITE_TYPES.NEW_API,
        siteUrlOrigin: "https://relay.example.com",
        tokenId: 10,
        tokenName: "old two",
        group: "old-2",
        reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
      },
    ]

    mocks.storageMap.set("accountKeyRepair_progress", {
      jobId: "job-stored",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
      startedAt: 100,
      updatedAt: 200,
      finishedAt: 300,
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
        invalidKeys: 2,
        deletedKeys: 0,
        deleteFailed: 0,
      },
      results: [
        {
          accountId: "new-api-1",
          accountName: "Relay Account",
          siteType: SITE_TYPES.NEW_API,
          siteUrlOrigin: "https://relay.example.com",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
          availableGroups: ["default", "vip"],
          coveredGroups: ["default", "vip"],
          createdGroups: ["vip"],
          invalidTokens,
          finishedAt: 300,
        },
      ],
    })
    mocks.getAllAccounts.mockResolvedValue([account])
    mocks.convertToDisplayData.mockReturnValue([displayAccount])
    mocks.deleteInvalidAccountToken.mockResolvedValueOnce({
      ...invalidTokens[0],
      deletedAt: 123,
    })

    const { accountKeyRepairRunner, deleteInvalidAccountTokens } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(
      deleteInvalidAccountTokens({ tokens: [invalidTokens[0]] }),
    ).resolves.toEqual({
      success: true,
      data: {
        deleted: [{ ...invalidTokens[0], deletedAt: 123 }],
        failed: [],
      },
    })

    expect(mocks.storageMap.get("accountKeyRepair_progress")).toMatchObject({
      jobId: "job-stored",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
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
        deletedKeys: 1,
        deleteFailed: 0,
      },
      results: [
        expect.objectContaining({
          accountId: "new-api-1",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
          invalidTokens: [invalidTokens[1]],
        }),
      ],
    })
    await expect(accountKeyRepairRunner.getProgress()).resolves.toMatchObject({
      jobId: "job-stored",
      summary: {
        invalidKeys: 1,
        deletedKeys: 1,
      },
      results: [
        expect.objectContaining({
          invalidTokens: [invalidTokens[1]],
        }),
      ],
    })
  })

  it("decrements invalid key summary by tokens removed from stored results", async () => {
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
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      userId: "101",
      token: "access-token",
    })
    const storedInvalidTokens = [
      {
        accountId: "new-api-1",
        accountName: "Relay Account",
        siteType: SITE_TYPES.NEW_API,
        siteUrlOrigin: "https://relay.example.com",
        tokenId: 9,
        tokenName: "old one",
        group: "old",
        reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
      },
      {
        accountId: "new-api-1",
        accountName: "Relay Account",
        siteType: SITE_TYPES.NEW_API,
        siteUrlOrigin: "https://relay.example.com",
        tokenId: 10,
        tokenName: "old two",
        group: "old-2",
        reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
      },
    ]
    const staleInvalidToken = {
      accountId: "new-api-1",
      accountName: "Relay Account",
      siteType: SITE_TYPES.NEW_API,
      siteUrlOrigin: "https://relay.example.com",
      tokenId: 99,
      tokenName: "already removed",
      group: "legacy",
      reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
    }

    mocks.storageMap.set("accountKeyRepair_progress", {
      jobId: "job-stored",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
      startedAt: 100,
      updatedAt: 200,
      finishedAt: 300,
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
        invalidKeys: 2,
        deletedKeys: 0,
        deleteFailed: 0,
      },
      results: [
        {
          accountId: "new-api-1",
          accountName: "Relay Account",
          siteType: SITE_TYPES.NEW_API,
          siteUrlOrigin: "https://relay.example.com",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Created,
          availableGroups: ["default", "vip"],
          coveredGroups: ["default", "vip"],
          createdGroups: ["vip"],
          invalidTokens: storedInvalidTokens,
          finishedAt: 300,
        },
      ],
    })
    mocks.getAllAccounts.mockResolvedValue([account])
    mocks.convertToDisplayData.mockReturnValue([displayAccount])
    mocks.deleteInvalidAccountToken
      .mockResolvedValueOnce({ ...storedInvalidTokens[0], deletedAt: 123 })
      .mockResolvedValueOnce({ ...staleInvalidToken, deletedAt: 124 })

    const { deleteInvalidAccountTokens } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(
      deleteInvalidAccountTokens({
        tokens: [storedInvalidTokens[0], staleInvalidToken],
      }),
    ).resolves.toEqual({
      success: true,
      data: {
        deleted: [
          { ...storedInvalidTokens[0], deletedAt: 123 },
          { ...staleInvalidToken, deletedAt: 124 },
        ],
        failed: [],
      },
    })

    expect(mocks.storageMap.get("accountKeyRepair_progress")).toMatchObject({
      summary: {
        invalidKeys: 1,
        deletedKeys: 2,
        deleteFailed: 0,
      },
      results: [
        expect.objectContaining({
          invalidTokens: [storedInvalidTokens[1]],
        }),
      ],
    })
  })

  it("records invalid token delete failures when the account is missing", async () => {
    const invalidToken = {
      accountId: "missing-account",
      accountName: "Missing Account",
      siteType: SITE_TYPES.NEW_API,
      siteUrlOrigin: "https://missing.example.com",
      tokenId: 9,
      tokenName: "old one",
      group: "old",
      reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
    }

    mocks.getAllAccounts.mockResolvedValue([])
    mocks.convertToDisplayData.mockReturnValue([])

    const { deleteInvalidAccountTokens } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(
      deleteInvalidAccountTokens({ tokens: [invalidToken] }),
    ).resolves.toEqual({
      success: true,
      data: {
        deleted: [],
        failed: [
          {
            ...invalidToken,
            errorMessage: ACCOUNT_KEY_REPAIR_ERRORS.AccountNotFound,
          },
        ],
      },
    })
    expect(mocks.deleteInvalidAccountToken).not.toHaveBeenCalled()
  })

  it("uses the delete-failed fallback when invalid token deletion rejects without a message", async () => {
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
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      userId: "101",
      token: "access-token",
    })
    const invalidToken = {
      accountId: "new-api-1",
      accountName: "Relay Account",
      siteType: SITE_TYPES.NEW_API,
      siteUrlOrigin: "https://relay.example.com",
      tokenId: 9,
      tokenName: "old one",
      group: "old",
      reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
    }

    mocks.getAllAccounts.mockResolvedValue([account])
    mocks.convertToDisplayData.mockReturnValue([displayAccount])
    mocks.deleteInvalidAccountToken.mockRejectedValueOnce({})

    const { deleteInvalidAccountTokens } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(
      deleteInvalidAccountTokens({ tokens: [invalidToken] }),
    ).resolves.toEqual({
      success: true,
      data: {
        deleted: [],
        failed: [
          {
            ...invalidToken,
            errorMessage: ACCOUNT_KEY_REPAIR_ERRORS.DeleteFailed,
          },
        ],
      },
    })
  })

  it("skips none-auth accounts, ignores disabled accounts, and falls back to per-account display conversion", async () => {
    const noneAuthAccount = buildSiteAccount({
      id: "none-auth-1",
      site_type: "new-api",
      site_url: "https://skip.example.com",
      authType: AuthTypeEnum.None,
      disabled: false,
    })
    const disabledAccount = buildSiteAccount({
      id: "disabled-1",
      site_type: "new-api",
      site_url: "https://disabled.example.com",
      authType: AuthTypeEnum.AccessToken,
      disabled: true,
    })
    const cookieAccount = buildSiteAccount({
      id: "cookie-1",
      site_type: "new-api",
      site_url: "https://cookie.example.com/path/",
      authType: AuthTypeEnum.Cookie,
      disabled: false,
      account_info: {
        id: "404",
        access_token: "",
        username: "cookie-user",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })

    mocks.getAllAccounts.mockResolvedValue([
      noneAuthAccount,
      disabledAccount,
      cookieAccount,
    ])
    mocks.convertToDisplayData.mockImplementation((accounts: any) => {
      if (Array.isArray(accounts)) {
        return [
          buildDisplaySiteData({
            id: noneAuthAccount.id,
            name: "None Auth",
            baseUrl: noneAuthAccount.site_url,
            siteType: SITE_TYPES.NEW_API,
            authType: AuthTypeEnum.None,
            userId: "1",
          }),
        ]
      }

      return buildDisplaySiteData({
        id: cookieAccount.id,
        name: "Cookie Fallback",
        baseUrl: cookieAccount.site_url,
        siteType: SITE_TYPES.NEW_API,
        authType: AuthTypeEnum.Cookie,
        userId: "404",
        token: "",
        cookieAuthSessionCookie: "session=abc",
      })
    })
    mocks.ensureAccountKeysForAvailableGroups.mockResolvedValueOnce({
      created: false,
      availableGroups: [],
      coveredGroups: [],
      createdGroups: [],
      missingGroups: [],
      invalidTokens: [],
    })

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await accountKeyRepairRunner.start()

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress.state).toBe(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed)
    })

    const progress = await accountKeyRepairRunner.getProgress()
    expect(progress.totals).toMatchObject({
      enabledAccounts: 2,
      eligibleAccounts: 1,
      processedAccounts: 1,
      processedEligibleAccounts: 1,
    })
    expect(progress.summary).toEqual({
      created: 0,
      alreadyHad: 1,
      skipped: 1,
      failed: 0,
      availableGroups: 0,
      coveredGroups: 0,
      createdKeys: 0,
      invalidKeys: 0,
      deletedKeys: 0,
      deleteFailed: 0,
    })
    expect(progress.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: "none-auth-1",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.Skipped,
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.NoneAuth,
        }),
        expect.objectContaining({
          accountId: "cookie-1",
          outcome: ACCOUNT_KEY_REPAIR_OUTCOMES.AlreadyHad,
          siteUrlOrigin: "https://cookie.example.com",
        }),
      ]),
    )
    expect(mocks.convertToDisplayData).toHaveBeenCalledWith(cookieAccount)
    expect(mocks.ensureAccountKeysForAvailableGroups).toHaveBeenCalledWith({
      account: cookieAccount,
      displaySiteData: expect.objectContaining({
        id: "cookie-1",
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "session=abc",
      }),
      accountName: "Cookie Fallback",
      siteUrlOrigin: "https://cookie.example.com",
      abortSignal: expect.any(AbortSignal),
    })
  })

  it("returns existing progress while a run is already in flight", async () => {
    const resolvers: Array<() => void> = []

    mocks.getAllAccounts.mockResolvedValue([
      buildSiteAccount({
        id: "queued-1",
        site_type: "new-api",
        site_url: "https://queued.example.com",
        authType: AuthTypeEnum.AccessToken,
        disabled: false,
        account_info: {
          id: "303",
          access_token: "queued-token",
          username: "queued",
          quota: 0,
          today_prompt_tokens: 0,
          today_completion_tokens: 0,
          today_quota_consumption: 0,
          today_requests_count: 0,
          today_income: 0,
        },
      }),
    ])
    mocks.convertToDisplayData.mockReturnValue([
      buildDisplaySiteData({
        id: "queued-1",
        name: "Queued Account",
        baseUrl: "https://queued.example.com",
        siteType: SITE_TYPES.NEW_API,
        authType: AuthTypeEnum.AccessToken,
        userId: "303",
        token: "queued-token",
      }),
    ])
    mocks.ensureAccountKeysForAvailableGroups.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(() =>
            resolve({
              created: false,
              availableGroups: [],
              coveredGroups: [],
              createdGroups: [],
              missingGroups: [],
              invalidTokens: [],
            }),
          )
        }),
    )

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    const first = await accountKeyRepairRunner.start()
    const second = await accountKeyRepairRunner.start()

    expect(first.jobId).toBe("job-123")
    expect(second.jobId).toBe("job-123")
    expect(mocks.getAllAccounts).toHaveBeenCalledTimes(1)

    await vi.waitFor(() => {
      expect(resolvers).toHaveLength(1)
    })

    resolvers[0]?.()

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress.state).toBe(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed)
    })
  })

  it("cancels an in-flight repair job and does not start later queued accounts", async () => {
    const firstAccount = buildSiteAccount({
      id: "queued-1",
      site_type: "new-api",
      site_url: "https://shared.example.com",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      account_info: {
        id: "301",
        access_token: "first-token",
        username: "queued-1",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    const secondAccount = buildSiteAccount({
      id: "queued-2",
      site_type: "new-api",
      site_url: "https://shared.example.com",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      account_info: {
        id: "302",
        access_token: "second-token",
        username: "queued-2",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    let capturedSignal: AbortSignal | undefined

    mocks.getAllAccounts.mockResolvedValue([firstAccount, secondAccount])
    mocks.convertToDisplayData.mockReturnValue([
      buildDisplaySiteData({
        id: firstAccount.id,
        name: "Queued Account 1",
        baseUrl: firstAccount.site_url,
        siteType: SITE_TYPES.NEW_API,
        authType: AuthTypeEnum.AccessToken,
        userId: "301",
        token: "first-token",
      }),
      buildDisplaySiteData({
        id: secondAccount.id,
        name: "Queued Account 2",
        baseUrl: secondAccount.site_url,
        siteType: SITE_TYPES.NEW_API,
        authType: AuthTypeEnum.AccessToken,
        userId: "302",
        token: "second-token",
      }),
    ])
    mocks.ensureAccountKeysForAvailableGroups.mockImplementation(
      async ({ abortSignal }) => {
        capturedSignal = abortSignal
        await vi.waitFor(() => {
          expect(abortSignal?.aborted).toBe(true)
        })
        return {
          created: false,
          availableGroups: [],
          coveredGroups: [],
          createdGroups: [],
          missingGroups: [],
          invalidTokens: [],
        }
      },
    )

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await accountKeyRepairRunner.start()

    await vi.waitFor(() => {
      expect(mocks.ensureAccountKeysForAvailableGroups).toHaveBeenCalledTimes(1)
    })

    await expect(accountKeyRepairRunner.cancel()).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        jobId: "job-123",
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
      }),
    })

    expect(capturedSignal?.aborted).toBe(true)

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress.state).toBe(ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled)
    })

    const progress = await accountKeyRepairRunner.getProgress()
    expect(progress.totals).toMatchObject({
      enabledAccounts: 2,
      eligibleAccounts: 2,
      processedAccounts: 0,
      processedEligibleAccounts: 0,
    })
    expect(progress.results).toEqual([])
    expect(mocks.ensureAccountKeysForAvailableGroups).toHaveBeenCalledTimes(1)
  })

  it("does not load accounts when cancelled before the queued run starts", async () => {
    const account = buildSiteAccount({
      id: "queued-start",
      site_type: "new-api",
      site_url: "https://queued-start.example.com",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      account_info: {
        id: "301",
        access_token: "queued-start-token",
        username: "queued-start",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })

    mocks.blockNextStorageSet()
    mocks.getAllAccounts.mockResolvedValue([account])

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    const startPromise = accountKeyRepairRunner.start()
    await vi.waitFor(() => {
      expect(mocks.pendingStorageSets).toHaveLength(1)
    })

    await expect(accountKeyRepairRunner.cancel()).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        jobId: "job-123",
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
      }),
    })

    mocks.resolveNextStorageSet()
    await expect(startPromise).resolves.toMatchObject({
      jobId: "job-123",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
    })
    await vi.waitFor(async () => {
      await expect(accountKeyRepairRunner.getProgress()).resolves.toMatchObject(
        {
          jobId: "job-123",
          state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
        },
      )
    })
    expect(mocks.getAllAccounts).not.toHaveBeenCalled()
  })

  it("stops after account loading when cancellation arrives before account scanning", async () => {
    const account = buildSiteAccount({
      id: "cancel-after-load",
      site_type: "new-api",
      site_url: "https://loaded.example.com",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      account_info: {
        id: "301",
        access_token: "loaded-token",
        username: "cancel-after-load",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    let resolveAccounts: ((accounts: SiteAccount[]) => void) | undefined

    mocks.getAllAccounts.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAccounts = resolve
        }),
    )

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await accountKeyRepairRunner.start()
    await vi.waitFor(() => {
      expect(mocks.getAllAccounts).toHaveBeenCalledTimes(1)
    })

    await accountKeyRepairRunner.cancel()
    resolveAccounts?.([account])

    await vi.waitFor(async () => {
      await expect(accountKeyRepairRunner.getProgress()).resolves.toMatchObject(
        {
          jobId: "job-123",
          state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
          results: [],
        },
      )
    })
    expect(mocks.convertToDisplayData).not.toHaveBeenCalled()
    expect(mocks.ensureAccountKeysForAvailableGroups).not.toHaveBeenCalled()
  })

  it("keeps cancelled progress when account loading rejects after cancellation", async () => {
    let rejectAccounts: ((error: Error) => void) | undefined

    mocks.getAllAccounts.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectAccounts = reject
        }),
    )

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await accountKeyRepairRunner.start()
    await vi.waitFor(() => {
      expect(mocks.getAllAccounts).toHaveBeenCalledTimes(1)
    })

    await accountKeyRepairRunner.cancel()
    rejectAccounts?.(new Error("load failed after cancel"))

    await vi.waitFor(async () => {
      await expect(accountKeyRepairRunner.getProgress()).resolves.toMatchObject(
        {
          jobId: "job-123",
          state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
          results: [],
        },
      )
    })
    const progress = await accountKeyRepairRunner.getProgress()
    expect(progress).not.toHaveProperty("lastError")
  })

  it("stops account scanning when cancellation arrives after enabled-account persistence", async () => {
    const account = buildSiteAccount({
      id: "cancel-during-scan",
      site_type: "new-api",
      site_url: "https://scan.example.com",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      account_info: {
        id: "301",
        access_token: "scan-token",
        username: "cancel-during-scan",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    let resolveAccounts: ((accounts: SiteAccount[]) => void) | undefined

    mocks.getAllAccounts.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAccounts = resolve
        }),
    )
    mocks.convertToDisplayData.mockReturnValue([
      buildDisplaySiteData({
        id: account.id,
        name: "Cancel During Scan",
        baseUrl: account.site_url,
        siteType: SITE_TYPES.NEW_API,
        authType: AuthTypeEnum.AccessToken,
        userId: "301",
        token: "scan-token",
      }),
    ])

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await accountKeyRepairRunner.start()
    mocks.blockNextStorageSet()
    resolveAccounts?.([account])

    await vi.waitFor(() => {
      expect(mocks.pendingStorageSets).toHaveLength(1)
    })
    await accountKeyRepairRunner.cancel()
    mocks.resolveNextStorageSet()

    await vi.waitFor(async () => {
      await expect(accountKeyRepairRunner.getProgress()).resolves.toMatchObject(
        {
          jobId: "job-123",
          state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
          totals: expect.objectContaining({
            enabledAccounts: 1,
            processedAccounts: 0,
            processedEligibleAccounts: 0,
          }),
          results: [],
        },
      )
    })
    expect(mocks.ensureAccountKeysForAvailableGroups).not.toHaveBeenCalled()
  })

  it("cancels a stored running job when no in-memory run exists", async () => {
    mocks.storageMap.set("accountKeyRepair_progress", {
      jobId: "stale-running",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
      startedAt: 100,
      updatedAt: 100,
      totals: {
        enabledAccounts: 220,
        eligibleAccounts: 220,
        processedAccounts: 219,
        processedEligibleAccounts: 219,
      },
      summary: {
        created: 0,
        alreadyHad: 219,
        skipped: 0,
        failed: 0,
      },
      results: [],
    })

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(accountKeyRepairRunner.cancel()).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        jobId: "stale-running",
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
        finishedAt: expect.any(Number),
      }),
    })

    await expect(accountKeyRepairRunner.getProgress()).resolves.toMatchObject({
      jobId: "stale-running",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
      totals: {
        enabledAccounts: 220,
        eligibleAccounts: 220,
        processedAccounts: 219,
        processedEligibleAccounts: 219,
      },
    })
    expect(mocks.sendRuntimeMessage).toHaveBeenLastCalledWith(
      {
        type: RuntimeMessageTypes.AccountKeyRepairProgress,
        payload: expect.objectContaining({
          jobId: "stale-running",
          state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
        }),
      },
      { maxAttempts: 1 },
    )
  })

  it("does not rewrite stored progress when cancelling a non-running job", async () => {
    const completedProgress = {
      jobId: "finished-run",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
      startedAt: 100,
      finishedAt: 200,
      updatedAt: 200,
      totals: {
        enabledAccounts: 1,
        eligibleAccounts: 1,
        processedAccounts: 1,
        processedEligibleAccounts: 1,
      },
      summary: {
        created: 0,
        alreadyHad: 1,
        skipped: 0,
        failed: 0,
      },
      results: [],
    }
    mocks.storageMap.set("accountKeyRepair_progress", completedProgress)

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(accountKeyRepairRunner.cancel()).resolves.toEqual({
      success: true,
      data: completedProgress,
    })
    expect(mocks.sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("keeps the cancelled run reserved until it unwinds", async () => {
    const firstAccount = buildSiteAccount({
      id: "first-run",
      site_type: "new-api",
      site_url: "https://first.example.com",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      account_info: {
        id: "301",
        access_token: "first-token",
        username: "first-run",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    const firstRunDisplay = buildDisplaySiteData({
      id: firstAccount.id,
      name: "First Run",
      baseUrl: firstAccount.site_url,
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      userId: "301",
      token: "first-token",
    })
    let firstAbortSignal: AbortSignal | undefined

    mocks.safeRandomUUID.mockReturnValueOnce("job-first")
    mocks.getAllAccounts.mockResolvedValueOnce([firstAccount])
    mocks.convertToDisplayData.mockReturnValueOnce([firstRunDisplay])
    mocks.ensureAccountKeysForAvailableGroups.mockImplementationOnce(
      async ({ abortSignal }) => {
        firstAbortSignal = abortSignal
        await vi.waitFor(() => {
          expect(abortSignal?.aborted).toBe(true)
        })
        return {
          created: false,
          availableGroups: [],
          coveredGroups: [],
          createdGroups: [],
          missingGroups: [],
          invalidTokens: [],
        }
      },
    )

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await accountKeyRepairRunner.start()
    await vi.waitFor(() => {
      expect(mocks.ensureAccountKeysForAvailableGroups).toHaveBeenCalledTimes(1)
    })

    await accountKeyRepairRunner.cancel()
    expect(firstAbortSignal?.aborted).toBe(true)

    await expect(accountKeyRepairRunner.start()).resolves.toMatchObject({
      jobId: "job-first",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
    })
    expect(mocks.ensureAccountKeysForAvailableGroups).toHaveBeenCalledTimes(1)

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress).toMatchObject({
        jobId: "job-first",
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
      })
    })
  })

  it("reserves a starting run before its first progress persistence finishes", async () => {
    const account = buildSiteAccount({
      id: "reserved-run",
      site_type: "new-api",
      site_url: "https://reserved.example.com",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      account_info: {
        id: "301",
        access_token: "reserved-token",
        username: "reserved-run",
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
      name: "Reserved Run",
      baseUrl: account.site_url,
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      userId: "301",
      token: "reserved-token",
    })

    mocks.blockNextStorageSet()
    mocks.getAllAccounts.mockResolvedValue([account])
    mocks.convertToDisplayData.mockReturnValue([displayAccount])
    mocks.ensureAccountKeysForAvailableGroups.mockResolvedValue({
      created: false,
      availableGroups: [],
      coveredGroups: [],
      createdGroups: [],
      missingGroups: [],
      invalidTokens: [],
    })

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    const firstStart = accountKeyRepairRunner.start()

    await vi.waitFor(() => {
      expect(mocks.pendingStorageSets).toHaveLength(1)
    })
    await expect(accountKeyRepairRunner.start()).resolves.toMatchObject({
      jobId: "job-123",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
    })
    expect(mocks.getAllAccounts).not.toHaveBeenCalled()

    mocks.resolveNextStorageSet()

    await expect(firstStart).resolves.toMatchObject({
      jobId: "job-123",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
    })

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress.state).toBe(ACCOUNT_KEY_REPAIR_JOB_STATES.Completed)
    })
    expect(mocks.getAllAccounts).toHaveBeenCalledTimes(1)
  })

  it("keeps the run reserved until failed initial persistence unwinds", async () => {
    const account = buildSiteAccount({
      id: "persistence-fails",
      site_type: "new-api",
      site_url: "https://persist.example.com",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      account_info: {
        id: "301",
        access_token: "persist-token",
        username: "persistence-fails",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })

    mocks.rejectNextStorageSet()
    mocks.getAllAccounts.mockResolvedValue([account])

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    const failedStart = accountKeyRepairRunner.start()
    await expect(accountKeyRepairRunner.start()).resolves.toMatchObject({
      jobId: "job-123",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
    })

    await expect(failedStart).rejects.toThrow("storage write failed")
    await expect(accountKeyRepairRunner.start()).resolves.toMatchObject({
      jobId: "job-123",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
    })
    expect(mocks.getAllAccounts).toHaveBeenCalledTimes(1)
  })

  it("does not let a cancelled run update a restarted job", async () => {
    const firstAccount = buildSiteAccount({
      id: "first-run",
      site_type: "new-api",
      site_url: "https://first.example.com",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      account_info: {
        id: "301",
        access_token: "first-token",
        username: "first-run",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    const secondAccount = buildSiteAccount({
      id: "second-run",
      site_type: "new-api",
      site_url: "https://second.example.com",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      account_info: {
        id: "302",
        access_token: "second-token",
        username: "second-run",
        quota: 0,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
      },
    })
    const firstRunDisplay = buildDisplaySiteData({
      id: firstAccount.id,
      name: "First Run",
      baseUrl: firstAccount.site_url,
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      userId: "301",
      token: "first-token",
    })
    const secondRunDisplay = buildDisplaySiteData({
      id: secondAccount.id,
      name: "Second Run",
      baseUrl: secondAccount.site_url,
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      userId: "302",
      token: "second-token",
    })
    let resolveFirstRun:
      | ((value: {
          created: boolean
          availableGroups: string[]
          coveredGroups: string[]
          createdGroups: string[]
          missingGroups: string[]
          invalidTokens: []
        }) => void)
      | undefined
    let resolveSecondRun:
      | ((value: {
          created: boolean
          availableGroups: string[]
          coveredGroups: string[]
          createdGroups: string[]
          missingGroups: string[]
          invalidTokens: []
        }) => void)
      | undefined

    mocks.safeRandomUUID
      .mockReturnValueOnce("job-first")
      .mockReturnValueOnce("job-second")
    mocks.getAllAccounts
      .mockResolvedValueOnce([firstAccount])
      .mockResolvedValueOnce([secondAccount])
    mocks.convertToDisplayData
      .mockReturnValueOnce([firstRunDisplay])
      .mockReturnValueOnce([secondRunDisplay])
    mocks.ensureAccountKeysForAvailableGroups
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirstRun = resolve
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveSecondRun = resolve
          }),
      )

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await accountKeyRepairRunner.start()
    await vi.waitFor(() => {
      expect(mocks.ensureAccountKeysForAvailableGroups).toHaveBeenCalledTimes(1)
    })

    await accountKeyRepairRunner.cancel()

    resolveFirstRun?.({
      created: false,
      availableGroups: [],
      coveredGroups: [],
      createdGroups: [],
      missingGroups: [],
      invalidTokens: [],
    })

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress.state).toBe(ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled)
    })

    await vi.waitFor(async () => {
      await expect(accountKeyRepairRunner.start()).resolves.toMatchObject({
        jobId: "job-second",
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
      })
    })

    await vi.waitFor(() => {
      expect(mocks.ensureAccountKeysForAvailableGroups).toHaveBeenCalledTimes(2)
    })

    resolveSecondRun?.({
      created: false,
      availableGroups: ["default"],
      coveredGroups: ["default"],
      createdGroups: [],
      missingGroups: [],
      invalidTokens: [],
    })

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress).toMatchObject({
        jobId: "job-second",
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
        summary: expect.objectContaining({
          alreadyHad: 1,
        }),
      })
    })
  })

  it("does not record a failed result when account repair rejects after cancellation", async () => {
    const account = buildSiteAccount({
      id: "reject-after-cancel",
      site_type: "new-api",
      site_url: "https://reject.example.com",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      account_info: {
        id: "301",
        access_token: "reject-token",
        username: "reject-after-cancel",
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
      name: "Reject After Cancel",
      baseUrl: account.site_url,
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      userId: "301",
      token: "reject-token",
    })
    let rejectRepair: ((error: Error) => void) | undefined

    mocks.getAllAccounts.mockResolvedValue([account])
    mocks.convertToDisplayData.mockReturnValue([displayAccount])
    mocks.ensureAccountKeysForAvailableGroups.mockImplementation(
      () =>
        new Promise((_, reject) => {
          rejectRepair = reject
        }),
    )

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await accountKeyRepairRunner.start()
    await vi.waitFor(() => {
      expect(mocks.ensureAccountKeysForAvailableGroups).toHaveBeenCalledTimes(1)
    })

    await accountKeyRepairRunner.cancel()
    rejectRepair?.(new Error("repair failed after cancel"))

    await vi.waitFor(async () => {
      await expect(accountKeyRepairRunner.getProgress()).resolves.toMatchObject(
        {
          jobId: "job-123",
          state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
          results: [],
          summary: expect.objectContaining({
            failed: 0,
          }),
        },
      )
    })
  })

  it("skips account processing when entered with an already aborted signal", async () => {
    const account = buildSiteAccount({
      id: "pre-aborted",
      site_type: "new-api",
      site_url: "https://aborted.example.com",
      authType: AuthTypeEnum.AccessToken,
      disabled: false,
      account_info: {
        id: "301",
        access_token: "aborted-token",
        username: "pre-aborted",
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
      name: "Pre Aborted",
      baseUrl: account.site_url,
      siteType: SITE_TYPES.NEW_API,
      authType: AuthTypeEnum.AccessToken,
      userId: "301",
      token: "aborted-token",
    })
    const abortController = new AbortController()
    abortController.abort()

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await (
      accountKeyRepairRunner as unknown as {
        processEligibleAccount(
          account: SiteAccount,
          accountName: string,
          displaySiteDataById: ReadonlyMap<string, DisplaySiteData>,
          abortSignal: AbortSignal,
        ): Promise<void>
      }
    ).processEligibleAccount(
      account,
      "Pre Aborted",
      new Map([[account.id, displayAccount]]),
      abortController.signal,
    )

    expect(mocks.ensureAccountKeysForAvailableGroups).not.toHaveBeenCalled()
  })

  it("marks the repair job as failed when loading accounts throws", async () => {
    mocks.getAllAccounts.mockRejectedValueOnce(new Error("boom"))

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    const started = await accountKeyRepairRunner.start()
    expect(started).toMatchObject({
      jobId: "job-123",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
    })

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress.state).toBe(ACCOUNT_KEY_REPAIR_JOB_STATES.Failed)
    })

    await expect(accountKeyRepairRunner.getProgress()).resolves.toMatchObject({
      jobId: "job-123",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Failed,
      lastError: "boom",
    })
  })

  it("exposes typed operation helpers for start, get-progress, and cancel", async () => {
    mocks.getAllAccounts.mockResolvedValue([])
    mocks.convertToDisplayData.mockReturnValue([])

    const {
      cancelAccountKeyRepair,
      getAccountKeyRepairProgress,
      startAccountKeyRepair,
    } = await import("~/services/accounts/accountKeyAutoProvisioning/repair")

    await expect(startAccountKeyRepair()).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        jobId: "job-123",
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
      }),
    })

    await expect(getAccountKeyRepairProgress()).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        jobId: "job-123",
      }),
    })

    await expect(cancelAccountKeyRepair()).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        jobId: "job-123",
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
      }),
    })

    mocks.getAllAccounts.mockRejectedValueOnce(new Error("boom"))
    await expect(startAccountKeyRepair()).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        jobId: "job-123",
        state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
      }),
    })
  })

  it("propagates typed operation helper failures to the listener failure wrapper", async () => {
    const repairModule = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )
    const startSpy = vi
      .spyOn(repairModule.accountKeyRepairRunner, "start")
      .mockRejectedValueOnce(new Error("handler boom"))

    await expect(repairModule.startAccountKeyRepair()).rejects.toThrow(
      "handler boom",
    )
    expect(startSpy).toHaveBeenCalledTimes(1)
  })
})
