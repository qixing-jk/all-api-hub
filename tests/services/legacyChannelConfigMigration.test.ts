import { beforeEach, describe, expect, it, vi } from "vitest"

const storageData = new Map<string, unknown>()

const {
  hasLegacyNumericConfigsMock,
  migrateLegacyNumericConfigsMock,
  getPreferencesStrictMock,
  hasRuntimeConfigInputMock,
  resolveRuntimeConfigMock,
  getManagedSiteServiceForTypeMock,
} = vi.hoisted(() => ({
  hasLegacyNumericConfigsMock: vi.fn(),
  migrateLegacyNumericConfigsMock: vi.fn(),
  getPreferencesStrictMock: vi.fn(),
  hasRuntimeConfigInputMock: vi.fn(),
  resolveRuntimeConfigMock: vi.fn(),
  getManagedSiteServiceForTypeMock: vi.fn(),
}))

vi.mock("@plasmohq/storage", () => {
  class Storage {
    async get(key: string) {
      return storageData.get(key)
    }

    async set(key: string, value: unknown) {
      storageData.set(key, value)
    }

    async remove(key: string) {
      storageData.delete(key)
    }
  }

  return { Storage }
})

vi.mock("~/services/managedSites/channelConfigStorage", () => ({
  channelConfigStorage: {
    hasLegacyNumericConfigs: hasLegacyNumericConfigsMock,
    migrateLegacyNumericConfigs: migrateLegacyNumericConfigsMock,
  },
}))

vi.mock("~/services/preferences/userPreferences", () => ({
  userPreferences: { getPreferencesStrict: getPreferencesStrictMock },
}))

vi.mock("~/services/managedSites/runtimeConfig", () => ({
  hasManagedSiteRuntimeConfigInputForType: hasRuntimeConfigInputMock,
  resolveManagedSiteRuntimeConfigForType: resolveRuntimeConfigMock,
}))

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteServiceForType: getManagedSiteServiceForTypeMock,
}))

const loadMigration = async () => {
  vi.resetModules()
  return await import("~/services/managedSites/legacyChannelConfigMigration")
}

describe("legacyChannelConfigMigration", () => {
  beforeEach(() => {
    storageData.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-28T05:30:00.000Z"))
    getPreferencesStrictMock.mockResolvedValue({})
    hasRuntimeConfigInputMock.mockReturnValue(false)
    migrateLegacyNumericConfigsMock.mockResolvedValue({
      migrated: 0,
      ambiguous: 0,
      unmatched: 0,
    })
  })

  it("does not load preferences or access the network without legacy data", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(false)
    const { legacyChannelConfigMigration } = await loadMigration()

    await expect(legacyChannelConfigMigration.initialize()).resolves.toEqual({
      status: "not-needed",
    })
    expect(getPreferencesStrictMock).not.toHaveBeenCalled()
    expect(getManagedSiteServiceForTypeMock).not.toHaveBeenCalled()
  })

  it("discovers all configured sites and migrates only after every list succeeds", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    resolveRuntimeConfigMock.mockImplementation((_preferences, siteType) => {
      if (siteType === "new-api" || siteType === "done-hub") {
        return {
          siteType,
          config: { baseUrl: `https://${siteType}.example.invalid` },
        }
      }
      return null
    })
    getManagedSiteServiceForTypeMock.mockImplementation((siteType) => ({
      listChannels: vi.fn().mockResolvedValue({
        items:
          siteType === "new-api"
            ? [{ id: 9, name: "Target" }]
            : [{ id: 10, name: "Other" }],
        total: 1,
        type_counts: {},
      }),
    }))
    migrateLegacyNumericConfigsMock.mockResolvedValue({
      migrated: 1,
      ambiguous: 0,
      unmatched: 0,
    })
    const { legacyChannelConfigMigration } = await loadMigration()

    await expect(legacyChannelConfigMigration.initialize()).resolves.toEqual({
      status: "completed",
      migrated: 1,
      ambiguous: 0,
      unmatched: 0,
    })
    expect(getManagedSiteServiceForTypeMock).toHaveBeenCalledTimes(2)
    for (const service of getManagedSiteServiceForTypeMock.mock.results) {
      expect(service.value.listChannels).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ requireCompleteInventory: true }),
      )
    }
    expect(migrateLegacyNumericConfigsMock).toHaveBeenCalledWith([
      {
        channelId: 9,
        resourceRef: {
          managedSiteType: "new-api",
          scopeKey: "https://new-api.example.invalid",
          resourceId: "9",
        },
      },
      {
        channelId: 10,
        resourceRef: {
          managedSiteType: "done-hub",
          scopeKey: "https://done-hub.example.invalid",
          resourceId: "10",
        },
      },
    ])
  })

  it("preserves legacy data when any configured site cannot be enumerated", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    resolveRuntimeConfigMock.mockImplementation((_preferences, siteType) => {
      if (siteType === "new-api" || siteType === "done-hub") {
        return {
          siteType,
          config: { baseUrl: `https://${siteType}.example.invalid` },
        }
      }
      return null
    })
    getManagedSiteServiceForTypeMock.mockImplementation((siteType) => ({
      listChannels:
        siteType === "new-api"
          ? vi.fn().mockResolvedValue({
              items: [{ id: 9, name: "Target" }],
              total: 1,
              type_counts: {},
            })
          : vi.fn().mockRejectedValue(new Error("site unavailable")),
    }))
    const { legacyChannelConfigMigration } = await loadMigration()

    await expect(legacyChannelConfigMigration.initialize()).resolves.toEqual({
      status: "deferred",
      reason: "inventory-failed",
    })
    expect(migrateLegacyNumericConfigsMock).not.toHaveBeenCalled()
    expect(hasLegacyNumericConfigsMock).toHaveBeenCalledTimes(1)
  })

  it("persists a retry backoff across extension-context restarts", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    resolveRuntimeConfigMock.mockImplementation((_preferences, siteType) =>
      siteType === "new-api"
        ? {
            siteType,
            config: { baseUrl: "https://new-api.example.invalid" },
          }
        : null,
    )
    const listChannels = vi.fn().mockRejectedValue(new Error("offline"))
    getManagedSiteServiceForTypeMock.mockReturnValue({ listChannels })
    const firstModule = await loadMigration()

    await expect(
      firstModule.legacyChannelConfigMigration.initialize(),
    ).resolves.toEqual({
      status: "deferred",
      reason: "inventory-failed",
    })
    expect(listChannels).toHaveBeenCalledTimes(1)

    getManagedSiteServiceForTypeMock.mockClear()
    const secondModule = await loadMigration()
    await expect(
      secondModule.legacyChannelConfigMigration.initialize(),
    ).resolves.toEqual({
      status: "deferred",
      reason: "backoff-active",
    })
    expect(getManagedSiteServiceForTypeMock).not.toHaveBeenCalled()

    await expect(
      secondModule.ensureLegacyChannelConfigMigrationReady({
        bypassBackoff: true,
      }),
    ).rejects.toThrow(
      "Legacy channel config migration deferred: inventory-failed",
    )
    expect(getManagedSiteServiceForTypeMock).toHaveBeenCalledTimes(1)
  })

  it("fails closed when preferences cannot be read", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    getPreferencesStrictMock.mockRejectedValue(new Error("storage unavailable"))
    const { legacyChannelConfigMigration } = await loadMigration()

    await expect(legacyChannelConfigMigration.initialize()).resolves.toEqual({
      status: "deferred",
      reason: "storage-failed",
    })
    expect(getManagedSiteServiceForTypeMock).not.toHaveBeenCalled()
    expect(migrateLegacyNumericConfigsMock).not.toHaveBeenCalled()
  })

  it("does not ignore a partially configured managed site", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    getPreferencesStrictMock.mockResolvedValue({
      newApi: {
        baseUrl: "https://new-api.example.invalid",
        adminToken: "",
        userId: "",
      },
    })
    resolveRuntimeConfigMock.mockReturnValue(null)
    hasRuntimeConfigInputMock.mockImplementation(
      (_preferences, siteType) => siteType === "new-api",
    )
    const { legacyChannelConfigMigration } = await loadMigration()

    await expect(legacyChannelConfigMigration.initialize()).resolves.toEqual({
      status: "deferred",
      reason: "inventory-failed",
    })
    expect(getManagedSiteServiceForTypeMock).not.toHaveBeenCalled()
    expect(migrateLegacyNumericConfigsMock).not.toHaveBeenCalled()
  })

  it("restarts discovery when deployment identities change during inventory", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    getPreferencesStrictMock
      .mockResolvedValueOnce({ phase: "initial" })
      .mockResolvedValueOnce({ phase: "changed" })
    resolveRuntimeConfigMock.mockImplementation((preferences, siteType) =>
      siteType === "new-api"
        ? {
            siteType,
            config: {
              baseUrl: `https://${preferences.phase}.example.invalid`,
            },
          }
        : null,
    )
    getManagedSiteServiceForTypeMock.mockReturnValue({
      listChannels: vi.fn().mockResolvedValue({
        items: [{ id: 9, name: "Target" }],
        total: 1,
        type_counts: {},
      }),
    })
    const { legacyChannelConfigMigration } = await loadMigration()

    await expect(legacyChannelConfigMigration.initialize()).resolves.toEqual({
      status: "deferred",
      reason: "inventory-failed",
    })
    expect(migrateLegacyNumericConfigsMock).not.toHaveBeenCalled()
  })

  it("preserves legacy data when a provider reports a partial inventory", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    resolveRuntimeConfigMock.mockImplementation((_preferences, siteType) =>
      siteType === "new-api"
        ? {
            siteType,
            config: { baseUrl: "https://new-api.example.invalid" },
          }
        : null,
    )
    getManagedSiteServiceForTypeMock.mockReturnValue({
      listChannels: vi.fn().mockResolvedValue({
        items: [{ id: 9, name: "Partial" }],
        total: 2,
        type_counts: {},
      }),
    })
    const { legacyChannelConfigMigration } = await loadMigration()

    await expect(legacyChannelConfigMigration.initialize()).resolves.toEqual({
      status: "deferred",
      reason: "inventory-failed",
    })
    expect(migrateLegacyNumericConfigsMock).not.toHaveBeenCalled()
  })

  it("does not treat any AxonHub numeric projection as stable legacy evidence", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    resolveRuntimeConfigMock.mockImplementation((_preferences, siteType) =>
      siteType === "axonhub"
        ? {
            siteType,
            config: {
              baseUrl: "https://axon.example.invalid",
              email: "admin@example.invalid",
              password: "secret",
            },
          }
        : null,
    )
    getManagedSiteServiceForTypeMock.mockReturnValue({
      listChannels: vi.fn().mockResolvedValue({
        items: [
          {
            id: 123456,
            name: "Numeric native id",
            _axonHubData: { id: 123456 },
          },
        ],
        total: 1,
        type_counts: {},
      }),
    })
    migrateLegacyNumericConfigsMock.mockResolvedValue({
      migrated: 0,
      ambiguous: 0,
      unmatched: 1,
    })
    const { legacyChannelConfigMigration } = await loadMigration()

    await expect(legacyChannelConfigMigration.initialize()).resolves.toEqual({
      status: "deferred",
      reason: "unresolved-identities",
    })
    expect(migrateLegacyNumericConfigsMock).toHaveBeenCalledWith([])
  })

  it("defers without deleting data when no configured site can be queried", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    resolveRuntimeConfigMock.mockReturnValue(null)
    const { legacyChannelConfigMigration } = await loadMigration()

    await expect(legacyChannelConfigMigration.initialize()).resolves.toEqual({
      status: "deferred",
      reason: "no-configured-sites",
    })
    expect(getManagedSiteServiceForTypeMock).not.toHaveBeenCalled()
    expect(migrateLegacyNumericConfigsMock).not.toHaveBeenCalled()
  })

  it("blocks scoped-only consumers while migration is deferred", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    resolveRuntimeConfigMock.mockReturnValue(null)
    const { ensureLegacyChannelConfigMigrationReady } = await loadMigration()

    await expect(ensureLegacyChannelConfigMigrationReady()).rejects.toThrow(
      "Legacy channel config migration deferred: no-configured-sites",
    )
  })

  it("deduplicates concurrent initialization through one shared promise", async () => {
    let resolveLegacyCheck: ((value: boolean) => void) | undefined
    hasLegacyNumericConfigsMock.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveLegacyCheck = resolve
        }),
    )
    const { legacyChannelConfigMigration } = await loadMigration()

    const first = legacyChannelConfigMigration.initialize()
    const second = legacyChannelConfigMigration.initialize()
    await Promise.resolve()
    await Promise.resolve()
    resolveLegacyCheck?.(false)

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "not-needed" },
      { status: "not-needed" },
    ])
    expect(hasLegacyNumericConfigsMock).toHaveBeenCalledTimes(1)
  })
})
