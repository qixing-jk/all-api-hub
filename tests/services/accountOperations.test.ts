import { beforeEach, describe, expect, it, vi } from "vitest"

import { SUB2API } from "~/constants/siteType"
import { UI_CONSTANTS } from "~/constants/ui"
import {
  extractDomainPrefix,
  getSiteName,
  isValidAccount,
  isValidExchangeRate,
  parseManualQuotaFromUsd,
  validateAndUpdateAccount,
} from "~/services/accounts/accountOperations"
import { getApiService } from "~/services/apiService"
import { AuthTypeEnum } from "~/types"

const { mockFetchAccountData, mockFetchSiteStatus, mockUpdateAccount } =
  vi.hoisted(() => ({
    mockFetchAccountData: vi.fn(),
    mockFetchSiteStatus: vi.fn(),
    mockUpdateAccount: vi.fn(),
  }))

vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: vi.fn(() => ({
      fetchAccountData: mockFetchAccountData,
      fetchSiteStatus: mockFetchSiteStatus,
    })),
  }
})

vi.mock("~/services/accounts/accountStorage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/accounts/accountStorage")>()

  return {
    ...actual,
    accountStorage: {
      ...actual.accountStorage,
      updateAccount: mockUpdateAccount,
    },
  }
})

describe("accountOperations", () => {
  beforeEach(() => {
    mockFetchAccountData.mockReset()
    mockFetchSiteStatus.mockReset()
    mockUpdateAccount.mockReset()
  })

  describe("validateAndUpdateAccount", () => {
    it("persists empty tagIds to clear account tags", async () => {
      mockFetchAccountData.mockResolvedValueOnce({
        quota: 1,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
        checkIn: { enableDetection: false },
      })
      mockUpdateAccount.mockResolvedValueOnce(true)

      const result = await validateAndUpdateAccount(
        "account-1",
        "https://api.example.com",
        "Test Site",
        "user",
        "token",
        "1",
        "7.0",
        "notes",
        [],
        { enableDetection: false },
        "openai",
        AuthTypeEnum.AccessToken,
        "",
      )

      expect(result.success).toBe(true)
      expect(result.feedbackLevel).toBe("success")
      expect(mockUpdateAccount).toHaveBeenCalledWith(
        "account-1",
        expect.objectContaining({
          tagIds: [],
        }),
      )
    })

    it("clears tagIds even when data refresh fails", async () => {
      mockFetchAccountData.mockRejectedValueOnce(new Error("network error"))
      mockUpdateAccount.mockResolvedValueOnce(true)

      const result = await validateAndUpdateAccount(
        "account-1",
        "https://api.example.com",
        "Test Site",
        "user",
        "token",
        "1",
        "7.0",
        "notes",
        [],
        { enableDetection: false },
        "openai",
        AuthTypeEnum.AccessToken,
        "",
      )

      expect(result.success).toBe(true)
      expect(result).toMatchObject({
        message: "messages:warnings.accountUpdatedWithoutDataRefresh",
        feedbackLevel: "warning",
      })
      expect(mockUpdateAccount).toHaveBeenCalledWith(
        "account-1",
        expect.objectContaining({
          tagIds: [],
        }),
      )
    })

    it("returns a stable failure when the refreshed update cannot be persisted", async () => {
      mockFetchAccountData.mockResolvedValueOnce({
        quota: 1,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
        checkIn: { enableDetection: false },
      })
      mockUpdateAccount.mockResolvedValueOnce(false)

      const result = await validateAndUpdateAccount(
        "account-1",
        "https://api.example.com",
        "Test Site",
        "user",
        "token",
        "1",
        "7.0",
        "notes",
        [],
        { enableDetection: false },
        "openai",
        AuthTypeEnum.AccessToken,
        "",
      )

      expect(result).toEqual({
        success: false,
        message: "messages:errors.validation.updateAccountFailed",
      })
    })

    it("returns the same stable failure when the config-only fallback update cannot be persisted", async () => {
      mockFetchAccountData.mockRejectedValueOnce(new Error("network error"))
      mockUpdateAccount.mockResolvedValueOnce(false)

      const result = await validateAndUpdateAccount(
        "account-1",
        "https://api.example.com",
        "Test Site",
        "user",
        "token",
        "1",
        "7.0",
        "notes",
        [],
        { enableDetection: false },
        "openai",
        AuthTypeEnum.AccessToken,
        "",
      )

      expect(result).toEqual({
        success: false,
        message: "messages:errors.validation.updateAccountFailed",
      })
    })
  })

  describe("isValidAccount", () => {
    it("validates complete account", () => {
      expect(
        isValidAccount({
          siteName: "Test",
          username: "user",
          userId: "123",
          authType: AuthTypeEnum.AccessToken,
          accessToken: "token",
          exchangeRate: "7.0",
        }),
      ).toBe(true)
    })

    it("rejects empty siteName", () => {
      expect(
        isValidAccount({
          siteName: "",
          username: "user",
          userId: "123",
          authType: AuthTypeEnum.AccessToken,
          accessToken: "token",
          exchangeRate: "7.0",
        }),
      ).toBe(false)
    })

    it("rejects empty username", () => {
      expect(
        isValidAccount({
          siteName: "Test",
          username: "",
          userId: "123",
          authType: AuthTypeEnum.AccessToken,
          accessToken: "token",
          exchangeRate: "7.0",
        }),
      ).toBe(false)
    })

    it("allows empty username for Sub2API accounts", () => {
      expect(
        isValidAccount({
          siteName: "Test",
          username: "",
          userId: "123",
          siteType: SUB2API,
          authType: AuthTypeEnum.AccessToken,
          accessToken: "token",
          exchangeRate: "7.0",
        }),
      ).toBe(true)
    })

    it("rejects empty userId", () => {
      expect(
        isValidAccount({
          siteName: "Test",
          username: "user",
          userId: "",
          authType: AuthTypeEnum.AccessToken,
          accessToken: "token",
          exchangeRate: "7.0",
        }),
      ).toBe(false)
    })

    it("rejects invalid exchange rate", () => {
      expect(
        isValidAccount({
          siteName: "Test",
          username: "user",
          userId: "123",
          authType: AuthTypeEnum.AccessToken,
          accessToken: "token",
          exchangeRate: "invalid",
        }),
      ).toBe(false)
    })

    it("allows empty accessToken for Cookie auth", () => {
      expect(
        isValidAccount({
          siteName: "Test",
          username: "user",
          userId: "123",
          authType: AuthTypeEnum.Cookie,
          accessToken: "",
          cookieAuthSessionCookie: "session=abc",
          exchangeRate: "7.0",
        }),
      ).toBe(true)
    })

    it("rejects empty token for AccessToken auth", () => {
      expect(
        isValidAccount({
          siteName: "Test",
          username: "user",
          userId: "123",
          authType: AuthTypeEnum.AccessToken,
          accessToken: "",
          exchangeRate: "7.0",
        }),
      ).toBe(false)
    })
  })

  describe("isValidExchangeRate", () => {
    it("accepts valid rates", () => {
      expect(isValidExchangeRate("7.0")).toBe(true)
      expect(isValidExchangeRate("1")).toBe(true)
      expect(isValidExchangeRate("0.11111111111111111111")).toBe(true)
      expect(isValidExchangeRate("1000000000000000000000")).toBe(true)
    })

    it("rejects invalid rates", () => {
      expect(isValidExchangeRate("0")).toBe(false)
      expect(isValidExchangeRate("-1")).toBe(false)
      expect(isValidExchangeRate("abc")).toBe(false)
      expect(isValidExchangeRate("7foo")).toBe(false)
      expect(isValidExchangeRate("Infinity")).toBe(false)
      expect(isValidExchangeRate("")).toBe(false)
    })
  })

  describe("parseManualQuotaFromUsd", () => {
    it("rounds valid manual balances into quota units", () => {
      expect(parseManualQuotaFromUsd("1.234")).toBe(
        Math.round(1.234 * UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR),
      )
    })

    it("rejects blank, negative, and non-finite manual balances", () => {
      expect(parseManualQuotaFromUsd(undefined)).toBeUndefined()
      expect(parseManualQuotaFromUsd("   ")).toBeUndefined()
      expect(parseManualQuotaFromUsd("-1")).toBeUndefined()
      expect(parseManualQuotaFromUsd("Infinity")).toBeUndefined()
    })
  })

  describe("extractDomainPrefix", () => {
    it("extracts simple domain", () => {
      expect(extractDomainPrefix("example.com")).toBe("Example")
    })

    it("removes www prefix", () => {
      expect(extractDomainPrefix("www.example.com")).toBe("Example")
    })

    it("handles subdomains", () => {
      expect(extractDomainPrefix("api.example.com")).toBe("Example")
    })

    it("handles double suffixes", () => {
      expect(extractDomainPrefix("example.com.cn")).toBe("Example")
      expect(extractDomainPrefix("example.co.uk")).toBe("Example")
    })

    it("handles empty hostname", () => {
      expect(extractDomainPrefix("")).toBe("")
    })

    it("capitalizes first letter", () => {
      expect(extractDomainPrefix("github.com")).toBe("Github")
    })
  })

  describe("getSiteName", () => {
    it("prefers a custom browser-tab title without calling site status", async () => {
      const result = await getSiteName({
        id: 1,
        title: "Custom Portal",
        url: "https://example.com/console",
      } as browser.tabs.Tab)

      expect(result).toBe("Custom Portal")
      expect(mockFetchSiteStatus).not.toHaveBeenCalled()
    })

    it("falls back to the normalized domain when no site-type hint is available", async () => {
      mockFetchSiteStatus.mockResolvedValueOnce({
        system_name: "Billing Center",
      })

      const result = await getSiteName({
        id: 2,
        title: "new-api",
        url: "https://example.com/console",
      } as browser.tabs.Tab)

      expect(result).toBe("Example")
      expect(mockFetchSiteStatus).not.toHaveBeenCalled()
    })

    it("falls back to the normalized domain when site status also returns a default-like name", async () => {
      mockFetchSiteStatus.mockResolvedValueOnce({
        system_name: "one-api",
      })

      const result = await getSiteName("https://api.example.co.uk/console")

      expect(result).toBe("Example")
    })

    it("uses the provided site-type hint when resolving site status", async () => {
      mockFetchSiteStatus.mockResolvedValueOnce({
        system_name: "Sub2 Portal",
      })

      const result = await getSiteName(
        "https://sub2.example.com/console",
        SUB2API,
      )

      expect(result).toBe("Sub2 Portal")
      expect(vi.mocked(getApiService)).toHaveBeenCalledWith(SUB2API)
    })

    it("falls back to system_name when a default tab title is paired with a site-type hint", async () => {
      mockFetchSiteStatus.mockResolvedValueOnce({
        system_name: "Billing Center",
      })

      const result = await getSiteName(
        {
          id: 2,
          title: "new-api",
          url: "https://example.com/console",
        } as browser.tabs.Tab,
        "new-api",
      )

      expect(result).toBe("Billing Center")
      expect(mockFetchSiteStatus).toHaveBeenCalledWith({
        baseUrl: "https://example.com",
        auth: { authType: AuthTypeEnum.None },
      })
    })

    it("reuses provided site status instead of fetching it again", async () => {
      const result = await getSiteName(
        "https://example.com/console",
        "new-api",
        {
          system_name: "Billing Center",
        },
      )

      expect(result).toBe("Billing Center")
      expect(mockFetchSiteStatus).not.toHaveBeenCalled()
    })
  })
})
