import { afterEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getAccountDialogSitePolicy } from "~/features/AccountManagement/components/AccountDialog/sitePolicy"
import { isValidAccount } from "~/services/accounts/accountFormValidation"
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
