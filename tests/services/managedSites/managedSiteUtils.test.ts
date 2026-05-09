import { describe, expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  getManagedSiteAdminConfigForType,
  getManagedSiteConfigFromPreferences,
  getManagedSiteConfigMissingMessage,
  getManagedSiteContext,
  getManagedSiteLabelKey,
  getManagedSiteMessagesKeyFromSiteType,
  getManagedSiteNoChannelsToSyncMessage,
  getManagedSiteTargetOptions,
  hasUsableManagedSiteChannelKey,
  needsManagedSiteChannelKeyResolution,
  supportsManagedSiteBaseUrlChannelLookup,
} from "~/services/managedSites/utils/managedSite"

const translate = (key: string) => key

describe("managedSite utils", () => {
  it("defaults to new-api when managedSiteType is missing", () => {
    const prefs = {
      newApi: {
        baseUrl: "https://new-api.example.com",
        adminToken: "token",
        userId: "1",
      },
    }

    expect(getManagedSiteConfigFromPreferences(prefs as any)).toEqual({
      siteType: SITE_TYPES.NEW_API,
      config: prefs.newApi,
    })
    expect(getManagedSiteContext(prefs as any)).toEqual({
      siteType: SITE_TYPES.NEW_API,
      messagesKey: "newapi",
    })
  })

  it("returns label and message keys for each managed-site type", () => {
    expect(getManagedSiteLabelKey(SITE_TYPES.OCTOPUS)).toBe(
      "settings:managedSite.octopus",
    )
    expect(getManagedSiteLabelKey(SITE_TYPES.AXON_HUB)).toBe(
      "settings:managedSite.axonHub",
    )
    expect(getManagedSiteLabelKey(SITE_TYPES.CLAUDE_CODE_HUB)).toBe(
      "settings:managedSite.claudeCodeHub",
    )
    expect(getManagedSiteLabelKey(SITE_TYPES.DONE_HUB)).toBe(
      "settings:managedSite.doneHub",
    )
    expect(getManagedSiteLabelKey(SITE_TYPES.VELOERA)).toBe(
      "settings:managedSite.veloera",
    )
    expect(getManagedSiteLabelKey(SITE_TYPES.NEW_API)).toBe(
      "settings:managedSite.newApi",
    )

    expect(getManagedSiteMessagesKeyFromSiteType(SITE_TYPES.OCTOPUS)).toBe(
      "octopus",
    )
    expect(getManagedSiteMessagesKeyFromSiteType(SITE_TYPES.AXON_HUB)).toBe(
      "axonhub",
    )
    expect(
      getManagedSiteMessagesKeyFromSiteType(SITE_TYPES.CLAUDE_CODE_HUB),
    ).toBe("claudecodehub")
    expect(getManagedSiteMessagesKeyFromSiteType(SITE_TYPES.DONE_HUB)).toBe(
      "donehub",
    )
    expect(getManagedSiteMessagesKeyFromSiteType(SITE_TYPES.VELOERA)).toBe(
      "veloera",
    )
    expect(getManagedSiteMessagesKeyFromSiteType(SITE_TYPES.NEW_API)).toBe(
      "newapi",
    )
  })

  it("validates octopus admin config separately from legacy token-based configs", () => {
    const prefs = {
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "admin",
        password: "secret",
      },
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "admin-token",
        userId: "42",
      },
      doneHub: {
        baseUrl: "",
        adminToken: "",
        userId: "",
      },
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "secret",
      },
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "admin-token",
      },
    }

    expect(
      getManagedSiteAdminConfigForType(prefs as any, SITE_TYPES.OCTOPUS),
    ).toEqual({
      baseUrl: "https://octopus.example.com",
      adminToken: "",
      userId: "admin",
    })
    expect(
      getManagedSiteAdminConfigForType(prefs as any, SITE_TYPES.VELOERA),
    ).toEqual({
      baseUrl: "https://veloera.example.com",
      adminToken: "admin-token",
      userId: "42",
    })
    expect(
      getManagedSiteAdminConfigForType(prefs as any, SITE_TYPES.AXON_HUB),
    ).toEqual({
      baseUrl: "https://axonhub.example.com",
      adminToken: "secret",
      userId: "admin@example.com",
    })
    expect(
      getManagedSiteAdminConfigForType(
        prefs as any,
        SITE_TYPES.CLAUDE_CODE_HUB,
      ),
    ).toEqual({
      baseUrl: "https://cch.example.com",
      adminToken: "admin-token",
      userId: "admin",
    })
    expect(
      getManagedSiteAdminConfigForType(prefs as any, SITE_TYPES.DONE_HUB),
    ).toBeNull()
    expect(
      getManagedSiteAdminConfigForType(
        {
          octopus: {
            baseUrl: "https://octopus.example.com",
            username: "",
            password: "",
          },
        } as any,
        SITE_TYPES.OCTOPUS,
      ),
    ).toBeNull()
    expect(
      getManagedSiteAdminConfigForType(
        {
          claudeCodeHub: {
            baseUrl: "",
            adminToken: "admin-token",
          },
        } as any,
        SITE_TYPES.CLAUDE_CODE_HUB,
      ),
    ).toBeNull()
    expect(
      getManagedSiteAdminConfigForType(
        {
          claudeCodeHub: {
            baseUrl: "https://cch.example.com",
            adminToken: "",
          },
        } as any,
        SITE_TYPES.CLAUDE_CODE_HUB,
      ),
    ).toBeNull()
  })

  it("builds managed-site target options and respects exclusions", () => {
    const prefs = {
      newApi: {
        baseUrl: "https://new-api.example.com",
        adminToken: "new-api-token",
        userId: "1",
      },
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "2",
      },
      doneHub: {
        baseUrl: "",
        adminToken: "",
        userId: "",
      },
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "admin",
        password: "secret",
      },
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "secret",
      },
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "cch-token",
      },
    }

    const options = getManagedSiteTargetOptions(prefs as any, {
      excludeSiteTypes: [SITE_TYPES.VELOERA],
    })

    expect(options.map((item) => item.siteType)).toEqual([
      SITE_TYPES.NEW_API,
      SITE_TYPES.OCTOPUS,
      SITE_TYPES.AXON_HUB,
      SITE_TYPES.CLAUDE_CODE_HUB,
    ])
  })

  it("offers complete AxonHub config as a managed-site migration target and respects exclusions", () => {
    const prefs = {
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "secret",
      },
    }

    expect(getManagedSiteTargetOptions(prefs as any)).toEqual([
      expect.objectContaining({
        siteType: SITE_TYPES.AXON_HUB,
        labelKey: "settings:managedSite.axonHub",
        messagesKey: "axonhub",
        config: {
          baseUrl: "https://axonhub.example.com",
          adminToken: "secret",
          userId: "admin@example.com",
        },
      }),
    ])
    expect(
      getManagedSiteTargetOptions(prefs as any, {
        excludeSiteTypes: [SITE_TYPES.AXON_HUB],
      }),
    ).toEqual([])
  })

  it("does not offer incomplete AxonHub config as a managed-site migration target", () => {
    const prefs = {
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "",
      },
    }

    expect(getManagedSiteTargetOptions(prefs as any)).toEqual([])
  })

  it("offers complete Claude Code Hub config as a managed-site migration target and respects exclusions", () => {
    const prefs = {
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "admin-token",
      },
    }

    expect(getManagedSiteTargetOptions(prefs as any)).toEqual([
      expect.objectContaining({
        siteType: SITE_TYPES.CLAUDE_CODE_HUB,
        labelKey: "settings:managedSite.claudeCodeHub",
        messagesKey: "claudecodehub",
        config: {
          baseUrl: "https://cch.example.com",
          adminToken: "admin-token",
          userId: "admin",
        },
      }),
    ])
    expect(
      getManagedSiteTargetOptions(prefs as any, {
        excludeSiteTypes: [SITE_TYPES.CLAUDE_CODE_HUB],
      }),
    ).toEqual([])
  })

  it("does not offer incomplete Claude Code Hub config as a managed-site migration target", () => {
    const prefs = {
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "",
      },
    }

    expect(getManagedSiteTargetOptions(prefs as any)).toEqual([])
  })

  it("detects when a managed-site key is directly usable", () => {
    expect(hasUsableManagedSiteChannelKey("sk-live-secret")).toBe(true)
    expect(hasUsableManagedSiteChannelKey("  sk-live-secret  ")).toBe(true)
    expect(hasUsableManagedSiteChannelKey("sk-mask***")).toBe(false)
    expect(hasUsableManagedSiteChannelKey("   ")).toBe(false)

    expect(needsManagedSiteChannelKeyResolution("sk-mask***")).toBe(true)
    expect(needsManagedSiteChannelKeyResolution(undefined)).toBe(true)
    expect(needsManagedSiteChannelKeyResolution("sk-live-secret")).toBe(false)
  })

  it("returns provider-specific translation keys and base-url lookup support", () => {
    expect(
      getManagedSiteConfigMissingMessage(translate as any, "donehub"),
    ).toBe("messages:donehub.configMissing")
    expect(
      getManagedSiteConfigMissingMessage(translate as any, "veloera"),
    ).toBe("messages:veloera.configMissing")
    expect(
      getManagedSiteConfigMissingMessage(translate as any, "octopus"),
    ).toBe("messages:octopus.configMissing")
    expect(
      getManagedSiteConfigMissingMessage(translate as any, "axonhub"),
    ).toBe("messages:axonhub.configMissing")
    expect(
      getManagedSiteConfigMissingMessage(translate as any, "claudecodehub"),
    ).toBe("messages:claudecodehub.configMissing")
    expect(getManagedSiteConfigMissingMessage(translate as any, "newapi")).toBe(
      "messages:newapi.configMissing",
    )

    expect(
      getManagedSiteNoChannelsToSyncMessage(translate as any, "donehub"),
    ).toBe("messages:donehub.noChannelsToSync")
    expect(
      getManagedSiteNoChannelsToSyncMessage(translate as any, "veloera"),
    ).toBe("messages:veloera.noChannelsToSync")
    expect(
      getManagedSiteNoChannelsToSyncMessage(translate as any, "octopus"),
    ).toBe("messages:octopus.noChannelsToSync")
    expect(
      getManagedSiteNoChannelsToSyncMessage(translate as any, "axonhub"),
    ).toBe("messages:axonhub.noChannelsToSync")
    expect(
      getManagedSiteNoChannelsToSyncMessage(translate as any, "claudecodehub"),
    ).toBe("messages:claudecodehub.noChannelsToSync")
    expect(
      getManagedSiteNoChannelsToSyncMessage(translate as any, "newapi"),
    ).toBe("messages:newapi.noChannelsToSync")

    expect(supportsManagedSiteBaseUrlChannelLookup(SITE_TYPES.VELOERA)).toBe(
      false,
    )
    expect(
      supportsManagedSiteBaseUrlChannelLookup(SITE_TYPES.CLAUDE_CODE_HUB),
    ).toBe(false)
    expect(supportsManagedSiteBaseUrlChannelLookup(SITE_TYPES.NEW_API)).toBe(
      true,
    )
  })
})
