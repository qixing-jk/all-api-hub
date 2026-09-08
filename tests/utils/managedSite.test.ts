import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { getManagedSiteTargetOptions } from "~/services/managedSites/channelMigrationTargets"
import {
  getManagedSiteContext,
  getManagedSiteContextForType,
  getManagedSiteLabel,
  getManagedSiteLabelKey,
  getManagedSiteMessagesKeyFromSiteType,
  getManagedSiteUnsupportedModelSyncMessage,
  hasUsableManagedSiteChannelKey,
  needsManagedSiteChannelKeyResolution,
} from "~/services/managedSites/utils/managedSite"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"

describe("managedSite", () => {
  it.each([
    [SITE_TYPES.NEW_API, "settings:managedSite.newApi", "newapi"],
    [SITE_TYPES.VELOERA, "settings:managedSite.veloera", "veloera"],
    [SITE_TYPES.DONE_HUB, "settings:managedSite.doneHub", "donehub"],
    [SITE_TYPES.OCTOPUS, "settings:managedSite.octopus", "octopus"],
    [SITE_TYPES.AXON_HUB, "settings:managedSite.axonHub", "axonhub"],
    [
      SITE_TYPES.CLAUDE_CODE_HUB,
      "settings:managedSite.claudeCodeHub",
      "claudecodehub",
    ],
    [SITE_TYPES.SUB2API, "settings:managedSite.sub2api", "sub2api"],
  ] as const)(
    "preserves registered label and messages for %s",
    (siteType, labelKey, messagesKey) => {
      const t = vi.fn(
        (key: string) => `translated:${key}`,
      ) as unknown as TFunction
      expect(getManagedSiteLabelKey(siteType)).toBe(labelKey)
      expect(getManagedSiteLabel(t, siteType)).toBe(`translated:${labelKey}`)
      expect(getManagedSiteMessagesKeyFromSiteType(siteType)).toBe(messagesKey)
    },
  )

  it("includes configured Sub2API targets now that their native migration capability is registered", () => {
    const config = {
      baseUrl: "http://sub2api.local",
      adminToken: "admin-token",
    }
    const preferences = { ...DEFAULT_PREFERENCES, sub2apiManagedSite: config }
    expect(getManagedSiteTargetOptions(preferences)).toContainEqual({
      siteType: SITE_TYPES.SUB2API,
      labelKey: "settings:managedSite.sub2api",
      messagesKey: "sub2api",
      config,
    })
    expect(
      getManagedSiteTargetOptions(preferences, {
        excludeSiteTypes: [SITE_TYPES.SUB2API],
      }),
    ).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ siteType: SITE_TYPES.SUB2API }),
      ]),
    )
  })
  it("renders unsupported model-sync copy from the managed-site label", () => {
    const t = vi.fn((key: string, options?: { siteName?: string }) =>
      key === "settings:managedSite.sub2api"
        ? "Sub2API"
        : `${key}:${options?.siteName}`,
    ) as unknown as TFunction

    expect(
      getManagedSiteUnsupportedModelSyncMessage(t, SITE_TYPES.SUB2API),
    ).toBe("messages:managedSite.unsupportedModelSync:Sub2API")
    expect(getManagedSiteLabelKey(SITE_TYPES.SUB2API)).toBe(
      "settings:managedSite.sub2api",
    )
  })

  it("returns Done Hub messages key + label key", () => {
    expect(getManagedSiteMessagesKeyFromSiteType(SITE_TYPES.DONE_HUB)).toBe(
      "donehub",
    )
    expect(getManagedSiteLabelKey(SITE_TYPES.DONE_HUB)).toBe(
      "settings:managedSite.doneHub",
    )
  })

  it("builds managed-site context for Done Hub", () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      managedSiteType: SITE_TYPES.DONE_HUB,
    } satisfies UserPreferences
    expect(getManagedSiteContext(prefs)).toEqual({
      siteType: SITE_TYPES.DONE_HUB,
      messagesKey: "donehub",
    })
  })

  it("builds managed-site context for an explicit target site type", () => {
    expect(getManagedSiteContextForType(SITE_TYPES.VELOERA)).toEqual({
      siteType: SITE_TYPES.VELOERA,
      messagesKey: "veloera",
    })
  })

  it("lists only configured migration targets and excludes selected site types", () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      managedSiteType: SITE_TYPES.NEW_API,
      doneHub: {
        baseUrl: "https://donehub.example.com",
        adminToken: "donehub-token",
        userId: "7",
      },
      veloera: {
        baseUrl: "",
        adminToken: "veloera-token",
        userId: "8",
      },
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "admin",
        password: "secret",
      },
    } satisfies UserPreferences

    expect(
      getManagedSiteTargetOptions(prefs, {
        excludeSiteTypes: [SITE_TYPES.NEW_API],
      }),
    ).toEqual([
      {
        siteType: SITE_TYPES.DONE_HUB,
        labelKey: "settings:managedSite.doneHub",
        messagesKey: "donehub",
        config: {
          baseUrl: "https://donehub.example.com",
          adminToken: "donehub-token",
          userId: "7",
        },
      },
      {
        siteType: SITE_TYPES.OCTOPUS,
        labelKey: "settings:managedSite.octopus",
        messagesKey: "octopus",
        config: {
          baseUrl: "https://octopus.example.com",
          username: "admin",
          password: "secret",
        },
      },
    ])
  })

  it("reuses shared masked-key detection for managed-site channel keys", () => {
    expect(hasUsableManagedSiteChannelKey("sk-********")).toBe(false)
    expect(needsManagedSiteChannelKeyResolution("sk-********")).toBe(true)

    expect(hasUsableManagedSiteChannelKey("AIza-real-provider-key")).toBe(true)
    expect(needsManagedSiteChannelKeyResolution("AIza-real-provider-key")).toBe(
      false,
    )

    expect(hasUsableManagedSiteChannelKey("")).toBe(false)
    expect(needsManagedSiteChannelKeyResolution("")).toBe(true)
  })

  it("preserves existing behavior for New API selection", () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      managedSiteType: SITE_TYPES.NEW_API,
    } satisfies UserPreferences
    expect(getManagedSiteMessagesKeyFromSiteType(SITE_TYPES.NEW_API)).toBe(
      "newapi",
    )
    expect(getManagedSiteContext(prefs).siteType).toBe(SITE_TYPES.NEW_API)
  })
})
