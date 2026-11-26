import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getAccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/form/sitePolicy"
import {
  getAccountFormIssues,
  isValidAccount,
} from "~/services/accounts/editing/accountFormValidation"
import * as definitions from "~/services/accountSiteDefinitions/registry"
import { AuthTypeEnum } from "~/types"

const fields = {
  siteName: "Example",
  username: "user",
  userId: "",
  accessToken: "credential",
  authType: AuthTypeEnum.AccessToken,
  exchangeRate: "1",
}

afterEach(() => vi.restoreAllMocks())

describe("registered account form policy", () => {
  it("locates missing identity before credential and reports a later invalid amount", () => {
    expect(
      getAccountFormIssues({
        ...fields,
        siteType: SITE_TYPES.NEW_API,
        siteName: " ",
        accessToken: "",
        exchangeRate: "-1",
      }),
    ).toEqual([
      { field: "siteName", kind: "missing" },
      { field: "userId", kind: "missing" },
      { field: "accessToken", kind: "missing" },
      { field: "exchangeRate", kind: "invalid" },
    ])
  })

  it("requires choosing a Vercel team before saving", () => {
    expect(
      isValidAccount({ ...fields, siteType: SITE_TYPES.VERCEL_AI_GATEWAY }),
    ).toBe(false)
    expect(
      isValidAccount({
        ...fields,
        siteType: SITE_TYPES.VERCEL_AI_GATEWAY,
        userId: "team_chosen",
      }),
    ).toBe(true)
  })

  it("reports provider credential, login and balance errors in editor order", () => {
    expect(
      getAccountFormIssues({
        ...fields,
        siteType: SITE_TYPES.SUB2API,
        username: " ",
        userId: "42",
        refreshTokenRequired: true,
        loginChange: { methodId: "unknown" },
        exchangeRate: " ",
        manualBalanceUsd: "-1",
      }),
    ).toEqual([
      { field: "refreshToken", kind: "missing" },
      { field: "login", kind: "invalid" },
      { field: "exchangeRate", kind: "missing" },
      { field: "manualBalanceUsd", kind: "invalid" },
    ])
  })

  it("requires a nonblank New API username", () => {
    expect(
      getAccountFormIssues({
        ...fields,
        userId: "42",
        username: " ",
        siteType: SITE_TYPES.NEW_API,
      }),
    ).toEqual([{ field: "username", kind: "missing" }])
  })

  it.each([undefined, " ", "session=example"])(
    "reports only a missing cookie on a manual Cookie site (%s)",
    (cookie) => {
      expect(
        getAccountFormIssues({
          ...fields,
          userId: "42",
          siteType: SITE_TYPES.NEW_API,
          authType: AuthTypeEnum.Cookie,
          cookieAuthSessionCookie: cookie,
        }),
      ).toEqual(cookie?.trim() ? [] : [{ field: "cookie", kind: "missing" }])
    },
  )
  it.each([
    [SITE_TYPES.NEW_API, false],
    [SITE_TYPES.SUB2API, false],
    [SITE_TYPES.AIHUBMIX, false],
    [SITE_TYPES.OPENROUTER, true],
    [SITE_TYPES.UNKNOWN, false],
  ] as const)(
    "keeps UI and save validation aligned for %s",
    (siteType, optional) => {
      expect(getAccountDialogSitePolicy(siteType).requireUserId).toBe(!optional)
      expect(isValidAccount({ ...fields, siteType })).toBe(optional)
      expect(isValidAccount({ ...fields, siteType, userId: "42" })).toBe(true)
    },
  )

  it("uses the identity policy for both UI and save validation independently of site identity", () => {
    const override = vi
      .spyOn(definitions, "getAccountSiteProductProfileOverride")
      .mockReturnValue({ identity: { userIdRequired: false } })
    expect(getAccountDialogSitePolicy(SITE_TYPES.NEW_API).requireUserId).toBe(
      false,
    )
    expect(isValidAccount({ ...fields, siteType: SITE_TYPES.NEW_API })).toBe(
      true,
    )

    override.mockReturnValue({ identity: { userIdRequired: true } })
    expect(
      getAccountDialogSitePolicy(SITE_TYPES.OPENROUTER).requireUserId,
    ).toBe(true)
    expect(isValidAccount({ ...fields, siteType: SITE_TYPES.OPENROUTER })).toBe(
      false,
    )
  })

  it("reads presentation and fixed URLs from the selected registration", () => {
    const definition = definitions.getAccountSiteDefinition(SITE_TYPES.NEW_API)!
    vi.spyOn(definitions, "getAccountSiteDefinition").mockReturnValue({
      ...definition,
      onboarding: {
        ...definition.onboarding!,
        displayName: "Example Provider",
        accountForm: {
          fixedSiteUrl: "http://local.example",
          defaultSiteName: "Example",
        },
      },
    })
    expect(getAccountDialogSitePolicy(SITE_TYPES.NEW_API)).toMatchObject({
      siteTypeLabel: "Example Provider",
      canonicalSiteUrl: "http://local.example",
      defaultSiteName: "Example",
      lockSiteUrl: true,
    })
  })

  it("does not expose mutable onboarding policy from the registry", () => {
    const definition = definitions.getAccountSiteDefinition(
      SITE_TYPES.OPENROUTER,
    )!
    definition.onboarding!.accountForm!.fixedSiteUrl = "http://changed.example"
    expect(
      getAccountDialogSitePolicy(SITE_TYPES.OPENROUTER).canonicalSiteUrl,
    ).toBe("https://openrouter.ai")
  })
})
