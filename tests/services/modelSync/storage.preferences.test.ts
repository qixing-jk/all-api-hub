import { beforeEach, describe, expect, it, vi } from "vitest"

import { managedSiteModelSyncStorage } from "~/services/models/modelSync/storage"
import type {
  ChannelModelFilterRule,
  ChannelModelPatternFilterRule,
} from "~/types/channelModelFilters"

const { mockUserPreferences, storageMocks, defaultManagedSiteModelSync } =
  vi.hoisted(() => ({
    mockUserPreferences: {
      getPreferences: vi.fn(),
      savePreferences: vi.fn(),
    },
    storageMocks: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
    },
    defaultManagedSiteModelSync: {
      enabled: false,
      interval: 24 * 60 * 60 * 1000,
      concurrency: 2,
      maxRetries: 2,
      rateLimit: {
        requestsPerMinute: 20,
        burst: 5,
      },
      allowedModels: [],
      globalChannelModelFilters: [],
    },
  }))

vi.mock("@plasmohq/storage", () => {
  /**
   * Minimal storage stub matching the Plasmo Storage instance shape used here.
   */
  function Storage(this: unknown) {
    ;(this as { get: typeof storageMocks.get }).get = storageMocks.get
    ;(this as { set: typeof storageMocks.set }).set = storageMocks.set
    ;(this as { remove: typeof storageMocks.remove }).remove =
      storageMocks.remove
  }

  return { Storage, __esModule: true }
})

vi.mock("~/services/preferences/userPreferences", () => ({
  DEFAULT_PREFERENCES: {
    managedSiteModelSync: defaultManagedSiteModelSync,
  },
  userPreferences: mockUserPreferences,
}))

/**
 * Creates a persisted channel model filter rule fixture.
 */
const buildFilterRule = (
  overrides: Partial<ChannelModelPatternFilterRule> = {},
): ChannelModelFilterRule => ({
  id: "rule-1",
  kind: "pattern",
  name: "Exclude legacy model",
  pattern: "legacy-model",
  isRegex: false,
  action: "exclude",
  enabled: true,
  createdAt: 1,
  updatedAt: 1,
  ...overrides,
})

describe("managedSiteModelSyncStorage preferences and error handling", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUserPreferences.getPreferences.mockResolvedValue({
      managedSiteModelSync: structuredClone(defaultManagedSiteModelSync),
    })
    mockUserPreferences.savePreferences.mockResolvedValue(true)
  })

  it("maps managed-site model sync preferences from user preferences and returns defensive copies", async () => {
    const storedRule = buildFilterRule()
    const storedConfig = {
      enabled: true,
      interval: 60_000,
      concurrency: 4,
      maxRetries: 5,
      rateLimit: {
        requestsPerMinute: 90,
        burst: 8,
      },
      allowedModels: ["gpt-4o"],
      globalChannelModelFilters: [storedRule],
    }
    mockUserPreferences.getPreferences.mockResolvedValueOnce({
      managedSiteModelSync: storedConfig,
    })

    const result = await managedSiteModelSyncStorage.getPreferences()

    expect(result).toEqual({
      enableSync: true,
      intervalMs: 60_000,
      concurrency: 4,
      maxRetries: 5,
      rateLimit: {
        requestsPerMinute: 90,
        burst: 8,
      },
      allowedModels: ["gpt-4o"],
      globalChannelModelFilters: [storedRule],
    })

    result.rateLimit.requestsPerMinute = 10
    result.allowedModels.push("claude-3")
    result.globalChannelModelFilters.push(
      buildFilterRule({
        id: "rule-2",
        name: "Include new model",
        pattern: "new-model",
        action: "include",
      }),
    )

    expect(storedConfig.rateLimit.requestsPerMinute).toBe(90)
    expect(storedConfig.allowedModels).toEqual(["gpt-4o"])
    expect(storedConfig.globalChannelModelFilters).toEqual([storedRule])
  })

  it("falls back to default preferences when reading user preferences fails", async () => {
    mockUserPreferences.getPreferences.mockRejectedValueOnce(
      new Error("storage unavailable"),
    )

    await expect(managedSiteModelSyncStorage.getPreferences()).resolves.toEqual(
      {
        enableSync: false,
        intervalMs: 24 * 60 * 60 * 1000,
        concurrency: 2,
        maxRetries: 2,
        rateLimit: {
          requestsPerMinute: 20,
          burst: 5,
        },
        allowedModels: [],
        globalChannelModelFilters: [],
      },
    )
  })

  it("falls back to the default sync config when the preference section is missing", async () => {
    mockUserPreferences.getPreferences.mockResolvedValueOnce({})

    await expect(managedSiteModelSyncStorage.getPreferences()).resolves.toEqual(
      {
        enableSync: false,
        intervalMs: 24 * 60 * 60 * 1000,
        concurrency: 2,
        maxRetries: 2,
        rateLimit: {
          requestsPerMinute: 20,
          burst: 5,
        },
        allowedModels: [],
        globalChannelModelFilters: [],
      },
    )
  })

  it("treats missing optional model lists in stored preferences as empty arrays", async () => {
    mockUserPreferences.getPreferences.mockResolvedValueOnce({
      managedSiteModelSync: {
        enabled: true,
        interval: 120_000,
        concurrency: 3,
        maxRetries: 4,
        rateLimit: {
          requestsPerMinute: 45,
          burst: 7,
        },
      } as any,
    })

    await expect(managedSiteModelSyncStorage.getPreferences()).resolves.toEqual(
      {
        enableSync: true,
        intervalMs: 120_000,
        concurrency: 3,
        maxRetries: 4,
        rateLimit: {
          requestsPerMinute: 45,
          burst: 7,
        },
        allowedModels: [],
        globalChannelModelFilters: [],
      },
    )
  })

  it("merges partial preference updates into the current managed-site sync config", async () => {
    const currentConfig = {
      enabled: false,
      interval: 300_000,
      concurrency: 3,
      maxRetries: 4,
      rateLimit: {
        requestsPerMinute: 60,
        burst: 6,
      },
      allowedModels: ["gpt-4o"],
      globalChannelModelFilters: [buildFilterRule()],
    }
    const input = {
      enableSync: true,
      rateLimit: {
        requestsPerMinute: currentConfig.rateLimit.requestsPerMinute,
        burst: 9,
      },
      allowedModels: ["claude-3", "gpt-4.1"],
      globalChannelModelFilters: [
        buildFilterRule({
          id: "rule-2",
          name: "Include new model",
          pattern: "new-model",
          action: "include",
        }),
      ],
    }
    mockUserPreferences.getPreferences.mockResolvedValueOnce({
      managedSiteModelSync: currentConfig,
    })

    const saved = await managedSiteModelSyncStorage.savePreferences(input)

    expect(saved).toBe(true)
    expect(mockUserPreferences.savePreferences).toHaveBeenCalledWith({
      managedSiteModelSync: {
        enabled: true,
        interval: 300_000,
        concurrency: 3,
        maxRetries: 4,
        rateLimit: {
          requestsPerMinute: 60,
          burst: 9,
        },
        allowedModels: ["claude-3", "gpt-4.1"],
        globalChannelModelFilters: [
          buildFilterRule({
            id: "rule-2",
            name: "Include new model",
            pattern: "new-model",
            action: "include",
          }),
        ],
      },
    })

    input.allowedModels.push("late-addition")

    const savedArg = mockUserPreferences.savePreferences.mock.calls[0][0]
    expect(savedArg.managedSiteModelSync.allowedModels).toEqual([
      "claude-3",
      "gpt-4.1",
    ])
  })

  it("returns false when saving preferences fails", async () => {
    mockUserPreferences.savePreferences.mockRejectedValueOnce(
      new Error("write failed"),
    )

    await expect(
      managedSiteModelSyncStorage.savePreferences({
        enableSync: true,
      }),
    ).resolves.toBe(false)
  })

  it("merges partial updates into defaults when no managed-site sync config exists yet", async () => {
    mockUserPreferences.getPreferences.mockResolvedValueOnce({})

    await expect(
      managedSiteModelSyncStorage.savePreferences({
        concurrency: 7,
        rateLimit: {
          requestsPerMinute: 99,
          burst: 5,
        },
      }),
    ).resolves.toBe(true)

    expect(mockUserPreferences.savePreferences).toHaveBeenCalledWith({
      managedSiteModelSync: {
        enabled: false,
        interval: 24 * 60 * 60 * 1000,
        concurrency: 7,
        maxRetries: 2,
        rateLimit: {
          requestsPerMinute: 99,
          burst: 5,
        },
        allowedModels: [],
        globalChannelModelFilters: [],
      },
    })
  })

  it("preserves explicit zero values and missing stored arrays when saving preferences", async () => {
    mockUserPreferences.getPreferences.mockResolvedValueOnce({
      managedSiteModelSync: {
        enabled: true,
        interval: 300_000,
        concurrency: 6,
        maxRetries: 8,
        rateLimit: {
          requestsPerMinute: 55,
          burst: 9,
        },
      } as any,
    })

    await expect(
      managedSiteModelSyncStorage.savePreferences({
        intervalMs: 0,
        maxRetries: 0,
      }),
    ).resolves.toBe(true)

    expect(mockUserPreferences.savePreferences).toHaveBeenCalledWith({
      managedSiteModelSync: {
        enabled: true,
        interval: 0,
        concurrency: 6,
        maxRetries: 0,
        rateLimit: {
          requestsPerMinute: 55,
          burst: 9,
        },
        allowedModels: [],
        globalChannelModelFilters: [],
      },
    })
  })

  it("returns an empty cache when cached upstream models are empty or unreadable", async () => {
    storageMocks.get.mockResolvedValueOnce([])

    await expect(
      managedSiteModelSyncStorage.getChannelUpstreamModelOptions(),
    ).resolves.toEqual([])

    storageMocks.get.mockRejectedValueOnce(new Error("read failed"))

    await expect(
      managedSiteModelSyncStorage.getChannelUpstreamModelOptions(),
    ).resolves.toEqual([])
  })

  it("returns false when execution results cannot be saved or cleared", async () => {
    storageMocks.set.mockRejectedValueOnce(new Error("write failed"))
    storageMocks.remove.mockRejectedValueOnce(new Error("remove failed"))

    await expect(
      managedSiteModelSyncStorage.saveLastExecution({
        startedAt: "2026-03-29T00:00:00.000Z",
        finishedAt: "2026-03-29T00:05:00.000Z",
        success: true,
        statistics: {
          total: 1,
          successCount: 1,
          failureCount: 0,
        },
      } as any),
    ).resolves.toBe(false)

    await expect(
      managedSiteModelSyncStorage.clearLastExecution(),
    ).resolves.toBe(false)
  })

  it("returns null when reading the last execution fails during key migration", async () => {
    storageMocks.get.mockResolvedValueOnce(undefined)
    storageMocks.get.mockResolvedValueOnce({
      startedAt: "2026-03-29T00:00:00.000Z",
    })
    storageMocks.set.mockRejectedValueOnce(new Error("migration write failed"))

    await expect(
      managedSiteModelSyncStorage.getLastExecution(),
    ).resolves.toBeNull()
  })

  it("clears last execution successfully and returns false when upstream-model cache persistence fails", async () => {
    storageMocks.remove.mockResolvedValueOnce(undefined)
    storageMocks.set.mockRejectedValueOnce(new Error("cache write failed"))

    await expect(
      managedSiteModelSyncStorage.clearLastExecution(),
    ).resolves.toBe(true)
    expect(storageMocks.remove).toHaveBeenCalledWith(
      "managedSiteModelSync_lastExecution",
    )

    await expect(
      managedSiteModelSyncStorage.saveChannelUpstreamModelOptions([
        "  gpt-4o  ",
        "claude-3",
      ]),
    ).resolves.toBe(false)
  })
})
