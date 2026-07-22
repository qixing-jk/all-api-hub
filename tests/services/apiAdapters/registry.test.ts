import { describe, expect, it } from "vitest"

import {
  ACCOUNT_SITE_ADAPTER_FAMILIES,
  ACCOUNT_SITE_TYPES,
  SITE_TYPES,
  type SiteType,
} from "~/constants/siteType"
import { getAccountSiteDefinition } from "~/services/accountSiteDefinitions"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"

const expectTokenProvisioningCapability = (
  capabilities: ReturnType<typeof getSiteTypeCapabilities>,
) => {
  expect(capabilities.account?.tokenProvisioning).toEqual({
    resolveDefaultTokenCreation: expect.any(Function),
    classifyCreatedToken: expect.any(Function),
    isInventoryTokenUsable: expect.any(Function),
    getRepairPolicy: expect.any(Function),
  })
}

const expectAccountDataCapability = (
  capabilities: ReturnType<typeof getSiteTypeCapabilities>,
) => {
  expect(capabilities.account?.data).toEqual({
    fetchData: expect.any(Function),
  })
}

const expectAccountBootstrapCapability = (
  capabilities: ReturnType<typeof getSiteTypeCapabilities>,
) => {
  expect(capabilities.account?.bootstrap).toEqual(
    expect.objectContaining({
      fetchSiteStatus: expect.any(Function),
      fetchUserInfo: expect.any(Function),
      resolveRoutePath: expect.any(Function),
    }),
  )
}

const expectAccountCompletionCapability = (
  capabilities: ReturnType<typeof getSiteTypeCapabilities>,
) => {
  expect(capabilities.account?.completion).toEqual({
    complete: expect.any(Function),
  })
}

const expectInviteLinkCapability = (
  capabilities: ReturnType<typeof getSiteTypeCapabilities>,
) => {
  expect(capabilities.account?.inviteLink).toEqual({
    fetchInviteLink: expect.any(Function),
  })
}

const expectKeyManagementCapability = (
  capabilities: ReturnType<typeof getSiteTypeCapabilities>,
) => {
  expect(capabilities.account?.keyManagement).toEqual(
    expect.objectContaining({
      fetchTokens: expect.any(Function),
      createToken: expect.any(Function),
      updateToken: expect.any(Function),
      resolveTokenKey: expect.any(Function),
      deleteToken: expect.any(Function),
      fetchAvailableModels: expect.any(Function),
    }),
  )
}

const expectAccountRefreshCapability = (
  capabilities: ReturnType<typeof getSiteTypeCapabilities>,
) => {
  expect(capabilities.account?.refresh).toEqual({
    fetchCheckInSupport: expect.any(Function),
    refreshAccount: expect.any(Function),
  })
}

const expectModelPricingCapability = (
  capabilities: ReturnType<typeof getSiteTypeCapabilities>,
) => {
  expect(capabilities.account?.modelPricing).toEqual({
    fetchPricing: expect.any(Function),
  })
}

const expectRedemptionCapability = (
  capabilities: ReturnType<typeof getSiteTypeCapabilities>,
) => {
  expect(capabilities.account?.redemption).toEqual({
    redeem: expect.any(Function),
  })
}

const expectManagedSiteCapabilities = (
  capabilities: ReturnType<typeof getSiteTypeCapabilities>,
) => {
  expect(capabilities.managedSites?.channels).toBeDefined()
  expect(capabilities.managedSites?.config).toEqual({
    checkValid: expect.any(Function),
    get: expect.any(Function),
  })
  expect(capabilities.managedSites?.queries).toEqual({
    fetchSiteUserGroups: expect.any(Function),
    fetchAccountAvailableModels: expect.any(Function),
  })
  expect(capabilities.managedSites?.channelDrafts).toEqual({
    fetchAvailableModels: expect.any(Function),
    buildName: expect.any(Function),
    prepareFormData: expect.any(Function),
    buildPayload: expect.any(Function),
  })
  expect(capabilities.managedSites).not.toHaveProperty("imports")
}

describe("apiAdapters registry", () => {
  it("registers both AccountData producer paths for every account site type", () => {
    for (const siteType of ACCOUNT_SITE_TYPES) {
      const capabilities = getSiteTypeCapabilities(siteType)

      expect(capabilities.account?.data?.fetchData).toBeTypeOf("function")
      expect(capabilities.account?.refresh?.refreshAccount).toBeTypeOf(
        "function",
      )
    }
  })

  it("routes account sites through the definition adapter-family projection", () => {
    const capabilities = getSiteTypeCapabilities(SITE_TYPES.V_API)

    expect(getAccountSiteDefinition(SITE_TYPES.V_API)?.adapterFamily).toBe(
      ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    )
    expect(capabilities).toMatchObject({
      siteType: SITE_TYPES.V_API,
      family: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    })
  })

  it("exposes the definition adapter family for every account site type", () => {
    for (const siteType of ACCOUNT_SITE_TYPES) {
      expect(getSiteTypeCapabilities(siteType).family).toBe(
        getAccountSiteDefinition(siteType)?.adapterFamily,
      )
    }
  })

  it("returns grouped New API family capabilities for compatible account sites", () => {
    for (const siteType of [
      SITE_TYPES.ONE_API,
      SITE_TYPES.NEW_API,
      SITE_TYPES.ANYROUTER,
      SITE_TYPES.VELOERA,
      SITE_TYPES.ONE_HUB,
      SITE_TYPES.DONE_HUB,
      SITE_TYPES.V_API,
      SITE_TYPES.VO_API,
      SITE_TYPES.SUPER_API,
      SITE_TYPES.RIX_API,
      SITE_TYPES.NEO_API,
      SITE_TYPES.WONG_GONGYI,
      SITE_TYPES.UNKNOWN,
    ]) {
      const capabilities = getSiteTypeCapabilities(siteType)

      expect(capabilities).toMatchObject({
        siteType,
        family: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
      })
      expect(capabilities.site?.notice).toEqual({
        fetch: expect.any(Function),
      })
      expect(capabilities.site?.announcements).toEqual({
        fetch: expect.any(Function),
      })
      expectAccountDataCapability(capabilities)
      expectAccountBootstrapCapability(capabilities)
      expectAccountCompletionCapability(capabilities)
      expectInviteLinkCapability(capabilities)
      expectKeyManagementCapability(capabilities)
      expectTokenProvisioningCapability(capabilities)
      expectAccountRefreshCapability(capabilities)
      expectModelPricingCapability(capabilities)
      expectRedemptionCapability(capabilities)
      expect("accountData" in capabilities).toBe(false)
      expect("siteNotice" in capabilities).toBe(false)
      expect("tokenProvisioning" in capabilities).toBe(false)
    }
  })

  it("returns grouped Sub2API capabilities without site notice", () => {
    const capabilities = getSiteTypeCapabilities(SITE_TYPES.SUB2API)

    expect(capabilities).toMatchObject({
      siteType: SITE_TYPES.SUB2API,
      family: ACCOUNT_SITE_ADAPTER_FAMILIES.Sub2Api,
    })
    expect(capabilities.account?.announcements).toEqual({
      fetch: expect.any(Function),
      markRead: expect.any(Function),
    })
    expect(capabilities.account?.modelCatalog).toEqual({
      fetchModels: expect.any(Function),
    })
    expectInviteLinkCapability(capabilities)
    expect(capabilities.site?.notice).toBeUndefined()
  })

  it("returns dedicated VoAPI v2 account capabilities while old VoAPI stays New API-family", () => {
    const capabilities = getSiteTypeCapabilities(SITE_TYPES.VO_API_V2)

    expect(capabilities).toMatchObject({
      siteType: SITE_TYPES.VO_API_V2,
      family: ACCOUNT_SITE_ADAPTER_FAMILIES.VoApiV2,
    })
    expectAccountDataCapability(capabilities)
    expectAccountBootstrapCapability(capabilities)
    expectAccountCompletionCapability(capabilities)
    expectInviteLinkCapability(capabilities)
    expectKeyManagementCapability(capabilities)
    expectTokenProvisioningCapability(capabilities)
    expectAccountRefreshCapability(capabilities)
    expect(capabilities.account?.modelPricing).toBeUndefined()
    expect(capabilities.managedSites).toBeUndefined()

    expect(getSiteTypeCapabilities(SITE_TYPES.VO_API)).toMatchObject({
      siteType: SITE_TYPES.VO_API,
      family: ACCOUNT_SITE_ADAPTER_FAMILIES.NewApiFamily,
    })
  })

  it("returns AIHubMix account capabilities without managed-site capabilities", () => {
    const capabilities = getSiteTypeCapabilities(SITE_TYPES.AIHUBMIX)

    expect(capabilities).toMatchObject({
      siteType: SITE_TYPES.AIHUBMIX,
      family: ACCOUNT_SITE_ADAPTER_FAMILIES.Aihubmix,
    })
    expectAccountDataCapability(capabilities)
    expectAccountBootstrapCapability(capabilities)
    expectAccountCompletionCapability(capabilities)
    expectKeyManagementCapability(capabilities)
    expectTokenProvisioningCapability(capabilities)
    expectAccountRefreshCapability(capabilities)
    expectModelPricingCapability(capabilities)
    expectInviteLinkCapability(capabilities)
    expect(capabilities.account?.announcements).toBeUndefined()
    expect(capabilities.account?.modelCatalog).toBeUndefined()
    expect(capabilities.account?.redemption).toBeUndefined()
    expect(capabilities.site?.notice).toBeUndefined()
    expect(capabilities.managedSites).toBeUndefined()
  })

  it("returns SharedChat account data and service credential capabilities without token CRUD", () => {
    const capabilities = getSiteTypeCapabilities(SITE_TYPES.SHAREDCHAT)

    expect(capabilities).toMatchObject({
      siteType: SITE_TYPES.SHAREDCHAT,
      family: ACCOUNT_SITE_ADAPTER_FAMILIES.SharedChat,
    })
    expectAccountDataCapability(capabilities)
    expect(capabilities.account?.refresh).toEqual({
      refreshAccount: expect.any(Function),
    })
    expect(capabilities.account?.serviceCredential).toEqual({
      fetch: expect.any(Function),
      rotate: expect.any(Function),
    })
    expect(capabilities.account?.modelCatalog).toEqual({
      fetchModels: expect.any(Function),
    })
    expectInviteLinkCapability(capabilities)
    expect(capabilities.account?.keyManagement).toBeUndefined()
    expect(capabilities.account?.tokenProvisioning).toBeUndefined()
    expect(capabilities.account?.modelPricing).toBeUndefined()
    expect(capabilities.managedSites).toBeUndefined()
  })

  it("returns managed-site capabilities for New API family managed sites", () => {
    for (const siteType of [
      SITE_TYPES.NEW_API,
      SITE_TYPES.VELOERA,
      SITE_TYPES.DONE_HUB,
    ] satisfies SiteType[]) {
      const capabilities = getSiteTypeCapabilities(siteType)

      expect(capabilities.siteType).toBe(siteType)
      expectManagedSiteCapabilities(capabilities)
    }
  })

  it("returns managed-only capabilities without account capabilities", () => {
    for (const siteType of [
      SITE_TYPES.OCTOPUS,
      SITE_TYPES.AXON_HUB,
      SITE_TYPES.CLAUDE_CODE_HUB,
    ] satisfies SiteType[]) {
      const capabilities = getSiteTypeCapabilities(siteType)

      expect(capabilities.siteType).toBe(siteType)
      expectManagedSiteCapabilities(capabilities)
      expect(capabilities.account).toBeUndefined()
    }
  })

  it("does not expose managed-site model sync methods for AxonHub or Claude Code Hub", () => {
    for (const siteType of [
      SITE_TYPES.AXON_HUB,
      SITE_TYPES.CLAUDE_CODE_HUB,
    ] satisfies SiteType[]) {
      const capabilities = getSiteTypeCapabilities(siteType)

      expect(capabilities.managedSites?.channels?.fetchModels).toBeUndefined()
      expect(capabilities.managedSites?.channels?.updateModels).toBeUndefined()
      expect(
        capabilities.managedSites?.channels?.updateModelMapping,
      ).toBeUndefined()
    }
  })

  it("returns only the site type for unsupported non-account site types", () => {
    const capabilities = getSiteTypeCapabilities("__unsupported__" as SiteType)

    expect(capabilities).toEqual({
      siteType: "__unsupported__",
    })
  })
})
