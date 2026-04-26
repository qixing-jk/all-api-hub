import { describe, expect, it } from "vitest"

import {
  buildAccountSearchIndex,
  normalizeSearchText,
  normalizeSearchUrl,
  searchAccounts,
  searchAccountSearchIndex,
} from "~/services/search/accountSearch"
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
      siteStatus: { isCheckedInToday: false },
      customCheckIn: {
        url: "https://checkin.openai.com/api",
        redeemUrl: "https://redeem.openai.com/api",
      },
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
      siteStatus: { isCheckedInToday: false },
      customCheckIn: { url: "", redeemUrl: "" },
    },
    icon: "",
  },
]

describe("accountSearch", () => {
  describe("normalization helpers", () => {
    it("normalizes empty general and url search text to empty strings", () => {
      expect(normalizeSearchText("")).toBe("")
      expect(normalizeSearchUrl("")).toBe("")
    })
  })

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

    it("treats username punctuation literally instead of URL-normalizing it", () => {
      const results = searchAccounts(
        [
          {
            ...mockAccounts[0],
            id: "3",
            username: "alice#1",
          },
        ],
        "alice#1",
      )

      expect(results).toHaveLength(1)
      expect(results[0].account.username).toBe("alice#1")
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

    it("matches url path segments in base urls", () => {
      const results = searchAccounts(
        [
          {
            ...mockAccounts[0],
            id: "path-account",
            baseUrl: "https://example.com/provider/openai/v1",
          },
        ],
        "openai",
      )

      expect(results).toHaveLength(1)
      expect(results[0].matchedFields).toContain("baseUrl")
    })

    it("handles multiple keywords", () => {
      const results = searchAccounts(mockAccounts, "OpenAI user1")
      expect(results).toHaveLength(1)
      expect(results[0].account.name).toBe("OpenAI")
    })

    it("matches both base name and username for a disambiguated label", () => {
      const results = searchAccounts(
        [
          ...mockAccounts,
          {
            ...mockAccounts[0],
            id: "3",
            name: "My Site · alice",
            username: "alice",
          },
        ],
        "My Site alice",
      )

      expect(results).toHaveLength(1)
      expect(results[0].account.id).toBe("3")
      expect(results[0].matchedFields).toEqual(
        expect.arrayContaining(["name", "username"]),
      )
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

    it("matches an account by a full open-tab URL", () => {
      const results = searchAccounts(
        [
          {
            ...mockAccounts[0],
            id: "tab-match",
            baseUrl: "https://foo.example.com",
          },
        ],
        "https://foo.example.com/dashboard",
      )

      expect(results).toHaveLength(1)
      expect(results[0].account.id).toBe("tab-match")
      expect(results[0].matchedFields).toContain("baseUrl")
    })

    it("does not match every account when the query contains only a path", () => {
      const results = searchAccounts(mockAccounts, "/dashboard")

      expect(results).toEqual([])
    })

    it("does not match shorter path segments against longer query segments", () => {
      const results = searchAccounts(
        [
          {
            ...mockAccounts[0],
            id: "short-path-segment",
            name: "Hidden",
            username: "nobody",
            baseUrl: "https://example.com/v",
          },
        ],
        "v1",
      )

      expect(results).toEqual([])
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

    it("returns the same results when searching a prebuilt index", () => {
      const index = buildAccountSearchIndex(mockAccounts)
      const query = "openai user1"

      expect(searchAccountSearchIndex(index, query)).toEqual(
        searchAccounts(mockAccounts, query),
      )
    })

    it("does not treat query-only url fragments as a match for every account url", () => {
      const results = searchAccounts(mockAccounts, "?unmatched")

      expect(results).toEqual([])
    })

    it("matches tags without exposing token-only fields", () => {
      const results = searchAccounts(
        [
          {
            ...mockAccounts[0],
            id: "tagged",
            tags: ["VIP access", "   "],
          },
        ],
        "VIP",
      )

      expect(results).toHaveLength(1)
      expect(results[0].matchedFields).toContain("tags")
    })

    it("can match by internal account id when no visible field matches", () => {
      const results = searchAccounts(
        [
          {
            ...mockAccounts[0],
            id: "account-12345",
            name: "Hidden",
            username: "nobody",
            token: "totally-secret",
            checkIn: {
              enableDetection: false,
              siteStatus: { isCheckedInToday: false },
              customCheckIn: { url: "", redeemUrl: "" },
            },
          },
        ],
        "12345",
      )

      expect(results).toHaveLength(1)
      expect(results[0].matchedFields).toEqual([])
      expect(results[0].score).toBe(1)
    })

    it("can match by token without surfacing token in matched fields", () => {
      const results = searchAccounts(
        [
          {
            ...mockAccounts[0],
            id: "token-only",
            name: "Hidden",
            username: "nobody",
            token: "secret-token-value",
            checkIn: {
              enableDetection: false,
              siteStatus: { isCheckedInToday: false },
              customCheckIn: { url: "", redeemUrl: "" },
            },
          },
        ],
        "token-value",
      )

      expect(results).toHaveLength(1)
      expect(results[0].matchedFields).toEqual([])
      expect(results[0].score).toBe(1)
    })
  })
})
