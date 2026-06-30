import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { SITE_TYPES } from "~/constants/siteType"
import { USER_PREFERENCES_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { DEFAULT_AXON_HUB_CONFIG } from "~/types/axonHubConfig"
import { DEFAULT_CLAUDE_CODE_HUB_CONFIG } from "~/types/claudeCodeHubConfig"
import { DEFAULT_DONE_HUB_CONFIG } from "~/types/doneHubConfig"
import { DEFAULT_OCTOPUS_CONFIG } from "~/types/octopusConfig"

const expectSuccessfulWrite = async (write: Promise<{ ok: boolean }>) => {
  await expect(write).resolves.toMatchObject({ ok: true })
}

describe("userPreferences managed-site helpers", () => {
  const storage = new Storage({ area: "local" })

  beforeEach(async () => {
    vi.useFakeTimers()
    await storage.remove(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await storage.remove(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES)
  })

  it("selects and persists the config for each managed-site type", async () => {
    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      structuredClone(DEFAULT_PREFERENCES),
    )

    await expectSuccessfulWrite(
      userPreferences.updateManagedSiteType(SITE_TYPES.VELOERA),
    )
    await expectSuccessfulWrite(
      userPreferences.updateVeloeraConfig({
        baseUrl: "https://veloera.example.com",
      }),
    )

    let managedSite = await userPreferences.getManagedSiteConfig()
    expect(managedSite.siteType).toBe(SITE_TYPES.VELOERA)
    expect(managedSite.config).toEqual(
      expect.objectContaining({
        baseUrl: "https://veloera.example.com",
      }),
    )

    await expectSuccessfulWrite(
      userPreferences.updateManagedSiteType(SITE_TYPES.DONE_HUB),
    )
    await expectSuccessfulWrite(
      userPreferences.updateDoneHubConfig({
        baseUrl: "https://done.example.com",
        adminToken: "done-token",
        userId: "done-user",
      }),
    )

    managedSite = await userPreferences.getManagedSiteConfig()
    expect(managedSite.siteType).toBe(SITE_TYPES.DONE_HUB)
    expect(managedSite.config).toEqual({
      ...DEFAULT_PREFERENCES.doneHub,
      baseUrl: "https://done.example.com",
      adminToken: "done-token",
      userId: "done-user",
    })

    await expectSuccessfulWrite(
      userPreferences.updateManagedSiteType(SITE_TYPES.OCTOPUS),
    )
    await expectSuccessfulWrite(
      userPreferences.updateOctopusConfig({
        baseUrl: "https://octopus.example.com",
        username: "octopus-user",
        password: "octopus-pass",
      }),
    )

    managedSite = await userPreferences.getManagedSiteConfig()
    expect(managedSite.siteType).toBe(SITE_TYPES.OCTOPUS)
    expect(managedSite.config).toEqual({
      ...DEFAULT_PREFERENCES.octopus,
      baseUrl: "https://octopus.example.com",
      username: "octopus-user",
      password: "octopus-pass",
    })

    await expectSuccessfulWrite(
      userPreferences.updateManagedSiteType(SITE_TYPES.AXON_HUB),
    )
    await expectSuccessfulWrite(
      userPreferences.updateAxonHubConfig({
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "secret",
      }),
    )

    managedSite = await userPreferences.getManagedSiteConfig()
    expect(managedSite.siteType).toBe(SITE_TYPES.AXON_HUB)
    expect(managedSite.config).toEqual({
      ...DEFAULT_PREFERENCES.axonHub,
      baseUrl: "https://axonhub.example.com",
      email: "admin@example.com",
      password: "secret",
    })

    await expectSuccessfulWrite(
      userPreferences.updateManagedSiteType(SITE_TYPES.CLAUDE_CODE_HUB),
    )
    await expectSuccessfulWrite(
      userPreferences.updateClaudeCodeHubConfig({
        baseUrl: "https://cch.example.com",
        adminToken: "admin-token",
      }),
    )

    managedSite = await userPreferences.getManagedSiteConfig()
    expect(managedSite.siteType).toBe(SITE_TYPES.CLAUDE_CODE_HUB)
    expect(managedSite.config).toEqual({
      ...DEFAULT_PREFERENCES.claudeCodeHub,
      baseUrl: "https://cch.example.com",
      adminToken: "admin-token",
    })
  })

  it("falls back to default configs when optional managed-site settings are missing", async () => {
    const missingManagedSiteType: any = {
      ...structuredClone(DEFAULT_PREFERENCES),
    }
    delete missingManagedSiteType.managedSiteType

    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      missingManagedSiteType,
    )

    let managedSite = await userPreferences.getManagedSiteConfig()
    expect(managedSite.siteType).toBe(SITE_TYPES.NEW_API)
    expect(managedSite.config).toEqual(DEFAULT_PREFERENCES.newApi)

    const missingDoneHub: any = {
      ...structuredClone(DEFAULT_PREFERENCES),
      managedSiteType: SITE_TYPES.DONE_HUB,
    }
    delete missingDoneHub.doneHub

    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      missingDoneHub,
    )

    managedSite = await userPreferences.getManagedSiteConfig()
    expect(managedSite.siteType).toBe(SITE_TYPES.DONE_HUB)
    expect(managedSite.config).toEqual(DEFAULT_DONE_HUB_CONFIG)

    const missingOctopus: any = {
      ...structuredClone(DEFAULT_PREFERENCES),
      managedSiteType: SITE_TYPES.OCTOPUS,
    }
    delete missingOctopus.octopus

    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      missingOctopus,
    )

    managedSite = await userPreferences.getManagedSiteConfig()
    expect(managedSite.siteType).toBe(SITE_TYPES.OCTOPUS)
    expect(managedSite.config).toEqual(DEFAULT_OCTOPUS_CONFIG)

    const missingAxonHub: any = {
      ...structuredClone(DEFAULT_PREFERENCES),
      managedSiteType: SITE_TYPES.AXON_HUB,
    }
    delete missingAxonHub.axonHub

    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      missingAxonHub,
    )

    managedSite = await userPreferences.getManagedSiteConfig()
    expect(managedSite.siteType).toBe(SITE_TYPES.AXON_HUB)
    expect(managedSite.config).toEqual(DEFAULT_AXON_HUB_CONFIG)

    const missingClaudeCodeHub: any = {
      ...structuredClone(DEFAULT_PREFERENCES),
      managedSiteType: SITE_TYPES.CLAUDE_CODE_HUB,
    }
    delete missingClaudeCodeHub.claudeCodeHub

    await storage.set(
      USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES,
      missingClaudeCodeHub,
    )

    managedSite = await userPreferences.getManagedSiteConfig()
    expect(managedSite.siteType).toBe(SITE_TYPES.CLAUDE_CODE_HUB)
    expect(managedSite.config).toEqual(DEFAULT_CLAUDE_CODE_HUB_CONFIG)
  })

  it("restores managed-site configs to their defaults with dedicated reset helpers", async () => {
    await storage.set(USER_PREFERENCES_STORAGE_KEYS.USER_PREFERENCES, {
      ...structuredClone(DEFAULT_PREFERENCES),
      managedSiteType: SITE_TYPES.OCTOPUS,
      veloera: {
        ...DEFAULT_PREFERENCES.veloera,
        baseUrl: "https://veloera.example.com",
      },
      doneHub: {
        ...DEFAULT_PREFERENCES.doneHub,
        baseUrl: "https://done.example.com",
        adminToken: "done-token",
        userId: "done-user",
      },
      octopus: {
        ...DEFAULT_PREFERENCES.octopus,
        baseUrl: "https://octopus.example.com",
        username: "octopus-user",
        password: "octopus-pass",
      },
      axonHub: {
        ...DEFAULT_PREFERENCES.axonHub,
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "secret",
      },
      claudeCodeHub: {
        ...DEFAULT_PREFERENCES.claudeCodeHub,
        baseUrl: "https://cch.example.com",
        adminToken: "admin-token",
      },
    })

    await expectSuccessfulWrite(userPreferences.resetVeloeraConfig())
    await expectSuccessfulWrite(userPreferences.resetDoneHubConfig())
    await expectSuccessfulWrite(userPreferences.resetOctopusConfig())
    await expectSuccessfulWrite(userPreferences.resetAxonHubConfig())
    await expectSuccessfulWrite(userPreferences.resetClaudeCodeHubConfig())

    const preferences = await userPreferences.getPreferences()
    expect(preferences.veloera).toEqual(DEFAULT_PREFERENCES.veloera)
    expect(preferences.doneHub).toEqual(DEFAULT_PREFERENCES.doneHub)
    expect(preferences.octopus).toEqual(DEFAULT_PREFERENCES.octopus)
    expect(preferences.axonHub).toEqual(DEFAULT_PREFERENCES.axonHub)
    expect(preferences.claudeCodeHub).toEqual(DEFAULT_PREFERENCES.claudeCodeHub)
  })
})
