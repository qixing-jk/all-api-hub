import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeMessageTypes } from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { TOKEN_PROVISIONING_REPAIR_POLICY_KINDS } from "~/services/apiAdapters/contracts/tokenProvisioning"
import { AuthTypeEnum } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_ERRORS,
  ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS,
  ACCOUNT_KEY_REPAIR_SKIP_REASONS,
} from "~/types/accountKeyAutoProvisioning"
import {
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

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
    mocks.storageMap.clear()
  })

  it("returns idle progress when no repair state has been stored", async () => {
    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(accountKeyRepairRunner.getProgress()).resolves.toEqual({
      jobId: "idle",
      state: "idle",
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
      state: "completed",
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
      results: [{ accountId: "acc-1", outcome: "created" }],
    })

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(accountKeyRepairRunner.getProgress()).resolves.toMatchObject({
      jobId: "job-stored",
      state: "completed",
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
      state: "running",
    })

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress.state).toBe("completed")
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
          outcome: "skipped",
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.Sub2Api,
          siteUrlOrigin: "https://sub2api.example.com",
        }),
        expect.objectContaining({
          accountId: "aihubmix-1",
          outcome: "skipped",
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.AihubmixOneTimeKey,
          siteUrlOrigin: "https://aihubmix.com",
        }),
        expect.objectContaining({
          accountId: "new-api-1",
          outcome: "created",
          siteUrlOrigin: "https://shared.example.com",
        }),
        expect.objectContaining({
          accountId: "bad-cookie-1",
          outcome: "failed",
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
      expect(progress.state).toBe("completed")
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
        outcome: "failed",
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
      state: "completed",
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
          outcome: "created",
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
      state: "completed",
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
          outcome: "created",
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
      state: "completed",
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
          outcome: "created",
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
      expect(progress.state).toBe("completed")
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
          outcome: "skipped",
          skipReason: ACCOUNT_KEY_REPAIR_SKIP_REASONS.NoneAuth,
        }),
        expect.objectContaining({
          accountId: "cookie-1",
          outcome: "alreadyHad",
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
      expect(progress.state).toBe("completed")
    })
  })

  it("marks the repair job as failed when loading accounts throws", async () => {
    mocks.getAllAccounts.mockRejectedValueOnce(new Error("boom"))

    const { accountKeyRepairRunner } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    const started = await accountKeyRepairRunner.start()
    expect(started).toMatchObject({
      jobId: "job-123",
      state: "running",
    })

    await vi.waitFor(async () => {
      const progress = await accountKeyRepairRunner.getProgress()
      expect(progress.state).toBe("failed")
    })

    await expect(accountKeyRepairRunner.getProgress()).resolves.toMatchObject({
      jobId: "job-123",
      state: "failed",
      lastError: "boom",
    })
  })

  it("exposes typed operation helpers for start and get-progress", async () => {
    mocks.getAllAccounts.mockResolvedValue([])
    mocks.convertToDisplayData.mockReturnValue([])

    const { getAccountKeyRepairProgress, startAccountKeyRepair } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await expect(startAccountKeyRepair()).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        jobId: "job-123",
        state: "running",
      }),
    })

    await expect(getAccountKeyRepairProgress()).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        jobId: "job-123",
      }),
    })

    mocks.getAllAccounts.mockRejectedValueOnce(new Error("boom"))
    await expect(startAccountKeyRepair()).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        jobId: "job-123",
        state: "running",
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
