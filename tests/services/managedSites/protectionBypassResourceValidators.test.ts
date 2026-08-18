import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { validateNewApiSessionReadResource } from "~/services/managedSites/providers/newApiProtectionBypassResource"
import { validateOctopusApiFetchResource } from "~/services/managedSites/providers/octopusProtectionBypassResource"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_EXECUTION_KINDS,
  PROTECTION_BYPASS_FEATURES,
  PROTECTION_BYPASS_SURFACES,
  PROTECTION_BYPASS_USER_COMMANDS,
  TEMP_CONTEXT_TASK_KINDS,
} from "~/services/protectionBypass/contracts"

const mocks = vi.hoisted(() => ({
  getPreferencesStrict: vi.fn(),
  resolveForType: vi.fn(),
  resolveCurrent: vi.fn(),
  searchChannel: vi.fn(),
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: {
    getPreferencesStrict: mocks.getPreferencesStrict,
  },
}))

vi.mock("~/services/managedSites/runtimeConfig", () => ({
  resolveManagedSiteRuntimeConfigForType: mocks.resolveForType,
  resolveCurrentManagedSiteRuntimeConfig: mocks.resolveCurrent,
}))

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteServiceForType: vi.fn(() => ({
    searchChannel: mocks.searchChannel,
  })),
}))

const userCommandExecution = {
  version: 2,
  kind: PROTECTION_BYPASS_EXECUTION_KINDS.UserCommand,
  command: PROTECTION_BYPASS_USER_COMMANDS.ManageSiteChannels,
  feature: PROTECTION_BYPASS_FEATURES.ManagedSiteChannels,
  surface: PROTECTION_BYPASS_SURFACES.Options,
} as const

const automaticExecution = {
  version: 2,
  kind: PROTECTION_BYPASS_EXECUTION_KINDS.Automatic,
  feature: PROTECTION_BYPASS_FEATURES.ManagedSiteChannels,
  trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
  surface: PROTECTION_BYPASS_SURFACES.Background,
} as const

const octopusTask = (resourceBinding?: "configuration_test") =>
  ({
    kind: TEMP_CONTEXT_TASK_KINDS.OctopusApiFetch,
    params: {
      originUrl: "https://octopus.example.invalid",
      resourceUsername: "example-admin",
      fetchUrl: "https://octopus.example.invalid/api/v1/channel/list",
      fetchOptions: { method: "GET" },
      ...(resourceBinding ? { resourceBinding } : {}),
    },
  }) as const

describe("protection-bypass managed-site resource validators", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getPreferencesStrict.mockResolvedValue({})
  })

  it("checks the current New API origin, user, and channel", async () => {
    mocks.resolveForType.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      config: {
        baseUrl: "https://new-api.example.invalid/path",
        userId: "example-user",
      },
    })
    mocks.searchChannel.mockResolvedValue({
      items: [{ id: 12 }],
      total: 1,
    })

    await expect(
      validateNewApiSessionReadResource({
        origin: "https://new-api.example.invalid",
        userId: "example-user",
        channelId: 12,
      }),
    ).resolves.toBe(true)

    expect(mocks.resolveForType).toHaveBeenCalledWith(
      expect.anything(),
      SITE_TYPES.NEW_API,
    )
    expect(mocks.searchChannel).toHaveBeenCalledWith(expect.anything(), "12")
  })

  it("fails closed when the New API resource does not match or cannot be read", async () => {
    mocks.resolveForType.mockReturnValue({
      siteType: SITE_TYPES.NEW_API,
      config: {
        baseUrl: "https://other.example.invalid",
        userId: "example-user",
      },
    })

    await expect(
      validateNewApiSessionReadResource({
        origin: "https://new-api.example.invalid",
        userId: "example-user",
        channelId: 12,
      }),
    ).resolves.toBe(false)
    expect(mocks.searchChannel).not.toHaveBeenCalled()

    mocks.resolveForType.mockImplementationOnce(() => {
      throw new Error("storage unavailable")
    })
    await expect(
      validateNewApiSessionReadResource({
        origin: "https://new-api.example.invalid",
        userId: "example-user",
        channelId: 12,
      }),
    ).resolves.toBe(false)
  })

  it("allows only an explicit managed-site command to validate a draft Octopus config", async () => {
    await expect(
      validateOctopusApiFetchResource(
        octopusTask("configuration_test"),
        userCommandExecution,
      ),
    ).resolves.toBe(true)
    expect(mocks.getPreferencesStrict).not.toHaveBeenCalled()

    mocks.resolveCurrent.mockReturnValue(null)
    await expect(
      validateOctopusApiFetchResource(octopusTask("configuration_test"), {
        ...userCommandExecution,
        command: PROTECTION_BYPASS_USER_COMMANDS.RefreshAccount,
        feature: PROTECTION_BYPASS_FEATURES.AccountRefresh,
      }),
    ).resolves.toBe(false)
    await expect(
      validateOctopusApiFetchResource(
        octopusTask("configuration_test"),
        automaticExecution,
      ),
    ).resolves.toBe(false)
    expect(mocks.getPreferencesStrict).toHaveBeenCalledTimes(2)
  })

  it("checks the selected Octopus origin and username and fails closed", async () => {
    mocks.resolveCurrent.mockReturnValue({
      siteType: SITE_TYPES.OCTOPUS,
      config: {
        baseUrl: "https://octopus.example.invalid/admin",
        username: " example-admin ",
      },
    })

    await expect(
      validateOctopusApiFetchResource(octopusTask(), automaticExecution),
    ).resolves.toBe(true)

    mocks.resolveCurrent.mockReturnValueOnce({
      siteType: SITE_TYPES.OCTOPUS,
      config: {
        baseUrl: "https://other.example.invalid",
        username: "example-admin",
      },
    })
    await expect(
      validateOctopusApiFetchResource(octopusTask(), automaticExecution),
    ).resolves.toBe(false)

    mocks.resolveCurrent.mockReturnValueOnce({
      siteType: SITE_TYPES.OCTOPUS,
      config: {
        baseUrl: "https://octopus.example.invalid",
        username: "different-admin",
      },
    })
    await expect(
      validateOctopusApiFetchResource(octopusTask(), automaticExecution),
    ).resolves.toBe(false)

    mocks.getPreferencesStrict.mockRejectedValueOnce(
      new Error("storage unavailable"),
    )
    await expect(
      validateOctopusApiFetchResource(octopusTask(), automaticExecution),
    ).resolves.toBe(false)
  })
})
