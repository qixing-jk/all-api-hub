import { describe, expect, it, vi } from "vitest"

import { readAllPmApiTokens } from "~~/scripts/suites/pmapi/tokens.mjs"

describe("PM-API live token inventory", () => {
  it("reads later pages for baseline, readback and run-owned cleanup", async () => {
    const first = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      name: "existing",
    }))
    const read = vi.fn(async (path: string) => ({
      items: path.includes("p=1&") ? first : [{ id: 101, name: "run-owned" }],
      total: 101,
    }))
    const items = await readAllPmApiTokens(read)
    expect(items).toHaveLength(101)
    expect(items.at(-1)).toEqual({ id: 101, name: "run-owned" })
    expect(read.mock.calls.map(([path]) => path)).toEqual([
      "/api/tokens?p=1&size=100",
      "/api/tokens?p=2&size=100",
    ])
  })
  it("handles an empty inventory", async () => {
    const read = vi.fn(async () => ({ items: [], total: 0 }))
    expect(await readAllPmApiTokens(read)).toEqual([])
    expect(read).toHaveBeenCalledOnce()
  })
})
