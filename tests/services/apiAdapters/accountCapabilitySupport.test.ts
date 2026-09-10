import { describe, expect, it } from "vitest"

import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  ACCOUNT_SITE_TYPES,
} from "~/constants/siteType"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import {
  ACCOUNT_SITE_CAPABILITY_IDS,
  ACCOUNT_USER_FEATURE_IDS,
  ACCOUNT_USER_FEATURE_UNAVAILABLE_REASONS,
  getAccountSiteCapabilitySupportMatrix,
  resolveAccountUserFeatureAvailability,
} from "~/services/apiAdapters/accountCapabilitySupport"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"

describe("account capability support", () => {
  it("classifies every declared account capability for every account site type", () => {
    const expectedCapabilityIds = Object.values(ACCOUNT_SITE_CAPABILITY_IDS)

    for (const siteType of ACCOUNT_SITE_TYPES) {
      const capabilities = getSiteTypeCapabilities(siteType)
      const supportMatrix = getAccountSiteCapabilitySupportMatrix(capabilities)

      expect(Object.keys(supportMatrix).sort()).toEqual(
        [...expectedCapabilityIds].sort(),
      )

      for (const capabilityId of expectedCapabilityIds) {
        const expectedCapability =
          getSiteTypeCapabilities(siteType).account?.[capabilityId]
        const support = supportMatrix[capabilityId]

        expect(support.status).toBe(
          expectedCapability ? "supported" : "unsupported",
        )
      }
    }
  })

  it("uses registered capability presence as the redemption support discriminator", () => {
    for (const siteType of ACCOUNT_SITE_TYPES) {
      const capabilities = getSiteTypeCapabilities(siteType)
      const availability = resolveAccountUserFeatureAvailability(
        siteType,
        ACCOUNT_USER_FEATURE_IDS.AutomaticRedemption,
        capabilities,
      )
      expect(availability.status).toBe(
        capabilities.account?.redemption ? "supported" : "unsupported",
      )
    }
  })

  it("uses both registered capabilities for default-token automation", () => {
    for (const siteType of ACCOUNT_SITE_TYPES) {
      const capabilities = getSiteTypeCapabilities(siteType)
      const availability = resolveAccountUserFeatureAvailability(
        siteType,
        ACCOUNT_USER_FEATURE_IDS.DefaultTokenAutomation,
        capabilities,
      )
      const implementationIsComplete = Boolean(
        capabilities.account?.keyManagement &&
          capabilities.account.tokenProvisioning,
      )

      expect(availability.status).toBe(
        implementationIsComplete ? "supported" : "unsupported",
      )
    }
  })

  it("reports missing capability when the registry has no implementation", () => {
    const supportedSiteType = ACCOUNT_SITE_TYPES.find(
      (siteType) =>
        getAccountSiteDefinition(siteType)?.adapterFamily ===
        ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    )!
    expect(
      resolveAccountUserFeatureAvailability(
        supportedSiteType,
        ACCOUNT_USER_FEATURE_IDS.AutomaticRedemption,
        { siteType: supportedSiteType },
      ),
    ).toMatchObject({
      status: "unsupported",
      reason: ACCOUNT_USER_FEATURE_UNAVAILABLE_REASONS.CapabilityMissing,
    })
  })
})
