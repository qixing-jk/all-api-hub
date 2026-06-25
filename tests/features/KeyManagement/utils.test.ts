import { beforeEach, describe, expect, it, vi } from "vitest"

import { UI_CONSTANTS } from "~/constants/ui"
import {
  buildTokenIdentityKey,
  formatKey,
  formatQuota,
} from "~/features/KeyManagement/utils"

const { tMock } = vi.hoisted(() => ({
  tMock: vi.fn((key: string) => key),
}))

vi.mock("~/utils/i18n/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/i18n/core")>()

  return {
    ...actual,
    t: tMock,
  }
})

describe("KeyManagement utils", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe("buildTokenIdentityKey", () => {
    it("combines account and token identifiers into a collision-safe key", () => {
      expect(buildTokenIdentityKey("account-a", 7)).toBe("account-a:7")
    })
  })

  describe("formatKey", () => {
    it("returns the full key when the token is marked as visible", () => {
      const key = "sk-visible-1234567890"
      const tokenIdentityKey = buildTokenIdentityKey("account-a", 1)

      expect(
        formatKey(key, tokenIdentityKey, new Set([tokenIdentityKey])),
      ).toBe(key)
    })

    it("fully masks short hidden keys", () => {
      expect(formatKey("short-key", "account-a:2", new Set())).toBe("******")
    })

    it("preserves the start and end of long hidden keys", () => {
      const key = "sk-1234567890abcdefghijklmnop"

      expect(formatKey(key, "account-a:3", new Set())).toBe(
        `${key.substring(0, 8)}${"*".repeat(16)}${key.substring(
          key.length - 4,
        )}`,
      )
    })
  })

  describe("formatQuota", () => {
    it("uses the unlimited label when the token has unlimited quota", () => {
      expect(formatQuota(1000, true)).toBe(
        "keyManagement:dialog.unlimitedQuota",
      )
    })

    it("uses the unlimited label when the remaining quota is negative", () => {
      expect(formatQuota(-1, false)).toBe("keyManagement:dialog.unlimitedQuota")
    })

    it("formats finite quota values as USD with two decimals", () => {
      const quota = UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR * 1.25

      expect(formatQuota(quota, false)).toBe("$1.25")
    })
  })
})
