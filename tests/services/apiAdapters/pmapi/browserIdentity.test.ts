import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { pmApiBrowserIdentity as capability } from "~/services/apiAdapters/pmapi/browserIdentity"

const context = {
  siteType: SITE_TYPES.PMAPI,
  origin: "https://pmcat.top",
  candidateUserIds: [],
}
let token: string | null
beforeEach(() => {
  token = " session "
  vi.stubGlobal("localStorage", { getItem: () => token })
  vi.stubGlobal("location", { origin: context.origin })
})
afterEach(() => vi.unstubAllGlobals())
describe("PM-API passive browser identity", () => {
  it("only observes PM-API sessions", () => {
    expect(capability.canObserve(context)).toBe(true)
    expect(
      capability.canObserve({ ...context, siteType: SITE_TYPES.NEW_API }),
    ).toBe(false)
    token = null
    expect(capability.observe(context)).toBeNull()
  })
  it("revalidates opaque tokens through the current origin without caching", async () => {
    const observation = capability.observe(context)!
    expect(observation).toMatchObject({
      sessionKey: "session",
      cacheResult: false,
    })
    const read = vi.fn(async () => ({ success: true, data: { id: 7 } }))
    expect(await observation.verify(read)).toBe("7")
    expect(read).toHaveBeenCalledWith({
      url: "https://pmcat.top/api/me",
      headers: { Authorization: "Bearer session" },
    })
  })
  it.each([
    null,
    {},
    { success: false },
    { success: true, data: null },
    { success: true, data: { id: "7" } },
  ])("does not trust invalid identity evidence: %j", async (value) => {
    expect(
      await capability
        .observe(context)!
        .verify(vi.fn().mockResolvedValue(value)),
    ).toBeNull()
  })
  it("returns no identity after a failed probe", async () => {
    expect(
      await capability
        .observe(context)!
        .verify(vi.fn().mockRejectedValue(new Error("offline"))),
    ).toBeNull()
  })
})
