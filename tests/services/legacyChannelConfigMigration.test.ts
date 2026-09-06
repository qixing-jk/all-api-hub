import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { CHANNEL_CONFIG_STORAGE_KEYS } from "~/services/core/storageKeys"

const storageData = new Map<string, unknown>()

const {
  hasLegacyNumericConfigsMock,
  migrateLegacyNumericConfigsMock,
  getPreferencesStrictMock,
  hasRuntimeConfigInputMock,
  resolveRuntimeConfigMock,
  getManagedResourceRegistrationMock,
} = vi.hoisted(() => ({
  hasLegacyNumericConfigsMock: vi.fn(),
  migrateLegacyNumericConfigsMock: vi.fn(),
  getPreferencesStrictMock: vi.fn(),
  hasRuntimeConfigInputMock: vi.fn(),
  resolveRuntimeConfigMock: vi.fn(),
  getManagedResourceRegistrationMock: vi.fn(),
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

vi.mock("~/services/apiAdapters/managedResources/registry", () => ({
  getManagedResourceRegistration: getManagedResourceRegistrationMock,
}))

const nativeFact = (
  id: number | string,
  siteType = "new-api",
  scopeKey = `https://${siteType}.example.invalid`,
) => ({ ref: { siteType, kind: "channel", scopeKey, resourceId: String(id) } })
const registration = (list: ReturnType<typeof vi.fn>) => ({
  kind: "channel",
  open: vi.fn(async () => ({ list })),
})

const loadMigration = async () => {
  vi.resetModules()
  return await import("~/services/managedSites/legacyChannelConfigMigration")
}

describe("legacyChannelConfigMigration", () => {
  beforeEach(() => {
    storageData.clear()
    vi.restoreAllMocks()
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
    expect(getManagedResourceRegistrationMock).not.toHaveBeenCalled()
  })

  it("ignores malformed retry state instead of treating it as active backoff", async () => {
    storageData.set(CHANNEL_CONFIG_STORAGE_KEYS.LEGACY_MIGRATION_STATE, {
      attempt: 0,
      retryAfter: "later",
    })
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    const { legacyChannelConfigMigration } = await loadMigration()

    await expect(legacyChannelConfigMigration.initialize()).resolves.toEqual({
      status: "deferred",
      reason: "no-configured-sites",
    })
    expect(
      storageData.get(CHANNEL_CONFIG_STORAGE_KEYS.LEGACY_MIGRATION_STATE),
    ).toEqual(expect.objectContaining({ attempt: 1 }))
  })

  it("preserves the migration outcome when backoff persistence fails", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    vi.spyOn(Storage.prototype, "set").mockRejectedValueOnce(
      new Error("storage unavailable"),
    )
    const { legacyChannelConfigMigration } = await loadMigration()

    await expect(legacyChannelConfigMigration.initialize()).resolves.toEqual({
      status: "deferred",
      reason: "no-configured-sites",
    })
  })

  it("does not turn retry-state cleanup failure into a migration failure", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(false)
    vi.spyOn(Storage.prototype, "remove").mockRejectedValueOnce(
      new Error("storage unavailable"),
    )
    const { legacyChannelConfigMigration } = await loadMigration()

    await expect(legacyChannelConfigMigration.initialize()).resolves.toEqual({
      status: "not-needed",
    })
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
    getManagedResourceRegistrationMock.mockImplementation((siteType) =>
      registration(
        vi.fn().mockResolvedValue({
          items:
            siteType === "new-api"
              ? [nativeFact(9, siteType)]
              : [nativeFact(10, siteType)],
          total: 1,
          type_counts: {},
        }),
      ),
    )
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
    expect(getManagedResourceRegistrationMock).toHaveBeenCalledTimes(2)
    for (const result of getManagedResourceRegistrationMock.mock.results) {
      const workspace = await result.value.open.mock.results[0].value
      expect(workspace.list).toHaveBeenCalledWith(
        { cursor: undefined, limit: 100 },
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
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

  it("follows native cursor pages before migrating numeric identities", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    resolveRuntimeConfigMock.mockImplementation((_preferences, siteType) =>
      siteType === "new-api"
        ? { siteType, config: { baseUrl: "https://new-api.example.invalid" } }
        : null,
    )
    const list = vi
      .fn()
      .mockResolvedValueOnce({
        items: [nativeFact(9)],
        total: 2,
        nextCursor: "page-2",
      })
      .mockResolvedValueOnce({ items: [nativeFact(10)], total: 2 })
    getManagedResourceRegistrationMock.mockReturnValue(registration(list))
    const { legacyChannelConfigMigration } = await loadMigration()
    await expect(
      legacyChannelConfigMigration.initialize(),
    ).resolves.toMatchObject({ status: "completed" })
    expect(list).toHaveBeenLastCalledWith(
      { cursor: "page-2", limit: 100 },
      expect.any(Object),
    )
    expect(migrateLegacyNumericConfigsMock).toHaveBeenCalledWith([
      expect.objectContaining({ channelId: 9 }),
      expect.objectContaining({ channelId: 10 }),
    ])
  })

  it.each(["scope", "duplicate", "cursor"])(
    "preserves old data when native inventory has invalid %s evidence",
    async (mode) => {
      hasLegacyNumericConfigsMock.mockResolvedValue(true)
      resolveRuntimeConfigMock.mockImplementation((_preferences, siteType) =>
        siteType === "new-api"
          ? { siteType, config: { baseUrl: "https://new-api.example.invalid" } }
          : null,
      )
      const page =
        mode === "scope"
          ? { items: [nativeFact(9, "new-api", "https://other.example")] }
          : mode === "duplicate"
            ? { items: [nativeFact(9), nativeFact(9)] }
            : { items: [], nextCursor: "repeated" }
      getManagedResourceRegistrationMock.mockReturnValue(
        registration(vi.fn().mockResolvedValue(page)),
      )
      const { legacyChannelConfigMigration } = await loadMigration()
      await expect(
        legacyChannelConfigMigration.initialize(),
      ).resolves.toMatchObject({
        status: "deferred",
        reason: "inventory-failed",
      })
      expect(migrateLegacyNumericConfigsMock).not.toHaveBeenCalled()
    },
  )

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
    getManagedResourceRegistrationMock.mockImplementation((siteType) =>
      registration(
        siteType === "new-api"
          ? vi.fn().mockResolvedValue({
              items: [nativeFact(9)],
              total: 1,
              type_counts: {},
            })
          : vi.fn().mockRejectedValue(new Error("site unavailable")),
      ),
    )
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
    getManagedResourceRegistrationMock.mockReturnValue(
      registration(listChannels),
    )
    const firstModule = await loadMigration()

    await expect(
      firstModule.legacyChannelConfigMigration.initialize(),
    ).resolves.toEqual({
      status: "deferred",
      reason: "inventory-failed",
    })
    expect(listChannels).toHaveBeenCalledTimes(1)

    getManagedResourceRegistrationMock.mockClear()
    const secondModule = await loadMigration()
    await expect(
      secondModule.legacyChannelConfigMigration.initialize(),
    ).resolves.toEqual({
      status: "deferred",
      reason: "backoff-active",
    })
    expect(getManagedResourceRegistrationMock).not.toHaveBeenCalled()

    await expect(
      secondModule.ensureLegacyChannelConfigMigrationReady({
        bypassBackoff: true,
      }),
    ).rejects.toThrow(
      "Legacy channel config migration deferred: inventory-failed",
    )
    expect(getManagedResourceRegistrationMock).toHaveBeenCalledTimes(1)
  })

  it("fails closed when preferences cannot be read", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    getPreferencesStrictMock.mockRejectedValue(new Error("storage unavailable"))
    const { legacyChannelConfigMigration } = await loadMigration()

    await expect(legacyChannelConfigMigration.initialize()).resolves.toEqual({
      status: "deferred",
      reason: "storage-failed",
    })
    expect(getManagedResourceRegistrationMock).not.toHaveBeenCalled()
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
    expect(getManagedResourceRegistrationMock).not.toHaveBeenCalled()
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
    getManagedResourceRegistrationMock.mockReturnValue(
      registration(
        vi.fn().mockResolvedValue({
          items: [nativeFact(9, "new-api", "https://initial.example.invalid")],
          total: 1,
          type_counts: {},
        }),
      ),
    )
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
    getManagedResourceRegistrationMock.mockReturnValue(
      registration(
        vi.fn().mockResolvedValue({
          items: [nativeFact(9)],
          total: 2,
          type_counts: {},
        }),
      ),
    )
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
    getManagedResourceRegistrationMock.mockReturnValue(
      registration(
        vi.fn().mockResolvedValue({
          items: [
            nativeFact("123456", "axonhub", "https://axon.example.invalid"),
          ],
          total: 1,
          type_counts: {},
        }),
      ),
    )
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
    expect(getManagedResourceRegistrationMock).not.toHaveBeenCalled()
    expect(migrateLegacyNumericConfigsMock).not.toHaveBeenCalled()
  })

  it("blocks scoped-only consumers while migration is deferred", async () => {
    hasLegacyNumericConfigsMock.mockResolvedValue(true)
    resolveRuntimeConfigMock.mockReturnValue(null)
    const {
      ensureLegacyChannelConfigMigrationReady,
      LegacyChannelConfigMigrationDeferredError,
    } = await loadMigration()

    const failure = ensureLegacyChannelConfigMigrationReady()
    await expect(failure).rejects.toBeInstanceOf(
      LegacyChannelConfigMigrationDeferredError,
    )
    await expect(failure).rejects.toMatchObject({
      reason: "no-configured-sites",
    })
  })

  it("honors an explicit bypass caller after it joins a backoff-blocked run", async () => {
    storageData.set(CHANNEL_CONFIG_STORAGE_KEYS.LEGACY_MIGRATION_STATE, {
      attempt: 1,
      retryAfter: Date.now() + 60_000,
    })
    let resolveFirstLegacyCheck: ((value: boolean) => void) | undefined
    hasLegacyNumericConfigsMock
      .mockImplementationOnce(
        () =>
          new Promise<boolean>((resolve) => {
            resolveFirstLegacyCheck = resolve
          }),
      )
      .mockResolvedValueOnce(true)
    resolveRuntimeConfigMock.mockImplementation((_preferences, siteType) =>
      siteType === "new-api"
        ? {
            siteType,
            config: { baseUrl: "https://new-api.example.invalid" },
          }
        : null,
    )
    getManagedResourceRegistrationMock.mockReturnValue(
      registration(
        vi.fn().mockResolvedValue({
          items: [nativeFact(9)],
          total: 1,
          type_counts: {},
        }),
      ),
    )
    migrateLegacyNumericConfigsMock.mockResolvedValue({
      migrated: 1,
      ambiguous: 0,
      unmatched: 0,
    })
    const { legacyChannelConfigMigration } = await loadMigration()

    const background = legacyChannelConfigMigration.initialize()
    const explicit = legacyChannelConfigMigration.initialize({
      bypassBackoff: true,
    })
    await vi.waitFor(() =>
      expect(resolveFirstLegacyCheck).toBeTypeOf("function"),
    )
    resolveFirstLegacyCheck?.(true)

    await expect(background).resolves.toEqual({
      status: "deferred",
      reason: "backoff-active",
    })
    await expect(explicit).resolves.toEqual({
      status: "completed",
      migrated: 1,
      ambiguous: 0,
      unmatched: 0,
    })
    expect(hasLegacyNumericConfigsMock).toHaveBeenCalledTimes(2)
  })

  it("deduplicates concurrent initialization through one shared promise", async () => {
    let resolveLegacyCheck: ((value: boolean) => void) | undefined
    let markLegacyCheckStarted: (() => void) | undefined
    const legacyCheckStarted = new Promise<void>((resolve) => {
      markLegacyCheckStarted = resolve
    })
    hasLegacyNumericConfigsMock.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveLegacyCheck = resolve
          markLegacyCheckStarted?.()
        }),
    )
    const { legacyChannelConfigMigration } = await loadMigration()

    const first = legacyChannelConfigMigration.initialize()
    const second = legacyChannelConfigMigration.initialize()
    await legacyCheckStarted
    resolveLegacyCheck!(false)

    await expect(Promise.all([first, second])).resolves.toEqual([
      { status: "not-needed" },
      { status: "not-needed" },
    ])
    expect(hasLegacyNumericConfigsMock).toHaveBeenCalledTimes(1)
  })
})
