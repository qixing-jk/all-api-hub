import { describe, expect, it, vi } from "vitest"

import {
  buildAccountShareSnapshotPayload,
  buildOverviewShareSnapshotPayload,
  generateShareSnapshotCaption,
} from "~/services/shareSnapshots"
import {
  createShareSnapshotSeed,
  redactShareSecrets,
  sanitizeOriginUrl,
} from "~/services/shareSnapshots/utils"

vi.mock("i18next", () => {
  const translations: Record<string, string> = {
    "ui:app.name": "All API Hub",
    "shareSnapshots:labels.snapshot": "Snapshot",
    "shareSnapshots:labels.overview": "Overview",
    "shareSnapshots:labels.totalBalance": "Total balance",
    "shareSnapshots:labels.balance": "Balance",
    "shareSnapshots:labels.accounts": "Accounts",
    "shareSnapshots:labels.today": "Today",
    "shareSnapshots:labels.income": "Income",
    "shareSnapshots:labels.outcome": "Outcome",
    "shareSnapshots:labels.net": "Net",
    "shareSnapshots:labels.asOf": "As of",
  }

  return {
    default: {
      language: "en",
      t: (key: string) => translations[key] ?? key,
    },
  }
})

describe("shareSnapshots", () => {
  describe("sanitizeOriginUrl", () => {
    it("returns origin only and strips path/query/fragment", () => {
      expect(sanitizeOriginUrl("https://example.com/path?token=abc#frag")).toBe(
        "https://example.com",
      )
    })

    it("keeps non-default port in origin", () => {
      expect(sanitizeOriginUrl("http://localhost:3000/foo")).toBe(
        "http://localhost:3000",
      )
    })

    it("returns undefined for invalid url", () => {
      expect(sanitizeOriginUrl("not-a-url")).toBeUndefined()
    })

    it("returns undefined for opaque origins", () => {
      expect(
        sanitizeOriginUrl("file:///Users/example/secret.txt"),
      ).toBeUndefined()
    })

    it("returns undefined for empty input", () => {
      expect(sanitizeOriginUrl(undefined)).toBeUndefined()
    })
  })

  describe("createShareSnapshotSeed", () => {
    it("returns a uint32 seed compatible with mulberry32", () => {
      const seed = createShareSnapshotSeed()
      const UINT32_MAX = 0xffffffff

      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThanOrEqual(UINT32_MAX)
      expect(seed >>> 0).toBe(seed)
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
      expect(caption).toContain("Overview")
      expect(caption).toContain("Total balance")
      expect(caption).toContain("Accounts: 7")
      expect(caption).toContain("As of")
      expect(caption).not.toContain("Snapshot")
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
      expect(caption).toContain("Balance")
      expect(caption).toContain("Today")
      expect(caption).toContain("Income")
      expect(caption).toContain("Outcome")
      expect(caption).toContain("Net")
      expect(caption).toContain("As of")
    })
  })
})
