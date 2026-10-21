import { afterEach, describe, expect, it, vi } from "vitest"

import { getCookiesForDomain } from "~/utils/browser/cookies"

const cookie = {
  name: "daya_sid",
  value: "account-A",
  domain: ".dayaai.com",
  hostOnly: false,
  path: "/",
  secure: false,
  httpOnly: true,
  session: true,
  sameSite: "lax" as const,
  storeId: "0",
  firstPartyDomain: "",
  partitionKey: undefined,
}

describe("getCookiesForDomain", () => {
  afterEach(() => vi.restoreAllMocks())

  it("captures parent-domain session cookies", async () => {
    const getAll = vi
      .spyOn(browser.cookies, "getAll")
      .mockImplementation(async (details) => {
        // Chromium answers a hostname filter without parent-domain cookies.
        if (details.domain === "dayaai.com") return [cookie]
        return []
      })
    await expect(getCookiesForDomain("api.dayaai.com")).resolves.toEqual([
      cookie,
    ])
    expect(getAll).toHaveBeenCalledWith({ domain: "api.dayaai.com" })
    expect(getAll).toHaveBeenCalledWith({ domain: "dayaai.com" })
  })

  it("deduplicates host cookies returned by ancestor queries", async () => {
    vi.spyOn(browser.cookies, "getAll").mockResolvedValue([
      { ...cookie, name: "krill_jwt", domain: "www.krill-code.com" },
    ])
    await expect(getCookiesForDomain("www.krill-code.com")).resolves.toEqual([
      { ...cookie, name: "krill_jwt", domain: "www.krill-code.com" },
    ])
  })

  it.each([undefined, "firefox-container-2"])(
    "includes parent API-path cookies with host cookies in store %s",
    async (storeId) => {
      const host = {
        ...cookie,
        name: "analytics",
        domain: "api.dayaai.com",
        hostOnly: true,
        storeId: storeId ?? "0",
      }
      const parent = { ...cookie, path: "/api", storeId: storeId ?? "0" }
      const sibling = { ...host, domain: "other.dayaai.com" }
      vi.spyOn(browser.cookies, "getAll").mockImplementation(
        async (details) => {
          if (details.storeId !== storeId) throw Error("wrong store")
          return details.domain === "api.dayaai.com"
            ? [host]
            : [host, parent, sibling]
        },
      )
      await expect(
        getCookiesForDomain("api.dayaai.com", storeId),
      ).resolves.toEqual([host, parent])
    },
  )
})
