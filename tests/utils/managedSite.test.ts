import { describe, expect, it } from "vitest"

import { DONE_HUB, NEW_API, VELOERA } from "~/constants/siteType"
import {
  getManagedSiteAdminConfig,
  getManagedSiteAdminConfigForType,
  getManagedSiteConfigFromPreferences,
  getManagedSiteContext,
  getManagedSiteContextForType,
  getManagedSiteLabelKey,
  getManagedSiteMessagesKeyFromSiteType,
  getManagedSiteTargetOptions,
} from "~/services/managedSites/utils/managedSite"
import {
  DEFAULT_PREFERENCES,
  type UserPreferences,
} from "~/services/preferences/userPreferences"

describe("managedSite", () => {
  it("resolves Done Hub config when selected", () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      managedSiteType: DONE_HUB,
      doneHub: {
        baseUrl: "https://donehub.example.com",
        adminToken: "token",
        userId: "1",
      },
    } satisfies UserPreferences

    const { siteType, config } = getManagedSiteConfigFromPreferences(prefs)
    expect(siteType).toBe(DONE_HUB)
    expect(config).toEqual(prefs.doneHub)
  })

  it("returns Done Hub messages key + label key", () => {
    expect(getManagedSiteMessagesKeyFromSiteType(DONE_HUB)).toBe("donehub")
    expect(getManagedSiteLabelKey(DONE_HUB)).toBe(
      "settings:managedSite.doneHub",
    )
  })

  it("builds managed-site context for Done Hub", () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      managedSiteType: DONE_HUB,
    } satisfies UserPreferences
    expect(getManagedSiteContext(prefs)).toEqual({
      siteType: DONE_HUB,
      messagesKey: "donehub",
    })
  })

  it("returns null admin config when Done Hub credentials are incomplete", () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      managedSiteType: DONE_HUB,
      doneHub: {
        baseUrl: "",
        adminToken: "token",
        userId: "1",
      },
    } satisfies UserPreferences

    expect(getManagedSiteAdminConfig(prefs)).toBeNull()
  })

  it("returns admin config when Done Hub credentials are present", () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      managedSiteType: DONE_HUB,
      doneHub: {
        baseUrl: "https://donehub.example.com",
        adminToken: "token",
        userId: "1",
      },
    } satisfies UserPreferences

    expect(getManagedSiteAdminConfig(prefs)).toEqual({
      baseUrl: prefs.doneHub.baseUrl,
      adminToken: prefs.doneHub.adminToken,
      userId: prefs.doneHub.userId,
    })
  })

  it("can resolve admin config for an explicit target site type", () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      managedSiteType: NEW_API,
      doneHub: {
        baseUrl: "https://donehub.example.com",
        adminToken: "donehub-token",
        userId: "7",
      },
    } satisfies UserPreferences

    expect(getManagedSiteAdminConfigForType(prefs, DONE_HUB)).toEqual({
      baseUrl: prefs.doneHub.baseUrl,
      adminToken: prefs.doneHub.adminToken,
      userId: prefs.doneHub.userId,
    })
  })

  it("builds managed-site context for an explicit target site type", () => {
    expect(getManagedSiteContextForType(VELOERA)).toEqual({
      siteType: VELOERA,
      messagesKey: "veloera",
    })
  })

  it("lists only configured migration targets and excludes selected site types", () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      managedSiteType: NEW_API,
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
        excludeSiteTypes: [NEW_API],
      }),
    ).toEqual([
      {
        siteType: DONE_HUB,
        labelKey: "settings:managedSite.doneHub",
        messagesKey: "donehub",
        config: {
          baseUrl: "https://donehub.example.com",
          adminToken: "donehub-token",
          userId: "7",
        },
      },
      {
        siteType: "octopus",
        labelKey: "settings:managedSite.octopus",
        messagesKey: "octopus",
        config: {
          baseUrl: "https://octopus.example.com",
          adminToken: "",
          userId: "admin",
        },
      },
    ])
  })

  it("preserves existing behavior for New API selection", () => {
    const prefs = {
      ...DEFAULT_PREFERENCES,
      managedSiteType: NEW_API,
    } satisfies UserPreferences
    expect(getManagedSiteMessagesKeyFromSiteType(NEW_API)).toBe("newapi")
    expect(getManagedSiteContext(prefs).siteType).toBe(NEW_API)
  })
})
