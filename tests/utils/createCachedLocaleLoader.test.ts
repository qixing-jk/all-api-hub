import { describe, expect, it, vi } from "vitest"

import { createCachedLocaleLoader } from "~/utils/i18n/createCachedLocaleLoader"

describe("createCachedLocaleLoader", () => {
  it("shares successful and in-flight loads by key", async () => {
    const load = vi.fn(async (key: string) => ({ key }))
    const loadCached = createCachedLocaleLoader(load)

    const firstLoad = loadCached("de")
    const repeatedLoad = loadCached("de")

    expect(repeatedLoad).toBe(firstLoad)
    await expect(firstLoad).resolves.toEqual({ key: "de" })
    expect(loadCached("de")).toBe(firstLoad)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it("evicts failed loads so the same key can retry", async () => {
    const load = vi
      .fn<(key: string) => Promise<string>>()
      .mockRejectedValueOnce(new Error("locale unavailable"))
      .mockResolvedValueOnce("ja")
    const loadCached = createCachedLocaleLoader(load)

    await expect(loadCached("ja")).rejects.toThrow("locale unavailable")
    await expect(loadCached("ja")).resolves.toBe("ja")
    expect(load).toHaveBeenCalledTimes(2)
  })
})
