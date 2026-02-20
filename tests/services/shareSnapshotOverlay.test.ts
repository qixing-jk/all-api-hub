import { describe, expect, it } from "vitest"

import { drawShareSnapshotOverlay } from "~/services/shareSnapshots/shareSnapshotOverlay"
import type { ShareSnapshotOverlayLabels } from "~/services/shareSnapshots/shareSnapshotOverlay"
import type { ShareSnapshotPayload } from "~/services/shareSnapshots/types"

/**
 * Unit tests for the share snapshot canvas overlay renderer.
 * Focuses on the `showTodayCashflow` behavior: placeholders when absent and a
 * today-net subline when present.
 */
const LABELS: ShareSnapshotOverlayLabels = {
  overview: "Overview",
  totalBalance: "Total balance",
  balance: "Balance",
  accounts: "Accounts",
  site: "Site",
  asOf: "As of",
  today: "Today",
  income: "Income",
  outcome: "Outcome",
  net: "Net",
}

const createMockContext = () => {
  const fillTextCalls: Array<{ text: string; x: number; y: number }> = []

  const ctx = {
    font: "",
    textAlign: "left" as const,
    textBaseline: "top" as const,
    fillStyle: "",
    save: () => {},
    restore: () => {},
    measureText: (text: string) => ({ width: Math.max(0, text.length) * 10 }),
    fillText: (text: string, x: number, y: number) => {
      fillTextCalls.push({ text, x, y })
    },
    getImageData: () => {
      throw new Error("Canvas readback not supported in unit test")
    },
  }

  return { ctx: ctx as unknown as CanvasRenderingContext2D, fillTextCalls }
}

describe("shareSnapshotOverlay", () => {
  it("renders placeholders and omits today net subline when today cashflow is absent", () => {
    const payload: ShareSnapshotPayload = {
      kind: "account",
      currencyType: "USD",
      siteName: "Example Site",
      balance: 12.34,
      asOf: 1700000000000,
      backgroundSeed: 1,
    }

    const { ctx, fillTextCalls } = createMockContext()

    drawShareSnapshotOverlay(ctx, {
      payload,
      width: 1200,
      height: 1200,
      locale: "en-US",
      watermarkText: "All API Hub",
      labels: LABELS,
    })

    const texts = fillTextCalls.map((call) => call.text)

    expect(texts.filter((text) => text === "—").length).toBeGreaterThanOrEqual(
      2,
    )
    expect(texts.some((text) => text.includes("Today"))).toBe(false)
  })

  it("renders today net subline when today cashflow values are present", () => {
    const payload: ShareSnapshotPayload = {
      kind: "account",
      currencyType: "USD",
      siteName: "Example Site",
      balance: 12.34,
      asOf: 1700000000000,
      backgroundSeed: 1,
      todayIncome: 2,
      todayOutcome: 1,
      todayNet: 1,
    }

    const { ctx, fillTextCalls } = createMockContext()

    drawShareSnapshotOverlay(ctx, {
      payload,
      width: 1200,
      height: 1200,
      locale: "en-US",
      watermarkText: "All API Hub",
      labels: LABELS,
    })

    const texts = fillTextCalls.map((call) => call.text)

    expect(texts.some((text) => text.includes("Today"))).toBe(true)
    expect(texts.some((text) => text === "—")).toBe(false)
  })
})
