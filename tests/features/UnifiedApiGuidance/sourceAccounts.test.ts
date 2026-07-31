import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getGatewayGuidanceImportableAccounts } from "~/features/UnifiedApiGuidance/sourceAccounts"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"

const keyResolvableAccount = (id: string, disabled: boolean) =>
  ({
    id,
    disabled,
    siteType: SITE_TYPES.NEW_API,
    baseUrl: "https://relay.example.invalid",
    userId: "user-1",
    token: "redacted-token",
    authType: AuthTypeEnum.AccessToken,
  }) as DisplaySiteData

describe("getGatewayGuidanceImportableAccounts", () => {
  it("keeps only enabled accounts whose runtime key can be resolved", () => {
    const disabled = keyResolvableAccount("disabled-account", true)
    const enabled = keyResolvableAccount("enabled-account", false)

    expect(
      getGatewayGuidanceImportableAccounts([disabled, enabled]).map(
        (account) => account.id,
      ),
    ).toEqual(["enabled-account"])
  })
})
