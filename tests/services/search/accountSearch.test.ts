import { describe, expect, it } from "vitest"

import { searchAccounts } from "~/services/search/accountSearch"
import { AuthTypeEnum, SiteHealthStatus, type DisplaySiteData } from "~/types"

const mockAccounts: DisplaySiteData[] = [
  {
    id: "1",
    name: "OpenAI",
    username: "user1",
    baseUrl: "https://api.openai.com",
    token: "sk-test123",
    userId: 123,
    balance: { USD: 10, CNY: 70 },
    todayConsumption: { USD: 1, CNY: 7 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 100, download: 200 },
    health: { status: SiteHealthStatus.Healthy },
    last_sync_time: Date.now(),
    siteType: "one-api",
    authType: AuthTypeEnum.AccessToken,
    checkIn: {
      enableDetection: true,
      isCheckedInToday: false,
      customCheckInUrl: "https://checkin.openai.com/api",
      customRedeemUrl: "https://redeem.openai.com/api",
    },
    icon: "",
  },
  {
    id: "2",
    name: "Claude API",
    username: "user2",
    baseUrl: "https://api.anthropic.com",
    token: "sk-ant-test456",
    userId: 456,
    balance: { USD: 20, CNY: 140 },
    todayConsumption: { USD: 2, CNY: 14 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 200, download: 400 },
    health: { status: SiteHealthStatus.Healthy },
    last_sync_time: Date.now(),
    siteType: "one-api",
    authType: AuthTypeEnum.AccessToken,
    checkIn: {
      enableDetection: false,
      isCheckedInToday: false,
      customCheckInUrl: "",
      customRedeemUrl: "",
    },
    icon: "",
  },
]

describe("accountSearch", () => {
  describe("searchAccounts", () => {
    it("returns empty for empty query", () => {
      expect(searchAccounts(mockAccounts, "")).toEqual([])
      expect(searchAccounts(mockAccounts, "   ")).toEqual([])
    })

    it("finds exact name match", () => {
      const results = searchAccounts(mockAccounts, "OpenAI")
      expect(results).toHaveLength(1)
      expect(results[0].account.name).toBe("OpenAI")
      expect(results[0].matchedFields).toContain("name")
    })

    it("finds case-insensitive match", () => {
      const results = searchAccounts(mockAccounts, "openai")
      expect(results).toHaveLength(1)
      expect(results[0].account.name).toBe("OpenAI")
    })

    it("finds partial name match", () => {
      const results = searchAccounts(mockAccounts, "Claude")
      expect(results).toHaveLength(1)
      expect(results[0].account.name).toBe("Claude API")
    })

    it("finds URL domain match", () => {
      const results = searchAccounts(mockAccounts, "openai.com")
      expect(results).toHaveLength(1)
      expect(results[0].matchedFields).toContain("baseUrl")
    })

    it("finds username match", () => {
      const results = searchAccounts(mockAccounts, "user1")
      expect(results).toHaveLength(1)
      expect(results[0].account.username).toBe("user1")
      expect(results[0].matchedFields).toContain("username")
    })

    it("finds customCheckInUrl match", () => {
      const results = searchAccounts(mockAccounts, "checkin.openai.com")
      expect(results).toHaveLength(1)
      expect(results[0].matchedFields).toContain("customCheckInUrl")
    })

    it("finds customRedeemUrl match", () => {
      const results = searchAccounts(mockAccounts, "redeem.openai.com")
      expect(results).toHaveLength(1)
      expect(results[0].matchedFields).toContain("customRedeemUrl")
    })

    it("handles multiple keywords", () => {
      const results = searchAccounts(mockAccounts, "OpenAI user1")
      expect(results).toHaveLength(1)
      expect(results[0].account.name).toBe("OpenAI")
    })

    it("requires all keywords to match", () => {
      const results = searchAccounts(mockAccounts, "OpenAI user2")
      expect(results).toHaveLength(0)
    })

    it("normalizes full-width characters", () => {
      const results = searchAccounts(mockAccounts, "ＯｐｅｎＡＩ")
      expect(results).toHaveLength(1)
    })

    it("removes protocol from URL search", () => {
      const results = searchAccounts(mockAccounts, "https://api.openai.com")
      expect(results).toHaveLength(1)
    })

    it("returns results with scores", () => {
      const results = searchAccounts(mockAccounts, "api")
      expect(results.length).toBeGreaterThan(0)
      results.forEach((result) => {
        expect(result.score).toBeGreaterThan(0)
      })
    })

    it("returns empty for no matches", () => {
      const results = searchAccounts(mockAccounts, "nonexistent")
      expect(results).toEqual([])
    })
  })
})
