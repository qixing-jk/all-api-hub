import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { kimiOpenPlatformBrowserIdentity } from "~/services/apiAdapters/kimiOpenPlatform/browserIdentity"

const context = {
  origin: "https://platform.kimi.ai",
  siteType: SITE_TYPES.KIMI_GLOBAL,
  candidateUserIds: [],
}
const jwt = (payload: object) =>
  `header.${btoa(JSON.stringify(payload))}.signature`
const observe = (token: string | null) => {
  vi.stubGlobal("localStorage", { getItem: () => token })
  return kimiOpenPlatformBrowserIdentity.observe(context)
}
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe("Kimi browser identity", () => {
  it("observes both Kimi deployments but not ordinary account sites", () => {
    expect(kimiOpenPlatformBrowserIdentity.canObserve(context)).toBe(true)
    expect(
      kimiOpenPlatformBrowserIdentity.canObserve({
        ...context,
        siteType: SITE_TYPES.KIMI,
      }),
    ).toBe(true)
    expect(
      kimiOpenPlatformBrowserIdentity.canObserve({
        ...context,
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toBe(false)
  })
  it.each([null, "", "   "])("does not observe an absent token %j", (token) => {
    expect(observe(token)).toBeNull()
  })
  it("verifies a live matching JWT identity against the console", async () => {
    const token = jwt({ sub: "user", exp: Math.floor(Date.now() / 1000) + 60 })
    const observer = observe(` ${token} `)!
    const read = vi.fn().mockResolvedValue({ code: 0, data: { uid: " user " } })
    await expect(observer.verify(read)).resolves.toBe("user")
    expect(observer.sessionKey).toBe(token)
    expect(read).toHaveBeenCalledWith({
      url: `${context.origin}/api?endpoint=userInfo`,
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    })
  })
  it("does not dispatch an expired session", async () => {
    const observer = observe(jwt({ sub: "user", exp: 1 }))!
    const read = vi.fn()
    await expect(observer.verify(read)).resolves.toBeNull()
    expect(read).not.toHaveBeenCalled()
  })
  it.each([null, [], {}, { uid: 1 }, { uid: "" }, { uid: "other" }])(
    "rejects invalid or mismatched identity data %j",
    async (data) => {
      const observer = observe(jwt({ sub: "user" }))!
      await expect(
        observer.verify(vi.fn().mockResolvedValue({ code: 0, data })),
      ).resolves.toBeNull()
    },
  )
  it("accepts a verified identity when the token has no readable subject", async () => {
    const observer = observe("opaque-session")!
    await expect(
      observer.verify(
        vi.fn().mockResolvedValue({ code: 0, data: { uid: "user" } }),
      ),
    ).resolves.toBe("user")
  })
  it("rejects a failed envelope even when it contains a matching uid", async () => {
    const observer = observe(jwt({ sub: "user" }))!
    await expect(
      observer.verify(
        vi.fn().mockResolvedValue({ code: 401, data: { uid: "user" } }),
      ),
    ).resolves.toBeNull()
  })
})
