import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  loadSub2ApiDashboardEstimateData,
  resolveSub2ApiKeyGroupForPriceEstimation,
} from "~/services/apiAdapters/sub2api/dashboardEstimates"
import {
  fetchSub2ApiAvailableGroups,
  fetchSub2ApiGroupRates,
  fetchSub2ApiKeys,
} from "~/services/apiService/sub2api"
import type { Sub2ApiNativeKey } from "~/services/apiService/sub2api/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

vi.mock("~/services/apiService/sub2api", () => ({
  fetchSub2ApiKeys: vi.fn(),
  fetchSub2ApiAvailableGroups: vi.fn(),
  fetchSub2ApiGroupRates: vi.fn(),
  fetchSub2ApiPricingCatalogs: vi.fn().mockResolvedValue(undefined),
}))
const request: ApiServiceRequest = {
  baseUrl: "https://sub2api.example.invalid",
  accountId: "account-1",
  auth: {
    authType: AuthTypeEnum.AccessToken,
    userId: "1",
    accessToken: "dashboard-jwt",
  },
}
const ref = {
  accountId: "account-1",
  siteType: "sub2api",
  scopeKey: "account",
  resourceId: "7",
} as const
const groups = [
  { id: 9, name: "vip", rate_multiplier: 1.5 },
  { id: 10, name: "duplicate" },
  { id: 11, name: "duplicate" },
]
const key = (changes: Partial<Sub2ApiNativeKey> = {}): Sub2ApiNativeKey => ({
  id: 7,
  key: "secret",
  name: "Key",
  group_name: "vip",
  ...changes,
})

describe("native Sub2API price group resolution", () => {
  it("prefers the native key id and stable group id over duplicate names or secret equality", () => {
    expect(
      resolveSub2ApiKeyGroupForPriceEstimation({
        resourceId: "7",
        resolvedKey: "secret",
        groups,
        keys: [
          key({ group_id: 9, group_name: "duplicate", key: "masked*****" }),
          key({ id: 8, group_id: 10 }),
        ],
      }),
    ).toMatchObject({ groupId: "9", groupName: "vip" })
  })
  it("uses a unique unmasked secret only when native identity is absent", () => {
    expect(
      resolveSub2ApiKeyGroupForPriceEstimation({
        resourceId: "missing",
        resolvedKey: " secret ",
        groups,
        keys: [key({ group_id: 9 })],
      }),
    ).toMatchObject({ groupId: "9" })
    for (const keys of [
      [key(), key({ id: 8 })],
      [key({ key: "secret*****" })],
      [],
    ]) {
      expect(
        resolveSub2ApiKeyGroupForPriceEstimation({
          resourceId: "missing",
          resolvedKey: "secret",
          groups,
          keys,
        }),
      ).toBeNull()
    }
  })
  it("accepts a unique group name and rejects numeric-looking or duplicate names", () => {
    expect(
      resolveSub2ApiKeyGroupForPriceEstimation({
        resourceId: "7",
        resolvedKey: "secret",
        groups,
        keys: [key()],
      }),
    ).toMatchObject({ groupId: "9" })
    for (const group_name of ["duplicate", "9", ""])
      expect(
        resolveSub2ApiKeyGroupForPriceEstimation({
          resourceId: "7",
          resolvedKey: "secret",
          groups,
          keys: [key({ group_name })],
        }),
      ).toBeNull()
  })
})

describe("loadSub2ApiDashboardEstimateData", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it("returns selected pricing facts without leaking native inventory", async () => {
    vi.mocked(fetchSub2ApiAvailableGroups).mockResolvedValueOnce(groups)
    vi.mocked(fetchSub2ApiGroupRates).mockResolvedValueOnce({ "9": 2 })
    vi.mocked(fetchSub2ApiKeys).mockResolvedValueOnce([key({ group_id: 9 })])
    await expect(
      loadSub2ApiDashboardEstimateData(request, { ref, resolvedKey: "secret" }),
    ).resolves.toEqual({
      group: { groupId: "9", groupName: "vip", rate_multiplier: 1.5 },
      groupRates: { "9": 2 },
      pricingCatalogs: undefined,
    })
    expect(fetchSub2ApiKeys).toHaveBeenCalledWith(request)
  })
  it("rejects failed sources and cross-account locators", async () => {
    const error = new Error("dashboard unavailable")
    vi.mocked(fetchSub2ApiAvailableGroups).mockResolvedValueOnce(groups)
    vi.mocked(fetchSub2ApiGroupRates).mockRejectedValueOnce(error)
    vi.mocked(fetchSub2ApiKeys).mockResolvedValueOnce([])
    await expect(
      loadSub2ApiDashboardEstimateData(request, { ref, resolvedKey: "secret" }),
    ).rejects.toBe(error)
    vi.clearAllMocks()
    await expect(
      loadSub2ApiDashboardEstimateData(request, {
        ref: { ...ref, accountId: "other" },
        resolvedKey: "secret",
      }),
    ).rejects.toThrow("Invalid Sub2API key scope")
    expect(fetchSub2ApiKeys).not.toHaveBeenCalled()
  })
})
