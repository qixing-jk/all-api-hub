import type { TFunction } from "i18next"
import { expect, it } from "vitest"

import {
  formatBalanceWindow,
  getBalanceRoleLabel,
} from "~/utils/core/balancePresentation"

it.each([
  ["normalBalance", "normalBalance"],
  ["charityBalance", "charityBalance"],
  ["basicBalance", "basicBalance"],
  ["boundBalance", "boundBalance"],
  ["permanentBalance", "permanentBalance"],
  ["timedBalance", "timedBalance"],
  ["dailyBalance", "dailyBalance"],
  ["totalTokens", "totalTokens"],
  ["poolTokens", "poolTokens"],
  ["allocatedTokens", "allocatedTokens"],
  [undefined, "pendingCharge"],
] as const)(
  "keeps the provider meaning in the visible %s label",
  (labelKey, label) => {
    expect(
      getBalanceRoleLabel(
        {
          labelKey,
          role: "pending-charge",
          nature: "unknown",
          funding: "unknown",
          cashClassification: "unknown",
        },
        ((key: string) => key) as TFunction,
      ),
    ).toBe(`account:financial.${label}`)
  },
)

it("shows a readable observation range and keeps its timezone and reset separate", () => {
  const t = ((key: string) => key) as TFunction
  expect(
    formatBalanceWindow(
      {
        start: Date.parse("2026-11-20T00:00:00Z"),
        end: Date.parse("2026-11-20T01:00:00Z"),
        timeZone: "UTC",
        resetsAt: Date.parse("2026-11-21T00:00:00Z"),
      },
      t,
      "en-US",
    ),
  ).toEqual([
    expect.stringMatching(
      /account:financial.window: 11\/20\/2026, 12:00:00 AM GMT(?:\+0)? – 11\/20\/2026, 1:00:00 AM GMT(?:\+0)? · UTC/,
    ),
    expect.stringMatching(
      /account:financial.resetsAt: 11\/21\/2026, 12:00:00 AM GMT(?:\+0)? · UTC/,
    ),
  ])
})

it.each(["reserved", "debt"] as const)(
  "keeps %s outside the available-cash label",
  (role) => {
    expect(
      getBalanceRoleLabel(
        {
          role,
          nature: "unknown",
          funding: "unknown",
          cashClassification: "unknown",
        },
        ((key: string) => key) as TFunction,
      ),
    ).toBe(`account:financial.${role}`)
  },
)

it("preserves exact UTC times when a reported window has an invalid timezone", () => {
  expect(
    formatBalanceWindow(
      { start: 1000, end: 2000, timeZone: "Mars/Olympus" },
      ((key: string) => key) as TFunction,
      "en",
    ).join(" "),
  ).toContain("1970-01-01T00:00:01.000Z")
})

it("labels the offset at both ends of a daylight-saving transition", () => {
  const t = ((key: string) => key) as TFunction
  expect(
    formatBalanceWindow(
      {
        start: Date.parse("2026-11-01T05:30:00Z"),
        end: Date.parse("2026-11-01T06:30:00Z"),
        timeZone: "America/New_York",
      },
      t,
      "en-US",
    ),
  ).toEqual([expect.stringMatching(/1:30:00 AM GMT-4 – .*1:30:00 AM GMT-5/)])
})
