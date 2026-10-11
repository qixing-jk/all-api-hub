import { http, HttpResponse } from "msw"
import { describe, expect, it, vi } from "vitest"

import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import { getContentSessionExtractors } from "~/services/accountSiteOnboarding/registry"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

describe("Dahl automatic onboarding", () => {
  const context = {
    url: "https://inference.dahl.global/account",
    siteTypeHint: "dahl" as const,
  }
  it("selects the console Cookie default and extracts a verified UUID", async () => {
    expect(
      getAccountSiteDefinition("dahl")?.productProfile?.auth,
    ).toMatchObject({
      defaultAuthType: AuthTypeEnum.Cookie,
      allowedAuthTypes: [AuthTypeEnum.Cookie],
    })
    const extractor = getContentSessionExtractors().find((item) =>
      item.canExtract(context),
    )
    expect(extractor).toBeDefined()
    const user = {
      user_id: "00000000-0000-4000-8000-000000000001",
      username: "sample",
    }
    server.use(
      http.get("https://inference.dahl.global/v1/account", () =>
        HttpResponse.json({ user }),
      ),
    )
    expect(await extractor!.extract(context)).toMatchObject({
      userId: user.user_id,
      siteTypeHint: "dahl",
    })
  })
  it.each(["not-a-url", ""])("does not observe an invalid URL: %s", (url) => {
    const extractor = getContentSessionExtractors().find(
      (item) => item.id === "dahl",
    )!
    expect(extractor.canExtract({ ...context, url })).toBe(false)
  })
  it.each([401, 500])(
    "leaves an HTTP %s console session unconfirmed",
    async (status) => {
      const extractor = getContentSessionExtractors().find(
        (item) => item.id === "dahl",
      )!
      server.use(
        http.get(
          "https://inference.dahl.global/v1/account",
          () => new HttpResponse(null, { status }),
        ),
      )
      expect(await extractor.extract(context)).toBeNull()
    },
  )
  it("leaves a malformed identity unconfirmed", async () => {
    const extractor = getContentSessionExtractors().find(
      (item) => item.id === "dahl",
    )!
    server.use(
      http.get("https://inference.dahl.global/v1/account", () =>
        HttpResponse.json({ user: { user_id: "invalid" } }),
      ),
    )
    expect(await extractor.extract(context)).toBeNull()
  })
  it("leaves a network failure unconfirmed", async () => {
    const extractor = getContentSessionExtractors().find(
      (item) => item.id === "dahl",
    )!
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new Error("Offline"))
    try {
      expect(await extractor.extract(context)).toBeNull()
    } finally {
      fetchSpy.mockRestore()
    }
  })
  it("does not extract sessions from lookalike or insecure origins", () => {
    const extractor = getContentSessionExtractors().find(
      (item) => item.id === "dahl",
    )
    expect(extractor).toBeDefined()
    for (const url of [
      "https://inference.dahl.global.evil.invalid",
      "http://inference.dahl.global",
      "https://dahl.global",
    ])
      expect(extractor!.canExtract({ ...context, url })).toBe(false)
  })
})
