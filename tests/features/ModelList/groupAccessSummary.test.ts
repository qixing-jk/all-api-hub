import { describe, expect, it } from "vitest"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { summarizeModelListGroupAccess } from "~/features/ModelList/groupAccessSummary"
import { createAccountSource } from "~/features/ModelList/modelManagementSources"
import type { PreparedModelListSource } from "~/features/ModelList/sourcePreparation"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"

const createAccountFixture = (siteType: AccountSiteType): DisplaySiteData => ({
  id: `account-${siteType}`,
  name: "Example Account",
  username: "example-user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  todayStatsAvailability: buildCompleteTodayStatsAvailability(),
  health: { status: SiteHealthStatus.Healthy },
  siteType,
  baseUrl: "https://account.example.invalid",
  token: "example-token",
  userId: "example-user-id",
  authType: AuthTypeEnum.AccessToken,
  checkIn: buildCheckInConfig(),
})

function evidence(
  id: string,
  authoritative: boolean,
  groupRatios: Record<string, number>,
) {
  return {
    source: createAccountSource({
      ...createAccountFixture(SITE_TYPES.NEW_API),
      id,
    }),
    groupRatios,
    groupAccessEvidence: authoritative ? "authoritative" : "insufficient",
  } satisfies Pick<
    PreparedModelListSource,
    "source" | "groupRatios" | "groupAccessEvidence"
  >
}
describe("model list group access summary", () => {
  it("requires every context for the selected account to be authoritative, including empty ones", () => {
    const result = summarizeModelListGroupAccess({
      usesAccountContexts: true,
      selectedAccountId: "selected",
      sources: [
        evidence("other", true, { other: 2 }),
        evidence("selected", true, { vip: 1 }),
        evidence("selected", false, {}),
      ],
    })
    expect(result.isGroupAccessAuthoritative).toBe(false)
    expect(result.singleSourceGroupRatios).toEqual({})
    expect(result.authoritativeGroupAccessByAccountId).toEqual({
      other: true,
      selected: false,
    })
  })
  it("does not let later agreement restore conflicting ratios", () => {
    const result = summarizeModelListGroupAccess({
      usesAccountContexts: true,
      selectedAccountId: "selected",
      sources: [
        evidence("selected", true, { vip: 0 }),
        evidence("selected", true, { vip: 1 }),
        evidence("selected", true, { vip: 0 }),
      ],
    })
    expect(result.isGroupAccessAuthoritative).toBe(true)
    expect(result.singleSourceGroupRatios).toEqual({})
  })
  it("compares normalized ratios by value rather than key insertion order", () => {
    const result = summarizeModelListGroupAccess({
      usesAccountContexts: true,
      selectedAccountId: "selected",
      sources: [
        evidence("selected", true, { a: 0, b: 1 }),
        evidence("selected", true, { b: 1, a: 0 }),
      ],
    })
    expect(result.singleSourceGroupRatios).toEqual({ a: 0, b: 1 })
  })
  it("does not borrow another account's authority when the selected account is missing", () => {
    const result = summarizeModelListGroupAccess({
      usesAccountContexts: true,
      selectedAccountId: "absent",
      sources: [evidence("other", true, { a: 1 })],
    })
    expect(result.isGroupAccessAuthoritative).toBe(false)
    expect(result.singleSourceGroupRatios).toEqual({})
  })
  it("uses a single source without creating aggregate-account repair state", () => {
    const result = summarizeModelListGroupAccess({
      usesAccountContexts: false,
      sources: [evidence("single", true, { a: 0 })],
    })
    expect(result.isGroupAccessAuthoritative).toBe(true)
    expect(result.singleSourceGroupRatios).toEqual({ a: 0 })
    expect(result.authoritativeGroupAccessByAccountId).toEqual({})
  })
})
