import { describe, expect, it } from "vitest"

import { PRODUCT_ANALYTICS_ACTION_IDS } from "~/services/productAnalytics/events"

describe("product analytics event enums", () => {
  it("does not expose generic product action ids", () => {
    const disallowedActionIds = new Set([
      "open",
      "create",
      "update",
      "delete",
      "refresh",
      "sync",
      "toggle",
      "copy",
      "verify",
      "run",
      "import",
      "export",
      "request",
    ])

    expect(
      Object.values(PRODUCT_ANALYTICS_ACTION_IDS).filter((actionId) =>
        disallowedActionIds.has(actionId),
      ),
    ).toEqual([])
  })
})
