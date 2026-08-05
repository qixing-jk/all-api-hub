import { describe, expect, it } from "vitest"

import { mapSettledWithConcurrency } from "~/services/apiAdapters/nativeResources/concurrency"

describe("mapSettledWithConcurrency", () => {
  it("settles bounded work in original input order", async () => {
    let active = 0
    let maximum = 0
    const results = await mapSettledWithConcurrency(
      [1, 2, 3, 4],
      2,
      async (item) => {
        active += 1
        maximum = Math.max(maximum, active)
        try {
          if (item === 3) throw new Error("failed")
          return item * 2
        } finally {
          active -= 1
        }
      },
    )

    expect(maximum).toBeLessThanOrEqual(2)
    expect(results).toEqual([
      { status: "fulfilled", value: 2 },
      { status: "fulfilled", value: 4 },
      expect.objectContaining({ status: "rejected" }),
      { status: "fulfilled", value: 8 },
    ])
  })
})
