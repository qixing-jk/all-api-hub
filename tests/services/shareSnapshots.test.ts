import { describe, expect, it, vi } from "vitest"

import {
  buildAccountShareSnapshotPayload,
  buildOverviewShareSnapshotPayload,
  generateShareSnapshotCaption,
} from "~/services/sharing/shareSnapshots"
import {
  createShareSnapshotSeed,
  formatAsOfTimestamp,
  formatCurrencyAmount,
  formatSignedCurrencyAmount,
  redactShareSecrets,
  relativeLuminanceFromRgb,
} from "~/services/sharing/shareSnapshots/utils"

describe("shareSnapshots", () => {
  describe("createShareSnapshotSeed", () => {
    it("returns a uint32 seed compatible with mulberry32", () => {
      const seed = createShareSnapshotSeed()
      const UINT32_MAX = 0xffffffff

      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThanOrEqual(UINT32_MAX)
      expect(seed >>> 0).toBe(seed)
    })

    it("falls back to Math.random when crypto.getRandomValues is unavailable", () => {
      const originalCrypto = globalThis.crypto

      Object.defineProperty(globalThis, "crypto", {
        value: undefined,
        configurable: true,
      })

      const randomSpy = vi.spyOn(Math, "random").mockReturnValue(0.5)

      try {
        expect(createShareSnapshotSeed()).toBe(2147483648)
      } finally {
        randomSpy.mockRestore()
        Object.defineProperty(globalThis, "crypto", {
          value: originalCrypto,
          configurable: true,
        })
      }
    })
  })

  describe("redactShareSecrets", () => {
    it("redacts Bearer tokens", () => {
      expect(redactShareSecrets("Authorization: Bearer abc.def")).toBe(
        "Authorization: Bearer [REDACTED]",
      )
    })

    it("redacts JWT-like tokens", () => {
      const jwt = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaaaa.bbbbb"
      expect(redactShareSecrets(`token=${jwt}`)).toBe("token=[REDACTED_JWT]")
    })
  })

  describe("formatting helpers", () => {
    it("preserves negative signs for account balances and explicit signs for cashflow values", () => {
      expect(formatCurrencyAmount(-12.34, "USD")).toBe("-$12.34")
      expect(formatSignedCurrencyAmount(12.34, "USD")).toBe("+$12.34")
      expect(formatSignedCurrencyAmount(-12.34, "USD")).toBe("-$12.34")
    })

    it("falls back to the current time when formatting an invalid as-of timestamp", () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date("2026-02-10T12:34:56.000Z"))

        expect(formatAsOfTimestamp(0, "en-US")).toBe(
          new Date(Date.now()).toLocaleString("en-US"),
        )
      } finally {
        vi.useRealTimers()
      }
    })

    it("uses the runtime locale when no explicit locale is provided", () => {
      const timestamp = Date.parse("2026-02-10T12:34:56.000Z")
      expect(formatAsOfTimestamp(timestamp)).toBe(
        new Date(timestamp).toLocaleString(),
      )
    })

    it("computes luminance for both dark and bright RGB ranges", () => {
      const dark = relativeLuminanceFromRgb({ r: 10, g: 10, b: 10 })
      const bright = relativeLuminanceFromRgb({ r: 255, g: 255, b: 255 })

      expect(dark).toBeGreaterThanOrEqual(0)
      expect(bright).toBeLessThanOrEqual(1)
      expect(bright).toBeGreaterThan(dark)
    })
  })

  describe("buildOverviewShareSnapshotPayload", () => {
    it("omits today cashflow fields when disabled", () => {
      const payload = buildOverviewShareSnapshotPayload({
        currencyType: "USD",
        enabledAccountCount: 3,
        totalBalance: 12.34,
        includeTodayCashflow: false,
        todayIncome: 1,
        todayOutcome: 2,
      })

      expect(payload.kind).toBe("overview")
      expect(payload.todayIncome).toBeUndefined()
      expect(payload.todayOutcome).toBeUndefined()
      expect(payload.todayNet).toBeUndefined()
    })

    it("computes today net when enabled", () => {
      const payload = buildOverviewShareSnapshotPayload({
        currencyType: "USD",
        enabledAccountCount: 2,
        totalBalance: 99,
        includeTodayCashflow: true,
        todayIncome: 5,
        todayOutcome: 3,
        asOf: 1700000000000,
        backgroundSeed: 123,
      })

      expect(payload.todayNet).toBe(2)
      expect(payload.asOf).toBe(1700000000000)
      expect(payload.backgroundSeed).toBe(123)
    })

    it("omits the entire cashflow bundle when finite inputs overflow the derived net", () => {
      const payload = buildOverviewShareSnapshotPayload({
        currencyType: "USD",
        enabledAccountCount: 1,
        totalBalance: 99,
        includeTodayCashflow: true,
        todayIncome: Number.MAX_VALUE,
        todayOutcome: -Number.MAX_VALUE,
      })

      expect(payload.todayIncome).toBeUndefined()
      expect(payload.todayOutcome).toBeUndefined()
      expect(payload.todayNet).toBeUndefined()
    })

    it("falls back to export time when asOf is missing", () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"))

        const payload = buildOverviewShareSnapshotPayload({
          currencyType: "USD",
          enabledAccountCount: 1,
          totalBalance: 1,
          includeTodayCashflow: false,
        })

        expect(payload.asOf).toBe(Date.now())
      } finally {
        vi.useRealTimers()
      }
    })

    it("normalizes invalid numeric inputs before exposing overview payload data", () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"))

        const payload = buildOverviewShareSnapshotPayload({
          currencyType: "USD",
          enabledAccountCount: -3.8,
          totalBalance: Number.NaN,
          includeTodayCashflow: true,
          todayIncome: Number.NaN,
          todayOutcome: undefined,
          asOf: 0,
          backgroundSeed: 0,
        })

        expect(payload.enabledAccountCount).toBe(0)
        expect(payload.totalBalance).toBe(0)
        expect(payload.todayIncome).toBeUndefined()
        expect(payload.todayOutcome).toBeUndefined()
        expect(payload.todayNet).toBeUndefined()
        expect(payload.asOf).toBe(Date.now())
        expect(Number.isInteger(payload.backgroundSeed)).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe("buildAccountShareSnapshotPayload", () => {
    it("trims safe display fields and drops blank origin URLs", () => {
      vi.useFakeTimers()
      try {
        vi.setSystemTime(new Date("2026-02-10T12:00:00.000Z"))

        const payload = buildAccountShareSnapshotPayload({
          currencyType: "USD",
          siteName: "  Example Site  ",
          originUrl: "   ",
          balance: Number.NaN,
          includeTodayCashflow: false,
          asOf: -1,
          backgroundSeed: Number.NaN,
        })

        expect(payload.siteName).toBe("Example Site")
        expect(payload.originUrl).toBeUndefined()
        expect(payload.balance).toBe(0)
        expect(payload.asOf).toBe(Date.now())
        expect(Number.isInteger(payload.backgroundSeed)).toBe(true)
      } finally {
        vi.useRealTimers()
      }
    })

    it.each([
      { todayIncome: undefined, todayOutcome: 2, label: "missing income" },
      { todayIncome: 1, todayOutcome: undefined, label: "missing outcome" },
      { todayIncome: Number.NaN, todayOutcome: 2, label: "nonfinite income" },
      {
        todayIncome: 1,
        todayOutcome: Number.POSITIVE_INFINITY,
        label: "nonfinite outcome",
      },
      {
        todayIncome: Number.MAX_VALUE,
        todayOutcome: -Number.MAX_VALUE,
        label: "overflowing derived net",
      },
    ])("omits the entire cashflow bundle for $label", (cashflow) => {
      const payload = buildAccountShareSnapshotPayload({
        currencyType: "USD",
        siteName: "Example Site",
        balance: 10,
        includeTodayCashflow: true,
        todayIncome: cashflow.todayIncome,
        todayOutcome: cashflow.todayOutcome,
      })

      expect(payload.todayIncome).toBeUndefined()
      expect(payload.todayOutcome).toBeUndefined()
      expect(payload.todayNet).toBeUndefined()
    })
  })

  describe("generateShareSnapshotCaption", () => {
    it("generates an overview caption without per-account identifiers", () => {
      const payload = buildOverviewShareSnapshotPayload({
        currencyType: "USD",
        enabledAccountCount: 7,
        totalBalance: 123.45,
        includeTodayCashflow: false,
        asOf: 1700000000000,
        backgroundSeed: 1,
      })

      const caption = generateShareSnapshotCaption(payload)

      expect(caption).toContain("All API Hub")
      expect(caption).toContain("shareSnapshots:labels.overview")
      expect(caption).toContain("shareSnapshots:labels.totalBalance")
      expect(caption).toContain("shareSnapshots:labels.accounts: 7")
      expect(caption).toContain("shareSnapshots:labels.asOf")
      expect(caption).not.toContain("shareSnapshots:labels.snapshot")
      expect(caption).not.toContain("https://")
    })

    it("includes today cashflow line only when present", () => {
      const payload = buildAccountShareSnapshotPayload({
        currencyType: "USD",
        siteName: "Example Site",
        originUrl: "https://example.com",
        balance: 12.34,
        includeTodayCashflow: true,
        todayIncome: 2,
        todayOutcome: 1,
        asOf: 1700000000000,
        backgroundSeed: 1,
      })

      const caption = generateShareSnapshotCaption(payload)

      expect(caption).toContain("Example Site")
      expect(caption).toContain("https://example.com")
      expect(caption).toContain("shareSnapshots:labels.balance")
      expect(caption).toContain("shareSnapshots:labels.today")
      expect(caption).toContain("shareSnapshots:labels.income")
      expect(caption).toContain("shareSnapshots:labels.outcome")
      expect(caption).toContain("shareSnapshots:labels.net")
      expect(caption).toContain("shareSnapshots:labels.asOf")
    })

    it("omits the origin line when the account payload does not include a safe origin URL", () => {
      const payload = buildAccountShareSnapshotPayload({
        currencyType: "USD",
        siteName: "Example Site",
        originUrl: "   ",
        balance: 12.34,
        includeTodayCashflow: false,
        asOf: 1700000000000,
        backgroundSeed: 1,
      })

      const caption = generateShareSnapshotCaption(payload)

      expect(caption).toContain("All API Hub")
      expect(caption).toContain("Example Site")
      expect(caption).not.toContain("https://")
      expect(caption.split("\n")).toHaveLength(3)
    })
  })
})
