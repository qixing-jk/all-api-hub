import { http, HttpResponse } from "msw"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  getAccountSiteApiRouter,
  isManagedSiteType,
  SITE_TYPES,
} from "~/constants/siteType"
import { handleGetUserFromLocalStorage } from "~/entrypoints/content/messageHandlers/handlers/storage"
import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  getAccountSiteDefinition,
} from "~/services/accountSiteDefinitions"
import { getAccountSiteType } from "~/services/siteDetection/detectSiteType"
import { server } from "~~/tests/msw/server"

vi.mock("~/utils/browser/tempWindowFetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/tempWindowFetch")>()),
  canUseTempWindowFetch: vi.fn().mockResolvedValue(false),
}))

function readSession(siteType: string = "apiyi") {
  return new Promise((resolve) => {
    handleGetUserFromLocalStorage(
      { url: "https://api.apiyi.com/account/profile", siteType },
      resolve,
    )
  })
}

describe("APIyi onboarding", () => {
  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    })
  })

  it("detects the canonical dashboard as an account-only New API-family site", async () => {
    server.use(
      http.get("https://api.apiyi.com/", () =>
        HttpResponse.html("<title>new-api</title>"),
      ),
      http.get(
        /\/api\/user\/info$/,
        () => new HttpResponse(null, { status: 404 }),
      ),
      http.get(
        /\/api\/v1\/auth\/me$/,
        () => new HttpResponse(null, { status: 404 }),
      ),
    )

    const siteType = await getAccountSiteType("https://api.apiyi.com/")

    expect(siteType).toBe("apiyi")
    expect(getAccountSiteDefinition(siteType)).toMatchObject({
      scopes: ["account"],
      adapterFamily: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    })
    expect(isManagedSiteType(siteType)).toBe(false)
  })

  it("reads USER_STATE through the content handler without forwarding credentials", async () => {
    localStorage.setItem(
      "USER_STATE",
      JSON.stringify({
        user: {
          id: 42,
          username: "apiyi-user",
          access_token: "private-token",
          password: "private-password",
        },
        token: "private-state-token",
      }),
    )
    localStorage.setItem("X-S-Token", "private-session-token")
    localStorage.setItem(
      "user",
      JSON.stringify({ id: 7, username: "stale-user" }),
    )

    await expect(readSession()).resolves.toEqual({
      success: true,
      data: {
        userId: "42",
        user: { id: 42, username: "apiyi-user" },
        siteTypeHint: "apiyi",
      },
    })
  })

  it("opens APIyi's usage and account-token pages", () => {
    expect(getAccountSiteApiRouter(SITE_TYPES.APIYI)).toMatchObject({
      usagePath: "/log",
      adminCredentialsPath: "/account/profile",
      accessTokenPath: "/account/profile",
    })
  })

  it("does not interpret USER_STATE as another site's login", async () => {
    localStorage.setItem(
      "USER_STATE",
      JSON.stringify({ user: { id: 42, username: "apiyi-user" } }),
    )

    await expect(readSession(SITE_TYPES.ONE_API)).resolves.toMatchObject({
      success: false,
    })
  })

  it.each([
    "not-json",
    "null",
    "[]",
    JSON.stringify({ user: [] }),
    JSON.stringify({ user: { username: "no-id" } }),
    JSON.stringify({ user: { id: {}, username: "invalid-id" } }),
  ])("rejects invalid stored identity: %s", async (stored) => {
    localStorage.setItem("USER_STATE", stored)

    await expect(readSession()).resolves.toMatchObject({ success: false })
  })
})
