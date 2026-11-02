import { expect, it, vi } from "vitest"

import { runMagpieScenarios } from "~~/scripts/suites/magpie/scenarios.mjs"

it("marks missing model-sync prerequisites incomplete while executing other independent tasks", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  const run = vi.fn(async (_id: string) => {})
  try {
    await expect(
      runMagpieScenarios({ suite: "all", hasUpstream: false, run }),
    ).rejects.toThrow(/model-sync \(blocked\)/)
    expect(run.mock.calls.map(([id]) => id)).toEqual([
      "management",
      "imports",
      "key-pool",
    ])
  } finally {
    vi.restoreAllMocks()
  }
})

it("key-pool selection does not require or run model synchronization", async () => {
  vi.spyOn(console, "log").mockImplementation(() => {})
  const run = vi.fn(async (_id: string) => {})
  try {
    const report = await runMagpieScenarios({
      suite: "key-pool",
      hasUpstream: false,
      run,
    })
    expect(run).toHaveBeenCalledExactlyOnceWith("key-pool")
    expect(report.allSelected).toBe(false)
  } finally {
    vi.restoreAllMocks()
  }
})
