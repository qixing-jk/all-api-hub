import { describe, expect, it, vi } from "vitest"

import { createLazyMenuComponent } from "~/entrypoints/options/createLazyMenuComponent"

describe("createLazyMenuComponent", () => {
  it("retries a page loader after a preload failure", async () => {
    const page = () => null
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error("chunk load failed"))
      .mockResolvedValueOnce({ default: page })
    const component = createLazyMenuComponent(loader)

    await expect(component.preload()).rejects.toThrow("chunk load failed")
    await expect(component.preload()).resolves.toEqual({ default: page })

    expect(loader).toHaveBeenCalledTimes(2)
  })
})
