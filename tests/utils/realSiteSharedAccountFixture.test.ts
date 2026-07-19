import { readFileSync } from "node:fs"
import path from "node:path"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { AuthTypeEnum, SiteHealthStatus, type SiteAccount } from "~/types"
import type { AccountFixture } from "~~/e2e/scenarios/accountFixtures"
import { readStoredAccounts } from "~~/e2e/scenarios/accountManualAdd"
import { seedStoredAccounts } from "~~/e2e/utils/commonUserFlows"
import {
  createSharedRealSiteAccountFixtureCache,
  resolveSharedRealSiteAccountFixture,
} from "~~/e2e/utils/realSite/sharedAccountFixture"

const mocks = vi.hoisted(() => ({
  readStoredAccounts: vi.fn(),
  seedStoredAccounts: vi.fn(),
}))

vi.mock("~~/e2e/scenarios/accountManualAdd", () => ({
  readStoredAccounts: mocks.readStoredAccounts,
}))

vi.mock("~~/e2e/utils/commonUserFlows", () => ({
  seedStoredAccounts: mocks.seedStoredAccounts,
}))

describe("shared real-site account fixture cache", () => {
  const storedAccount: SiteAccount = {
    id: "account-1",
    site_name: "Real Veloera",
    site_url: "https://veloera.example.invalid",
    site_type: SITE_TYPES.VELOERA,
    account_info: {
      id: "user-1",
      username: "tester",
      access_token: "token",
      quota: 100,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
    },
    health: { status: SiteHealthStatus.Healthy },
    exchange_rate: 7,
    last_sync_time: 1,
    created_at: 1,
    updated_at: 1,
    user_updated_at: 1,
    disabled: false,
    excludeFromTotalBalance: false,
    excludeFromTodayIncome: false,
    tagIds: [],
    notes: "",
    authType: AuthTypeEnum.AccessToken,
    checkIn: {
      enableDetection: false,
    },
  }

  const createdFixture: AccountFixture = {
    accountId: storedAccount.id,
    siteType: SITE_TYPES.VELOERA,
    baseUrl: storedAccount.site_url,
    cleanup: vi.fn().mockResolvedValue(undefined),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(readStoredAccounts).mockResolvedValue([storedAccount])
    vi.mocked(seedStoredAccounts).mockResolvedValue(undefined)
  })

  it("creates the real-site account once and reuses storage for later split checks", async () => {
    const cache = createSharedRealSiteAccountFixtureCache()
    const serviceWorkerA = {} as any
    const serviceWorkerB = {} as any
    const prepareAccountFixture = vi.fn().mockResolvedValue(createdFixture)
    const prepareReusedAccountFixture = vi.fn().mockResolvedValue(undefined)

    const firstFixture = await resolveSharedRealSiteAccountFixture({
      cache,
      serviceWorker: serviceWorkerA,
      prepareAccountFixture,
      prepareReusedAccountFixture,
    })
    const secondFixture = await resolveSharedRealSiteAccountFixture({
      cache,
      serviceWorker: serviceWorkerB,
      prepareAccountFixture,
      prepareReusedAccountFixture,
    })

    expect(prepareAccountFixture).toHaveBeenCalledOnce()
    expect(prepareReusedAccountFixture).toHaveBeenCalledOnce()
    expect(prepareReusedAccountFixture).toHaveBeenCalledWith(secondFixture)
    expect(readStoredAccounts).toHaveBeenCalledOnce()
    expect(seedStoredAccounts).toHaveBeenCalledOnce()
    expect(seedStoredAccounts).toHaveBeenCalledWith(serviceWorkerB, [
      storedAccount,
    ])
    expect(firstFixture).toMatchObject({
      accountId: "account-1",
      siteType: SITE_TYPES.VELOERA,
      baseUrl: "https://veloera.example.invalid",
    })
    expect(secondFixture).toMatchObject({
      accountId: "account-1",
      siteType: SITE_TYPES.VELOERA,
      baseUrl: "https://veloera.example.invalid",
    })
  })

  it("does not retry real-site preparation after a shared preparation failure", async () => {
    const cache = createSharedRealSiteAccountFixtureCache()
    const error = new Error("Veloera login returned HTTP 429")
    const prepareAccountFixture = vi.fn().mockRejectedValue(error)

    await expect(
      resolveSharedRealSiteAccountFixture({
        cache,
        serviceWorker: {} as any,
        prepareAccountFixture,
      }),
    ).rejects.toThrow(error)
    await expect(
      resolveSharedRealSiteAccountFixture({
        cache,
        serviceWorker: {} as any,
        prepareAccountFixture,
      }),
    ).rejects.toThrow(error)

    expect(prepareAccountFixture).toHaveBeenCalledOnce()
    expect(readStoredAccounts).not.toHaveBeenCalled()
    expect(seedStoredAccounts).not.toHaveBeenCalled()
  })
})

describe("real-site account spec structure", () => {
  const splitAccountSpecs = [
    "doneHubAccountAdd.spec.ts",
    "newApiAccountAdd.spec.ts",
    "oneHubAccountAdd.spec.ts",
    "sub2apiAccountAdd.spec.ts",
    "veloeraAccountAdd.spec.ts",
  ] as const

  it("uses shared account fixture caching for split real-site account specs", () => {
    const specsWithoutSharedFixture = splitAccountSpecs.filter((fileName) => {
      const source = readFileSync(
        path.join(process.cwd(), "e2e", "realSite", fileName),
        "utf8",
      )

      return !source.includes("resolveSharedRealSiteAccountFixture")
    })

    expect(specsWithoutSharedFixture).toEqual([])
  })
})
