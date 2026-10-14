import { http, HttpResponse } from "msw"
import { expect, it, vi } from "vitest"

import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import { xiaoenContentSessionExtractor as extractor } from "~/services/accountSiteOnboarding/contentSession/xiaoen"
import { xiaoenBrowserIdentity } from "~/services/apiAdapters/xiaoen/browserIdentity"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"

const origin = "https://free.supxh.xin"
const context = { url: `${origin}/dashboard`, siteTypeHint: "xiaoen" as const }

it("detects the authenticated Cookie identity without exposing the inference credential", async () => {
  expect(
    getAccountSiteDefinition("xiaoen")?.productProfile?.auth,
  ).toMatchObject({
    defaultAuthType: AuthTypeEnum.Cookie,
    allowedAuthTypes: [AuthTypeEnum.Cookie],
  })
  server.use(
    http.get(`${origin}/api/auth/me`, () =>
      HttpResponse.json({
        success: true,
        data: { id: "opaque-user", username: "Member", apiKey: "sk-private" },
      }),
    ),
  )
  expect(extractor.canExtract(context)).toBe(true)
  expect(await extractor.extract(context)).toEqual({
    userId: "opaque-user",
    user: { id: "opaque-user", username: "Member" },
    siteTypeHint: "xiaoen",
  })
  expect(
    extractor.canExtract({ ...context, url: "https://go.toter.me/dashboard" }),
  ).toBe(false)
})

it.each([
  HttpResponse.json({ success: false, message: "未登录" }),
  HttpResponse.json({ success: true, data: { id: 123, username: "Member" } }),
  HttpResponse.error(),
  new HttpResponse(null, { status: 401 }),
])("does not onboard without a valid live identity", async (response) => {
  server.use(http.get(`${origin}/api/auth/me`, () => response))
  expect(await extractor.extract(context)).toBeNull()
})

it("revalidates the current Cookie identity without cached results", async () => {
  const observation = xiaoenBrowserIdentity.observe({
    origin,
    siteType: "xiaoen",
    candidateUserIds: ["opaque-user"],
  })!
  const read = vi
    .fn()
    .mockResolvedValueOnce({
      success: true,
      data: { id: "opaque-user", username: "Member" },
    })
    .mockResolvedValueOnce({ success: false })
  expect(observation.cacheResult).toBe(false)
  expect(await observation.verify(read)).toBe("opaque-user")
  expect(await observation.verify(read)).toBeNull()
  expect(read).toHaveBeenCalledWith({ url: `${origin}/api/auth/me` })
})
