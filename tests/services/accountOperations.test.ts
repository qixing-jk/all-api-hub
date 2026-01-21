import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  extractDomainPrefix,
  isValidAccount,
  isValidExchangeRate,
  validateAndUpdateAccount,
} from "~/services/accountOperations"
import { AuthTypeEnum } from "~/types"

const { mockFetchAccountData, mockUpdateAccount } = vi.hoisted(() => ({
  mockFetchAccountData: vi.fn(),
  mockUpdateAccount: vi.fn(),
}))

vi.mock("~/services/apiService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/services/apiService")>()
  return {
    ...actual,
    getApiService: vi.fn(() => ({
      fetchAccountData: mockFetchAccountData,
    })),
  }
})

vi.mock("~/services/accountStorage", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/services/accountStorage")>()

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
      expect(mockUpdateAccount).toHaveBeenCalledWith(
        "account-1",
        expect.objectContaining({
          tagIds: [],
        }),
      )
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
})
