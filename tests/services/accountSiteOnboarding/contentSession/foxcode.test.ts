import { http, HttpResponse } from "msw"
import { expect, it, vi } from "vitest"

import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import { getContentSessionExtractors } from "~/services/accountSiteOnboarding/registry"
import { foxCodeBrowserIdentity } from "~/services/apiAdapters/foxcode/browserIdentity"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

it("automatically detects the FoxCode console using Cookie auth and live string identity", async () => {
  expect(
    getAccountSiteDefinition("foxcode")?.productProfile?.auth,
  ).toMatchObject({
    defaultAuthType: AuthTypeEnum.Cookie,
    allowedAuthTypes: [AuthTypeEnum.Cookie],
  })
  const context = {
    url: "https://foxcode.rjj.cc/dashboard",
    siteTypeHint: "foxcode" as const,
  }
  const extractor = getContentSessionExtractors().find((item) =>
    item.canExtract(context),
  )
  expect(extractor).toBeDefined()
  server.use(
    http.get("https://foxcode.rjj.cc/api/auth/me", () =>
      HttpResponse.json({
        success: true,
        data: { user: { id: "string-account", name: "Work" } },
      }),
    ),
  )
  expect(await extractor!.extract(context)).toMatchObject({
    userId: "string-account",
    user: { username: "Work" },
    siteTypeHint: "foxcode",
  })
  expect(
    extractor!.canExtract({ ...context, url: "https://code1.newcli.com" }),
  ).toBe(false)
})

it.each([
  HttpResponse.json({ success: false }),
  HttpResponse.json({ success: true, data: { user: { id: "" } } }),
  HttpResponse.error(),
  new HttpResponse(null, { status: 401 }),
])(
  "does not onboard when the console identity is unavailable",
  async (response) => {
    const context = {
      url: "https://foxcode.rjj.cc",
      siteTypeHint: "foxcode" as const,
    }
    const extractor = getContentSessionExtractors().find((item) =>
      item.canExtract(context),
    )!
    expect(extractor.canExtract({ ...context, url: "invalid-url" })).toBe(false)
    expect(extractor.canExtract({ siteTypeHint: "foxcode" })).toBe(false)
    server.use(http.get("https://foxcode.rjj.cc/api/auth/me", () => response))
    expect(await extractor.extract(context)).toBeNull()
  },
)

it("rechecks the opaque Cookie identity and rejects malformed page identity", async () => {
  const context = {
    origin: "https://foxcode.rjj.cc",
    siteType: "foxcode" as const,
    candidateUserIds: ["expected"],
  }
  const observation = foxCodeBrowserIdentity.observe(context)!
  expect(foxCodeBrowserIdentity.canObserve(context)).toBe(true)
  expect(
    foxCodeBrowserIdentity.canObserve({
      ...context,
      origin: "https://code1.newcli.com",
    }),
  ).toBe(false)
  expect(observation.cacheResult).toBe(false)
  const read = vi
    .fn()
    .mockResolvedValueOnce({
      success: true,
      data: { user: { id: "expected" } },
    })
    .mockResolvedValueOnce({ success: false })
  expect(await observation.verify(read)).toBe("expected")
  expect(await observation.verify(read)).toBeNull()
  expect(read).toHaveBeenCalledWith({
    url: "https://foxcode.rjj.cc/api/auth/me",
  })
})
