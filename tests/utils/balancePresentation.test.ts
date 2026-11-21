import type { TFunction } from "i18next"
import { expect, it } from "vitest"

import { formatBalanceWindow } from "~/utils/core/balancePresentation"

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
    "account:financial.window: 11/20/2026, 12:00:00 AM – 11/20/2026, 1:00:00 AM · UTC",
    "account:financial.resetsAt: 11/21/2026, 12:00:00 AM · UTC",
  ])
})
