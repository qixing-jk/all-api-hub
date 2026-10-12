import { http, HttpResponse } from "msw"
import { expect, it } from "vitest"

import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions/registry"
import { getContentSessionExtractors } from "~/services/accountSiteOnboarding/registry"
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
