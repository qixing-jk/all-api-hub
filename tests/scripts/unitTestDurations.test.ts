import { describe, expect, it } from "vitest"

import {
  correctForShardLoad,
  measureFileCost,
  summarizeBlobReports,
} from "~~/scripts/utils/unitTestDurations.mjs"

const blobFile = (
  name: string | number,
  overrides: Record<string, unknown> = {},
) => ({
  name,
  result: { duration: 100 },
  setupDuration: 2,
  prepareDuration: 3,
  collectDuration: 4,
  environmentLoad: 1,
  ...overrides,
})

describe("measureFileCost", () => {
  it("sums every per-file phase, not just the test bodies", () => {
    expect(measureFileCost(blobFile("a.test.ts"))).toBe(110)
  })

  it("treats missing or non-numeric phases as zero", () => {
    expect(measureFileCost({ name: "a.test.ts", result: {} })).toBe(0)
    expect(
      measureFileCost({ name: "a.test.ts", result: { duration: "5" } }),
    ).toBe(0)
  })
})

describe("summarizeBlobReports", () => {
  it("keeps each file's cost and the shard that measured it", () => {
    const { entries, shardTotals } = summarizeBlobReports([
      { shard: 1, files: [blobFile("a.test.ts")] },
      { shard: 2, files: [blobFile("b.test.ts")] },
    ])

    expect(entries.get("a.test.ts")).toEqual({ cost: 110, shard: 1 })
    expect(entries.get("b.test.ts")).toEqual({ cost: 110, shard: 2 })
    expect(shardTotals.get(1)).toBe(110)
    expect(shardTotals.get(2)).toBe(110)
  })

  it("sums a file that appears in several reports and keeps the first shard", () => {
    const { entries } = summarizeBlobReports([
      {
        shard: 1,
        files: [blobFile("a.test.ts", { result: { duration: 50 } })],
      },
      {
        shard: 2,
        files: [blobFile("a.test.ts", { result: { duration: 25 } })],
      },
    ])

    expect(entries.get("a.test.ts")).toEqual({ cost: 95, shard: 1 })
  })

  it("skips entries without a usable path", () => {
    const { entries } = summarizeBlobReports([
      { shard: 1, files: [blobFile(7), blobFile("a.test.ts")] },
    ])

    expect(entries.size).toBe(1)
  })
})

describe("correctForShardLoad", () => {
  it("deflates files measured in an overloaded shard and inflates the rest", () => {
    // Shard 1 measured 310s of raw work for one file, shard 2 only 110s; both normalize
    // to the mean (210s), which is the shared contention-free estimate.
    const { entries, shardTotals } = summarizeBlobReports([
      {
        shard: 1,
        files: [blobFile("a.test.ts", { result: { duration: 300 } })],
      },
      {
        shard: 2,
        files: [blobFile("b.test.ts", { result: { duration: 100 } })],
      },
    ])

    const corrected = correctForShardLoad(entries, shardTotals)
    expect(corrected?.get("a.test.ts")).toBeCloseTo(210)
    expect(corrected?.get("b.test.ts")).toBeCloseTo(210)
  })

  it("returns null when shard attribution is missing", () => {
    const { entries, shardTotals } = summarizeBlobReports([
      { shard: null, files: [blobFile("a.test.ts")] },
    ])

    expect(correctForShardLoad(entries, shardTotals)).toBeNull()
  })

  it("returns null when a shard measured nothing", () => {
    const { entries, shardTotals } = summarizeBlobReports([
      { shard: 1, files: [] },
      { shard: 2, files: [blobFile("a.test.ts")] },
    ])

    expect(correctForShardLoad(entries, shardTotals)).toBeNull()
  })
})
