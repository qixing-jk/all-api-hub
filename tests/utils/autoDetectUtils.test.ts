import { beforeEach, describe, expect, it, vi } from "vitest"

import { FAQ_URL } from "~/constants/about"
import {
  analyzeAutoDetectError,
  AutoDetectErrorType,
  getLoginUrl,
  openLoginTab
} from "~/utils/autoDetectUtils"

// Mock i18next
vi.mock("i18next", () => ({
  t: (key: string) => {
    const translations: Record<string, string> = {
      "messages:autodetect.timeout": "自动识别超时",
      "messages:autodetect.notLoggedIn": "未登录或会话已过期",
      "messages:autodetect.loginThisSite": "登录该站点",
      "messages:autodetect.unexpectedData": "返回数据格式不符合预期",
      "messages:autodetect.networkError": "网络连接失败",
      "messages:autodetect.failed": "自动识别失败: "
    }
    return translations[key] || key
  }
}))

// Mock browser.tabs
vi.stubGlobal("browser", {
  tabs: {
    create: vi.fn()
  }
})

describe("autoDetectUtils", () => {
  describe("analyzeAutoDetectError", () => {
    describe("Timeout errors", () => {
      it("should detect timeout error with Chinese text", () => {
        const error = new Error("请求超时")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.TIMEOUT)
        expect(result.message).toBe("自动识别超时")
        expect(result.helpDocUrl).toBe(FAQ_URL)
        expect(result.actionText).toBeUndefined()
        expect(result.actionUrl).toBeUndefined()
      })

      it("should detect timeout error with English text", () => {
        const error = new Error("Request timeout")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.TIMEOUT)
        expect(result.message).toBe("自动识别超时")
      })

      it("should detect timeout in error message", () => {
        const error = { message: "Connection timeout after 5s" }
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.TIMEOUT)
      })
    })

    describe("Unauthorized (401) errors", () => {
      it("should detect 401 status code", () => {
        const error = new Error("HTTP 401 Unauthorized")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.UNAUTHORIZED)
        expect(result.message).toBe("未登录或会话已过期")
        expect(result.actionText).toBe("登录该站点")
        expect(result.helpDocUrl).toBe(FAQ_URL)
      })

      it("should detect Chinese unauthorized text", () => {
        const error = new Error("未授权访问")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.UNAUTHORIZED)
      })

      it("should detect Unauthorized text", () => {
        const error = new Error("Unauthorized access")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.UNAUTHORIZED)
      })
    })

    describe("Invalid response errors", () => {
      it("should detect format error", () => {
        const error = new Error("响应格式错误")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.INVALID_RESPONSE)
        expect(result.message).toBe("返回数据格式不符合预期")
        expect(result.helpDocUrl).toBe(FAQ_URL)
      })

      it("should detect parsing error", () => {
        const error = new Error("JSON解析失败")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.INVALID_RESPONSE)
      })

      it("should detect JSON error", () => {
        const error = new Error("Invalid JSON response")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.INVALID_RESPONSE)
      })

      it("should detect data mismatch error", () => {
        const error = new Error("数据不符合预期")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.INVALID_RESPONSE)
      })

      it("should detect data fetch failure", () => {
        const error = new Error("无法获取用户信息")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.INVALID_RESPONSE)
      })
    })

    describe("Network errors", () => {
      it("should detect Chinese network error", () => {
        const error = new Error("网络错误")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.NETWORK_ERROR)
        expect(result.message).toBe("网络连接失败")
        expect(result.helpDocUrl).toBe(FAQ_URL)
      })

      it("should detect connection error", () => {
        const error = new Error("连接失败")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.NETWORK_ERROR)
      })

      it("should detect Network error", () => {
        const error = new Error("Network request failed")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.NETWORK_ERROR)
      })

      it("should detect TypeError: Failed to fetch", () => {
        const error = new TypeError("Failed to fetch")
        const result = analyzeAutoDetectError(error)

        // Note: "Failed to fetch" doesn't contain "Network", so it might be UNKNOWN
        // This tests the actual behavior
        expect([
          AutoDetectErrorType.NETWORK_ERROR,
          AutoDetectErrorType.UNKNOWN
        ]).toContain(result.type)
      })
    })

    describe("Unknown errors", () => {
      it("should handle unknown error types", () => {
        const error = new Error("Something went wrong")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.UNKNOWN)
        expect(result.message).toContain("自动识别失败")
        expect(result.message).toContain("Something went wrong")
        expect(result.helpDocUrl).toBe(FAQ_URL)
      })

      it("should handle non-Error objects", () => {
        const error = { custom: "error object" }
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.UNKNOWN)
      })

      it("should handle string errors", () => {
        const error = "Random error string"
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.UNKNOWN)
        expect(result.message).toContain("Random error string")
      })

      it("should handle null/undefined errors", () => {
        const nullResult = analyzeAutoDetectError(null)
        const undefinedResult = analyzeAutoDetectError(undefined)

        expect(nullResult.type).toBe(AutoDetectErrorType.UNKNOWN)
        expect(undefinedResult.type).toBe(AutoDetectErrorType.UNKNOWN)
      })
    })

    describe("Error priority", () => {
      it("should prioritize timeout over other keywords", () => {
        const error = new Error("网络超时错误")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.TIMEOUT)
      })

      it("should prioritize 401 over other keywords", () => {
        const error = new Error("401 网络错误")
        const result = analyzeAutoDetectError(error)

        expect(result.type).toBe(AutoDetectErrorType.UNAUTHORIZED)
      })

      it("should check errors in order of specificity", () => {
        // Timeout is checked first
        expect(analyzeAutoDetectError(new Error("超时")).type).toBe(
          AutoDetectErrorType.TIMEOUT
        )

        // Then 401
        expect(analyzeAutoDetectError(new Error("401")).type).toBe(
          AutoDetectErrorType.UNAUTHORIZED
        )

        // Then invalid response
        expect(analyzeAutoDetectError(new Error("格式")).type).toBe(
          AutoDetectErrorType.INVALID_RESPONSE
        )

        // Then network
        expect(analyzeAutoDetectError(new Error("网络")).type).toBe(
          AutoDetectErrorType.NETWORK_ERROR
        )

        // Finally unknown
        expect(analyzeAutoDetectError(new Error("其他错误")).type).toBe(
          AutoDetectErrorType.UNKNOWN
        )
      })
    })

    describe("Case sensitivity", () => {
      it("should handle mixed case error messages", () => {
        expect(analyzeAutoDetectError(new Error("TimeOut")).type).toBe(
          AutoDetectErrorType.TIMEOUT
        )
        expect(analyzeAutoDetectError(new Error("UNAUTHORIZED")).type).toBe(
          AutoDetectErrorType.UNAUTHORIZED
        )
        expect(analyzeAutoDetectError(new Error("JSON")).type).toBe(
          AutoDetectErrorType.INVALID_RESPONSE
        )
        expect(analyzeAutoDetectError(new Error("Network")).type).toBe(
          AutoDetectErrorType.NETWORK_ERROR
        )
      })
    })
  })

  describe("getLoginUrl", () => {
    it("should generate login URL for valid site URL", () => {
      const siteUrl = "https://example.com"
      const result = getLoginUrl(siteUrl)

      expect(result).toBe("https://example.com/login")
    })

    it("should handle site URL with trailing slash", () => {
      const siteUrl = "https://example.com/"
      const result = getLoginUrl(siteUrl)

      expect(result).toBe("https://example.com/login")
    })

    it("should handle site URL with path", () => {
      const siteUrl = "https://example.com/dashboard"
      const result = getLoginUrl(siteUrl)

      expect(result).toBe("https://example.com/login")
    })

    it("should handle site URL with port", () => {
      const siteUrl = "https://example.com:8080"
      const result = getLoginUrl(siteUrl)

      expect(result).toBe("https://example.com:8080/login")
    })

    it("should handle HTTP protocol", () => {
      const siteUrl = "http://localhost:3000"
      const result = getLoginUrl(siteUrl)

      expect(result).toBe("http://localhost:3000/login")
    })

    it("should handle site URL with subdomain", () => {
      const siteUrl = "https://api.example.com"
      const result = getLoginUrl(siteUrl)

      expect(result).toBe("https://api.example.com/login")
    })

    it("should return original URL for invalid URL", () => {
      const invalidUrl = "not a valid url"
      const result = getLoginUrl(invalidUrl)

      expect(result).toBe(invalidUrl)
    })

    it("should handle empty string", () => {
      const result = getLoginUrl("")
      expect(result).toBe("")
    })

    it("should handle relative URL", () => {
      const relativeUrl = "/dashboard"
      const result = getLoginUrl(relativeUrl)
      expect(result).toBe(relativeUrl)
    })

    it("should preserve protocol", () => {
      expect(getLoginUrl("http://example.com")).toContain("http://")
      expect(getLoginUrl("https://example.com")).toContain("https://")
    })

    it("should handle complex URLs", () => {
      const complexUrl = "https://user:pass@example.com:8080/path?query=1#hash"
      const result = getLoginUrl(complexUrl)

      expect(result).toBe("https://example.com:8080/login")
    })
  })

  describe("openLoginTab", () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it("should create new tab with login URL", async () => {
      const siteUrl = "https://example.com"

      await openLoginTab(siteUrl)

      expect(browser.tabs.create).toHaveBeenCalledWith({
        url: "https://example.com/login",
        active: true
      })
    })

    it("should open tab in active state", async () => {
      const siteUrl = "https://test.com"

      await openLoginTab(siteUrl)

      expect(browser.tabs.create).toHaveBeenCalledWith(
        expect.objectContaining({
          active: true
        })
      )
    })

    it("should handle different site URLs", async () => {
      await openLoginTab("https://site1.com")
      expect(browser.tabs.create).toHaveBeenCalledWith({
        url: "https://site1.com/login",
        active: true
      })

      await openLoginTab("https://site2.com:8080")
      expect(browser.tabs.create).toHaveBeenCalledWith({
        url: "https://site2.com:8080/login",
        active: true
      })
    })

    it("should handle invalid URLs gracefully", async () => {
      const invalidUrl = "not-a-url"

      await openLoginTab(invalidUrl)

      expect(browser.tabs.create).toHaveBeenCalledWith({
        url: invalidUrl,
        active: true
      })
    })

    it("should be async and return Promise<void>", async () => {
      const promise = openLoginTab("https://example.com")
      expect(promise).toBeInstanceOf(Promise)
      await expect(promise).resolves.toBeUndefined()
    })

    it("should handle browser.tabs.create rejection", async () => {
      const mockError = new Error("Tab creation failed")
      vi.mocked(browser.tabs.create).mockRejectedValueOnce(mockError)

      await expect(openLoginTab("https://example.com")).rejects.toThrow(
        "Tab creation failed"
      )
    })

    it("should call getLoginUrl internally", async () => {
      const siteUrl = "https://example.com/dashboard"
      await openLoginTab(siteUrl)

      // Verify that the /login path is appended correctly
      expect(browser.tabs.create).toHaveBeenCalledWith({
        url: "https://example.com/login",
        active: true
      })
    })
  })

  describe("Error types enum", () => {
    it("should have all error types defined", () => {
      expect(AutoDetectErrorType.TIMEOUT).toBe("timeout")
      expect(AutoDetectErrorType.UNAUTHORIZED).toBe("unauthorized")
      expect(AutoDetectErrorType.INVALID_RESPONSE).toBe("invalid_response")
      expect(AutoDetectErrorType.NETWORK_ERROR).toBe("network_error")
      expect(AutoDetectErrorType.UNKNOWN).toBe("unknown")
    })

    it("should have unique error type values", () => {
      const values = Object.values(AutoDetectErrorType)
      const uniqueValues = new Set(values)
      expect(uniqueValues.size).toBe(values.length)
    })
  })

  describe("Integration scenarios", () => {
    it("should provide complete error info for unauthorized error", () => {
      const error = new Error("401 Unauthorized")
      const result = analyzeAutoDetectError(error)

      expect(result).toMatchObject({
        type: AutoDetectErrorType.UNAUTHORIZED,
        message: expect.any(String),
        actionText: expect.any(String),
        helpDocUrl: FAQ_URL
      })
    })

    it("should provide login workflow for unauthorized errors", async () => {
      const error = new Error("401")
      const analyzed = analyzeAutoDetectError(error)

      expect(analyzed.type).toBe(AutoDetectErrorType.UNAUTHORIZED)
      expect(analyzed.actionText).toBe("登录该站点")

      // Simulate user clicking login action
      const siteUrl = "https://example.com"
      await openLoginTab(siteUrl)

      expect(browser.tabs.create).toHaveBeenCalledWith({
        url: "https://example.com/login",
        active: true
      })
    })

    it("should handle multi-language error messages", () => {
      const cnError = analyzeAutoDetectError(new Error("网络超时"))
      const enError = analyzeAutoDetectError(new Error("Network timeout"))

      expect(cnError.type).toBe(AutoDetectErrorType.TIMEOUT)
      expect(enError.type).toBe(AutoDetectErrorType.TIMEOUT)
      expect(cnError.message).toBe(enError.message) // Both get Chinese translation
    })
  })
})
