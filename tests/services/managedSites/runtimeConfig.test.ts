import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import {
  getCurrentManagedSiteRuntimeConfig,
  getManagedSiteLegacyAdminConfig,
  getManagedSiteRuntimeConfigForType,
  resolveCurrentManagedSiteRuntimeConfig,
  resolveManagedSiteRuntimeConfigForType,
} from "~/services/managedSites/runtimeConfig"
import { buildUserPreferences } from "~~/tests/test-utils/factories"

const mockGetPreferences = vi.hoisted(() => vi.fn())

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()

  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      getPreferences: mockGetPreferences,
    },
  }
})

describe("managed-site runtime config resolver", () => {
  beforeEach(() => {
    mockGetPreferences.mockReset()
  })

  it("resolves full runtime configs for every managed-site type", () => {
    const prefs = buildUserPreferences({
      newApi: {
        baseUrl: "https://new-api.example.com",
        adminToken: "new-token",
        userId: "1",
      },
      doneHub: {
        baseUrl: "https://donehub.example.com",
        adminToken: "done-token",
        userId: "2",
      },
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "3",
      },
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "octo-admin",
        password: "octo-password",
      },
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "axon-password",
      },
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "cch-token",
      },
    })

    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.NEW_API),
    ).toEqual({
      siteType: SITE_TYPES.NEW_API,
      config: prefs.newApi,
    })
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.DONE_HUB),
    ).toEqual({
      siteType: SITE_TYPES.DONE_HUB,
      config: prefs.doneHub,
    })
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.VELOERA),
    ).toEqual({
      siteType: SITE_TYPES.VELOERA,
      config: prefs.veloera,
    })
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.OCTOPUS),
    ).toEqual({
      siteType: SITE_TYPES.OCTOPUS,
      config: prefs.octopus,
    })
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.AXON_HUB),
    ).toEqual({
      siteType: SITE_TYPES.AXON_HUB,
      config: prefs.axonHub,
    })
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.CLAUDE_CODE_HUB),
    ).toEqual({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      config: prefs.claudeCodeHub,
    })
  })

  it("returns null for incomplete configs", () => {
    const prefs = buildUserPreferences({
      newApi: {
        baseUrl: "   ",
        adminToken: "new-token",
        userId: "1",
      },
      doneHub: {
        baseUrl: "https://donehub.example.com",
        adminToken: "",
        userId: "2",
      },
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "",
      },
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "",
        password: "octo-password",
      },
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "",
      },
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "",
      },
    })

    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.NEW_API),
    ).toBeNull()
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.DONE_HUB),
    ).toBeNull()
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.VELOERA),
    ).toBeNull()
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.OCTOPUS),
    ).toBeNull()
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.AXON_HUB),
    ).toBeNull()
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.CLAUDE_CODE_HUB),
    ).toBeNull()
  })

  it("returns unknown managed-site values from the exhaustive fallback", () => {
    const prefs = buildUserPreferences()

    expect(
      resolveManagedSiteRuntimeConfigForType(
        prefs,
        "future-managed-site" as any,
      ),
    ).toBe("future-managed-site")
  })

  it("returns null for non-numeric access-token managed-site user IDs", () => {
    const prefs = buildUserPreferences({
      newApi: {
        baseUrl: "https://new-api.example.com",
        adminToken: "new-token",
        userId: "admin",
      },
      doneHub: {
        baseUrl: "https://donehub.example.com",
        adminToken: "done-token",
        userId: "2a",
      },
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: " root ",
      },
    })

    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.NEW_API),
    ).toBeNull()
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.DONE_HUB),
    ).toBeNull()
    expect(
      resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.VELOERA),
    ).toBeNull()
  })

  it("resolves the current runtime config and falls back to New API when unset", () => {
    const prefs = buildUserPreferences({
      managedSiteType: undefined,
      newApi: {
        baseUrl: "https://new-api.example.com",
        adminToken: "new-token",
        userId: "1",
      },
    })

    expect(resolveCurrentManagedSiteRuntimeConfig(prefs)).toEqual({
      siteType: SITE_TYPES.NEW_API,
      config: prefs.newApi,
    })
  })

  it("loads preferences and resolves the current runtime config", async () => {
    const prefs = buildUserPreferences({
      managedSiteType: SITE_TYPES.VELOERA,
      veloera: {
        baseUrl: "https://veloera.example.com",
        adminToken: "veloera-token",
        userId: "3",
      },
    })
    mockGetPreferences.mockResolvedValueOnce(prefs)

    await expect(getCurrentManagedSiteRuntimeConfig()).resolves.toEqual({
      siteType: SITE_TYPES.VELOERA,
      config: prefs.veloera,
    })
    expect(mockGetPreferences).toHaveBeenCalledTimes(1)
  })

  it("returns null when loading current preferences rejects", async () => {
    mockGetPreferences.mockRejectedValueOnce(new Error("storage unavailable"))

    await expect(getCurrentManagedSiteRuntimeConfig()).resolves.toBeNull()
    expect(mockGetPreferences).toHaveBeenCalledTimes(1)
  })

  it("loads preferences and resolves an explicit runtime config", async () => {
    const prefs = buildUserPreferences({
      managedSiteType: SITE_TYPES.NEW_API,
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "cch-token",
      },
    })
    mockGetPreferences.mockResolvedValueOnce(prefs)

    await expect(
      getManagedSiteRuntimeConfigForType(SITE_TYPES.CLAUDE_CODE_HUB),
    ).resolves.toEqual({
      siteType: SITE_TYPES.CLAUDE_CODE_HUB,
      config: prefs.claudeCodeHub,
    })
    expect(mockGetPreferences).toHaveBeenCalledTimes(1)
  })

  it("returns null when loading preferences for an explicit config rejects", async () => {
    mockGetPreferences.mockRejectedValueOnce(new Error("storage unavailable"))

    await expect(
      getManagedSiteRuntimeConfigForType(SITE_TYPES.DONE_HUB),
    ).resolves.toBeNull()
    expect(mockGetPreferences).toHaveBeenCalledTimes(1)
  })

  it("converts full runtime configs to the legacy admin shape for compatibility consumers", () => {
    const prefs = buildUserPreferences({
      newApi: {
        baseUrl: "https://new-api.example.com",
        adminToken: "new-token",
        userId: "1",
      },
      octopus: {
        baseUrl: "https://octopus.example.com",
        username: "octo-admin",
        password: "octo-password",
      },
      axonHub: {
        baseUrl: "https://axonhub.example.com",
        email: "admin@example.com",
        password: "axon-password",
      },
      claudeCodeHub: {
        baseUrl: "https://cch.example.com",
        adminToken: "cch-token",
      },
    })

    expect(
      getManagedSiteLegacyAdminConfig(
        resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.NEW_API)!,
      ),
    ).toEqual({
      baseUrl: "https://new-api.example.com",
      adminToken: "new-token",
      userId: "1",
    })
    expect(
      getManagedSiteLegacyAdminConfig(
        resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.OCTOPUS)!,
      ),
    ).toEqual({
      baseUrl: "https://octopus.example.com",
      adminToken: "",
      userId: "octo-admin",
    })
    expect(
      getManagedSiteLegacyAdminConfig(
        resolveManagedSiteRuntimeConfigForType(prefs, SITE_TYPES.AXON_HUB)!,
      ),
    ).toEqual({
      baseUrl: "https://axonhub.example.com",
      adminToken: "axon-password",
      userId: "admin@example.com",
    })
    expect(
      getManagedSiteLegacyAdminConfig(
        resolveManagedSiteRuntimeConfigForType(
          prefs,
          SITE_TYPES.CLAUDE_CODE_HUB,
        )!,
      ),
    ).toEqual({
      baseUrl: "https://cch.example.com",
      adminToken: "cch-token",
      userId: "admin",
    })
  })
})
