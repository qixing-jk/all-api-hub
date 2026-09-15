import { describe, expect, it } from "vitest"

import {
  canCreateAccountKeyResources,
  canListAccountKeyResources,
  canListAccountRuntimeKeys,
  canResolveAccountRuntimeKeySecret,
  canRunAccountDefaultTokenAutomation,
  createStoredAccountKeyProductContext,
  getAccountKeyProductCapabilities,
  supportsAccountKeyCreation,
} from "~/services/accounts/keyProductCapabilities"
import { AuthTypeEnum } from "~/types"
import {
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"

const account = buildDisplaySiteData({ siteType: "new-api" })

describe("native account key product capabilities", () => {
  it.each([
    "new-api",
    "sub2api",
    "voapi-v2",
    "AIHubMix",
    "openrouter",
  ] as const)("enables native management for %s", (siteType) => {
    const owner = { ...account, siteType }
    expect(canListAccountKeyResources(owner)).toBe(true)
    expect(canCreateAccountKeyResources(owner)).toBe(true)
    expect(canListAccountRuntimeKeys(owner)).toBe(true)
    expect(supportsAccountKeyCreation(siteType)).toBe(true)
    expect(getAccountKeyProductCapabilities(owner)).not.toHaveProperty(
      "apiTokens",
    )
    expect(getAccountKeyProductCapabilities(owner)).not.toHaveProperty(
      "tokenMetadata",
    )
  })
  it("keeps singleton service credentials separate from resource CRUD", () => {
    const owner = { ...account, siteType: "sharedchat" as const }
    expect(canListAccountRuntimeKeys(owner)).toBe(true)
    expect(canCreateAccountKeyResources(owner)).toBe(false)
    expect(canResolveAccountRuntimeKeySecret(owner)).toBe(true)
  })
  it.each(["AIHubMix", "openrouter"] as const)(
    "does not advertise recoverable inventory secrets for %s",
    (siteType) => {
      expect(canResolveAccountRuntimeKeySecret({ ...account, siteType })).toBe(
        false,
      )
    },
  )
  it("derives automation from native creation policy", () => {
    expect(canRunAccountDefaultTokenAutomation(account)).toBe(true)
    expect(
      canRunAccountDefaultTokenAutomation({ ...account, siteType: "sub2api" }),
    ).toBe(true)
    expect(
      canRunAccountDefaultTokenAutomation({ ...account, siteType: "voapi-v2" }),
    ).toBe(false)
    expect(
      canRunAccountDefaultTokenAutomation({
        ...account,
        siteType: "openrouter",
      }),
    ).toBe(false)
  })
  it.each([
    { disabled: true },
    { id: "" },
    { baseUrl: "" },
    { userId: "" },
    { token: "" },
    { authType: AuthTypeEnum.None },
  ])("requires account readiness %j", (override) => {
    expect(canListAccountRuntimeKeys({ ...account, ...override })).toBe(false)
    expect(canCreateAccountKeyResources({ ...account, ...override })).toBe(
      false,
    )
  })
  it("accepts a cookie session and derives the same context from storage", () => {
    const stored = buildSiteAccount({
      authType: AuthTypeEnum.Cookie,
      cookieAuth: { sessionCookie: "session=test" },
    })
    expect(createStoredAccountKeyProductContext(stored)).toMatchObject({
      id: stored.id,
      baseUrl: stored.site_url,
      cookieAuthSessionCookie: "session=test",
    })
    expect(
      canListAccountRuntimeKeys({
        ...account,
        token: "",
        authType: AuthTypeEnum.Cookie,
        cookieAuthSessionCookie: "session=test",
      }),
    ).toBe(true)
  })
})
