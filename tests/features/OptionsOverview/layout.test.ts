import { describe, expect, it } from "vitest"

import { OVERVIEW_WIDGET_LAYOUT } from "~/features/OptionsOverview/layout"

describe("overview widget layout", () => {
  it("keeps the static widget layout non-persistent and stable", () => {
    expect(OVERVIEW_WIDGET_LAYOUT).toEqual([
      {
        id: "statusSummary",
        columnSpan: 3,
        persisted: false,
      },
      {
        id: "needsAttention",
        columnSpan: 2,
        persisted: false,
      },
      {
        id: "automationOverview",
        columnSpan: 1,
        persisted: false,
      },
      {
        id: "recentUsage",
        columnSpan: 3,
        persisted: false,
      },
      {
        id: "actionCenter",
        columnSpan: 3,
        persisted: false,
      },
    ])
  })
})
