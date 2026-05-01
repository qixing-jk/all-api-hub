import { describe, expect, it } from "vitest"

import {
  AXON_HUB,
  CLAUDE_CODE_HUB,
  DONE_HUB,
  NEW_API,
  OCTOPUS,
  VELOERA,
} from "~/constants/siteType"
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
      siteType: NEW_API,
      config: prefs.newApi,
    })
    expect(getManagedSiteContext(prefs as any)).toEqual({
      siteType: NEW_API,
      messagesKey: "newapi",
    })
  })

  it("returns label and message keys for each managed-site type", () => {
    expect(getManagedSiteLabelKey(OCTOPUS)).toBe("settings:managedSite.octopus")
    expect(getManagedSiteLabelKey(AXON_HUB)).toBe(
      "settings:managedSite.axonHub",
    )
    expect(getManagedSiteLabelKey(CLAUDE_CODE_HUB)).toBe(
      "settings:managedSite.claudeCodeHub",
    )
    expect(getManagedSiteLabelKey(DONE_HUB)).toBe(
      "settings:managedSite.doneHub",
    )
    expect(getManagedSiteLabelKey(VELOERA)).toBe("settings:managedSite.veloera")
    expect(getManagedSiteLabelKey(NEW_API)).toBe("settings:managedSite.newApi")

    expect(getManagedSiteMessagesKeyFromSiteType(OCTOPUS)).toBe("octopus")
    expect(getManagedSiteMessagesKeyFromSiteType(AXON_HUB)).toBe("axonhub")
    expect(getManagedSiteMessagesKeyFromSiteType(CLAUDE_CODE_HUB)).toBe(
      "claudecodehub",
    )
    expect(getManagedSiteMessagesKeyFromSiteType(DONE_HUB)).toBe("donehub")
    expect(getManagedSiteMessagesKeyFromSiteType(VELOERA)).toBe("veloera")
    expect(getManagedSiteMessagesKeyFromSiteType(NEW_API)).toBe("newapi")
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

    expect(getManagedSiteAdminConfigForType(prefs as any, OCTOPUS)).toEqual({
      baseUrl: "https://octopus.example.com",
      adminToken: "",
      userId: "admin",
    })
    expect(getManagedSiteAdminConfigForType(prefs as any, VELOERA)).toEqual({
      baseUrl: "https://veloera.example.com",
      adminToken: "admin-token",
      userId: "42",
    })
    expect(getManagedSiteAdminConfigForType(prefs as any, AXON_HUB)).toEqual({
      baseUrl: "https://axonhub.example.com",
      adminToken: "secret",
      userId: "admin@example.com",
    })
    expect(
      getManagedSiteAdminConfigForType(prefs as any, CLAUDE_CODE_HUB),
    ).toEqual({
      baseUrl: "https://cch.example.com",
      adminToken: "admin-token",
      userId: "admin",
    })
    expect(getManagedSiteAdminConfigForType(prefs as any, DONE_HUB)).toBeNull()
    expect(
      getManagedSiteAdminConfigForType(
        {
          octopus: {
            baseUrl: "https://octopus.example.com",
            username: "",
            password: "",
          },
        } as any,
        OCTOPUS,
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
        CLAUDE_CODE_HUB,
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
        CLAUDE_CODE_HUB,
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
    }

    const options = getManagedSiteTargetOptions(prefs as any, {
      excludeSiteTypes: [VELOERA],
    })

    expect(options.map((item) => item.siteType)).toEqual([
      NEW_API,
      OCTOPUS,
      AXON_HUB,
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
        siteType: AXON_HUB,
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
        excludeSiteTypes: [AXON_HUB],
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

  it("does not offer Claude Code Hub as a managed-site migration target", () => {
    const prefs = {
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "admin-token",
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

    expect(supportsManagedSiteBaseUrlChannelLookup(VELOERA)).toBe(false)
    expect(supportsManagedSiteBaseUrlChannelLookup(CLAUDE_CODE_HUB)).toBe(false)
    expect(supportsManagedSiteBaseUrlChannelLookup(NEW_API)).toBe(true)
  })
})
