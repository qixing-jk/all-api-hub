import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  RuntimeActionIds,
  RuntimeMessageTypes,
} from "~/constants/runtimeActions"
import { SITE_TYPES } from "~/constants/siteType"
import { AuthTypeEnum } from "~/types"
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

vi.mock(
  "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken",
  () => ({
    ensureDefaultApiTokenForAccount: mocks.ensureDefaultApiTokenForAccount,
  }),
)

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
        id: 101,
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
        id: 202,
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
        userId: 1,
        token: "sub2api-token",
      }),
      buildDisplaySiteData({
        id: aihubmixAccount.id,
        name: "AIHubMix",
        baseUrl: aihubmixAccount.site_url,
        siteType: aihubmixAccount.site_type,
        authType: AuthTypeEnum.AccessToken,
        userId: 2,
        token: "aihubmix-token",
      }),
      buildDisplaySiteData({
        id: validAccount.id,
        name: "Valid Account",
        baseUrl: validAccount.site_url,
        siteType: "new-api",
        authType: AuthTypeEnum.AccessToken,
        userId: 101,
        token: "access-token",
      }),
      buildDisplaySiteData({
        id: invalidDisplayAccount.id,
        name: "Broken Cookie Account",
        baseUrl: invalidDisplayAccount.site_url,
        siteType: "new-api",
        authType: AuthTypeEnum.Cookie,
        userId: 202,
        token: "",
        cookieAuthSessionCookie: "",
      }),
    ])
    mocks.ensureDefaultApiTokenForAccount.mockResolvedValueOnce({
      token: { id: 1, key: "created-token" },
      created: true,
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
    })
    expect(progress.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: "sub2api-1",
          outcome: "skipped",
          skipReason: "sub2api",
          siteUrlOrigin: "https://sub2api.example.com",
        }),
        expect.objectContaining({
          accountId: "aihubmix-1",
          outcome: "skipped",
          skipReason: "aihubmixOneTimeKey",
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
          errorMessage: "invalid_display_site_data",
          siteUrlOrigin: "https://cookie.example.com",
        }),
      ]),
    )
    expect(mocks.ensureDefaultApiTokenForAccount).toHaveBeenCalledTimes(1)
    expect(mocks.sendRuntimeMessage).toHaveBeenCalledWith(
      {
        type: RuntimeMessageTypes.AccountKeyRepairProgress,
        payload: expect.objectContaining({ jobId: "job-123" }),
      },
      { maxAttempts: 1 },
    )
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
        id: 404,
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
            siteType: "new-api",
            authType: AuthTypeEnum.None,
            userId: 1,
          }),
        ]
      }

      return buildDisplaySiteData({
        id: cookieAccount.id,
        name: "Cookie Fallback",
        baseUrl: cookieAccount.site_url,
        siteType: "new-api",
        authType: AuthTypeEnum.Cookie,
        userId: 404,
        token: "",
        cookieAuthSessionCookie: "session=abc",
      })
    })
    mocks.ensureDefaultApiTokenForAccount.mockResolvedValueOnce({
      token: { id: 3, key: "cookie-created" },
      created: false,
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
    })
    expect(progress.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          accountId: "none-auth-1",
          outcome: "skipped",
          skipReason: "noneAuth",
        }),
        expect.objectContaining({
          accountId: "cookie-1",
          outcome: "alreadyHad",
          siteUrlOrigin: "https://cookie.example.com",
        }),
      ]),
    )
    expect(mocks.convertToDisplayData).toHaveBeenCalledWith(cookieAccount)
    expect(mocks.ensureDefaultApiTokenForAccount).toHaveBeenCalledWith({
      account: cookieAccount,
      displaySiteData: expect.objectContaining({
        id: "cookie-1",
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "session=abc",
      }),
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
          id: 303,
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
        siteType: "new-api",
        authType: AuthTypeEnum.AccessToken,
        userId: 303,
        token: "queued-token",
      }),
    ])
    mocks.ensureDefaultApiTokenForAccount.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvers.push(() =>
            resolve({
              token: { id: 2, key: "queued-token-created" },
              created: false,
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

  it("handles runtime actions for start, get-progress, unknown action, and thrown failures", async () => {
    const sendResponse = vi.fn()
    mocks.getAllAccounts.mockResolvedValue([])
    mocks.convertToDisplayData.mockReturnValue([])

    const { handleAccountKeyRepairMessage } = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )

    await handleAccountKeyRepairMessage(
      { action: RuntimeActionIds.AccountKeyRepairStart },
      sendResponse,
    )
    expect(sendResponse).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        jobId: "job-123",
        state: "running",
      }),
    })

    await handleAccountKeyRepairMessage(
      { action: RuntimeActionIds.AccountKeyRepairGetProgress },
      sendResponse,
    )
    expect(sendResponse).toHaveBeenLastCalledWith({
      success: true,
      data: expect.objectContaining({
        jobId: "job-123",
      }),
    })

    await handleAccountKeyRepairMessage({ action: "unknown" }, sendResponse)
    expect(sendResponse).toHaveBeenLastCalledWith({
      success: false,
      error: "Unknown action",
    })

    mocks.getAllAccounts.mockRejectedValueOnce(new Error("boom"))
    const failingResponse = vi.fn()
    await handleAccountKeyRepairMessage(
      { action: RuntimeActionIds.AccountKeyRepairStart },
      failingResponse,
    )
    expect(failingResponse).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({
        jobId: "job-123",
        state: "running",
      }),
    })
  })

  it("returns an error payload when the message handler itself throws", async () => {
    const sendResponse = vi.fn()
    const repairModule = await import(
      "~/services/accounts/accountKeyAutoProvisioning/repair"
    )
    const startSpy = vi
      .spyOn(repairModule.accountKeyRepairRunner, "start")
      .mockRejectedValueOnce(new Error("handler boom"))

    await repairModule.handleAccountKeyRepairMessage(
      { action: RuntimeActionIds.AccountKeyRepairStart },
      sendResponse,
    )

    expect(startSpy).toHaveBeenCalledTimes(1)
    expect(sendResponse).toHaveBeenCalledWith({
      success: false,
      error: "handler boom",
    })
  })
})
