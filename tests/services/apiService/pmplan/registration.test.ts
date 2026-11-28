import { expect, it } from "vitest"

import { resolveAccountSiteDefaultAuthType } from "~/services/accounts/accountSiteProfile/auth"
import {
  isSameAccountSiteOrigin,
  normalizeAccountSiteProfileUrlForStorage,
} from "~/services/accounts/accountSiteProfile/urls"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"

it("registers PM-Plan separately from PM-API with Cookie onboarding and native hash routes", () => {
  const definition = getAccountSiteDefinition("pmplan" as never)
  expect(definition).toMatchObject({
    siteType: "pmplan",
    adapterFamily: "pmplan",
    onboarding: {
      displayName: "PM-Plan",
      detection: { hostnames: ["plan.pmcat.top"] },
      routes: { adminCredentialsPath: "/#/keys", usagePath: "/#/usage" },
    },
    productProfile: { auth: { defaultAuthType: "cookie" } },
  })
})

it("preserves independent deployment URLs for storage and duplicate detection", () => {
  const local = { siteType: "pmplan", url: "https://custom-plan.example" }
  const hosted = { siteType: "pmplan", url: "https://plan.pmcat.top" }
  expect(normalizeAccountSiteProfileUrlForStorage(local)).toBe(local.url)
  expect(
    resolveAccountSiteDefaultAuthType({ siteType: "pmplan", url: local.url }),
  ).toBe("cookie")
  expect(isSameAccountSiteOrigin(local, hosted)).toBe(false)
  expect(
    isSameAccountSiteOrigin(local, { ...local, url: `${local.url}/#/keys` }),
  ).toBe(true)
})

it("includes PM-Plan in the account type choices", async () => {
  const { ACCOUNT_SITE_TYPES } =
    await import("~/services/accountSiteDefinitions")
  expect(ACCOUNT_SITE_TYPES).toContain("pmplan")
})
