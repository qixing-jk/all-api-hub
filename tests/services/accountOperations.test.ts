import { describe, expect, it } from "vitest"

import {
  extractDomainPrefix,
  isValidAccount,
  isValidExchangeRate,
} from "~/services/accountOperations"
import { AuthTypeEnum } from "~/types"

describe("accountOperations", () => {
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

    it("allows empty token for Cookie auth", () => {
      expect(
        isValidAccount({
          siteName: "Test",
          username: "user",
          userId: "123",
          authType: AuthTypeEnum.Cookie,
          accessToken: "",
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
