import { beforeEach, describe, expect, it, vi } from "vitest"

import { CHANNEL_CONFIG_STORAGE_KEYS } from "~/services/core/storageKeys"
import { ChannelConfigMessageTypes } from "~/services/managedSites/channelConfigMessaging"
import {
  channelConfigStorage,
  coerceChannelConfigSnapshot,
  resolveChannelConfigGetMessage,
  resolveChannelConfigUpsertFiltersMessage,
  setupChannelConfigMessagingListeners,
} from "~/services/managedSites/channelConfigStorage"
import {
  CHANNEL_CONFIG_SNAPSHOT_VERSION,
  type ChannelConfigSnapshot,
  type ChannelResourceConfig,
} from "~/types/channelConfig"
import {
  createManagedUpstreamResourceRef,
  getManagedUpstreamResourceRefKey,
} from "~/types/managedUpstreamResource"

const storageData = new Map<string, any>()

const { mockOnChannelConfigMessage, mockSafeRandomUUID } = vi.hoisted(() => ({
  mockOnChannelConfigMessage: vi.fn(() => vi.fn()),
  mockSafeRandomUUID: vi.fn(() => "generated-filter-id"),
}))

vi.mock("@plasmohq/storage", () => {
  class Storage {
    async get(key: string) {
      return storageData.get(key)
    }

    async set(key: string, value: any) {
      storageData.set(key, value)
    }

    async remove(key: string) {
      storageData.delete(key)
    }
  }

  return { Storage }
})

vi.mock("~/utils/core/identifier", () => ({
  safeRandomUUID: mockSafeRandomUUID,
}))

vi.mock(
  "~/services/managedSites/channelConfigMessaging",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/managedSites/channelConfigMessaging")
      >()
    return {
      ...actual,
      onChannelConfigMessage: mockOnChannelConfigMessage,
    }
  },
)

const createRef = (scopeKey: string, resourceId: string | number = 9) =>
  createManagedUpstreamResourceRef({
    managedSiteType: "new-api",
    scopeKey,
    resourceId,
  })

const createConfig = (params: {
  scopeKey: string
  resourceId?: string | number
  channelId?: number
  ruleId?: string
  updatedAt?: number
}): ChannelResourceConfig => {
  const updatedAt = params.updatedAt ?? 200
  return {
    resourceRef: createRef(params.scopeKey, params.resourceId),
    ...(params.channelId === undefined ? {} : { channelId: params.channelId }),
    createdAt: 100,
    updatedAt,
    modelFilterSettings: {
      updatedAt,
      rules: params.ruleId
        ? [
            {
              id: params.ruleId,
              kind: "pattern",
              name: params.ruleId,
              pattern: params.ruleId,
              isRegex: false,
              action: "include",
              enabled: true,
              createdAt: 100,
              updatedAt,
            },
          ]
        : [],
    },
  }
}

const snapshotOf = (
  ...configs: ChannelResourceConfig[]
): ChannelConfigSnapshot => ({
  schemaVersion: CHANNEL_CONFIG_SNAPSHOT_VERSION,
  configs: Object.fromEntries(
    configs.map((config) => [
      getManagedUpstreamResourceRefKey(config.resourceRef),
      config,
    ]),
  ),
})

describe("channelConfigStorage", () => {
  beforeEach(() => {
    storageData.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-28T05:30:00.000Z"))
  })

  it("keeps equal numeric channel ids isolated by managed-site scope", async () => {
    const siteARef = createRef("https://a.example.invalid", 9)
    const siteBRef = createRef("https://b.example.invalid", 9)

    await channelConfigStorage.upsertFilters(
      siteARef,
      createConfig({
        scopeKey: siteARef.scopeKey,
        ruleId: "site-a",
      }).modelFilterSettings.rules,
      9,
    )
    await channelConfigStorage.upsertFilters(
      siteBRef,
      createConfig({
        scopeKey: siteBRef.scopeKey,
        ruleId: "site-b",
      }).modelFilterSettings.rules,
      9,
    )

    await expect(
      channelConfigStorage.getConfigsForScope({
        managedSiteType: "new-api",
        scopeKey: "https://a.example.invalid/path",
      }),
    ).resolves.toEqual({
      [getManagedUpstreamResourceRefKey(siteARef)]: expect.objectContaining({
        resourceRef: siteARef,
        modelFilterSettings: expect.objectContaining({
          rules: [expect.objectContaining({ id: "site-a" })],
        }),
      }),
    })
    await expect(channelConfigStorage.getConfig(siteBRef)).resolves.toEqual(
      expect.objectContaining({
        resourceRef: siteBRef,
        modelFilterSettings: expect.objectContaining({
          rules: [expect.objectContaining({ id: "site-b" })],
        }),
      }),
    )
  })

  it("preserves different resource entries across concurrent filter updates", async () => {
    const siteA = createConfig({
      scopeKey: "https://a.example.invalid",
      channelId: 9,
      ruleId: "site-a",
    })
    const siteB = createConfig({
      scopeKey: "https://b.example.invalid",
      channelId: 9,
      ruleId: "site-b",
    })

    await Promise.all([
      channelConfigStorage.upsertFilters(
        siteA.resourceRef,
        siteA.modelFilterSettings.rules,
        siteA.channelId,
      ),
      channelConfigStorage.upsertFilters(
        siteB.resourceRef,
        siteB.modelFilterSettings.rules,
        siteB.channelId,
      ),
    ])

    const configs = (await channelConfigStorage.exportConfigs()).configs
    expect(Object.keys(configs)).toHaveLength(2)
    expect(configs).toMatchObject({
      [getManagedUpstreamResourceRefKey(siteA.resourceRef)]: {
        resourceRef: siteA.resourceRef,
      },
      [getManagedUpstreamResourceRefKey(siteB.resourceRef)]: {
        resourceRef: siteB.resourceRef,
      },
    })
  })

  it("merges an incoming snapshot atomically with concurrent resource updates", async () => {
    const local = createConfig({
      scopeKey: "https://local.example.invalid",
      channelId: 9,
      ruleId: "local",
      updatedAt: 300,
    })
    const remote = createConfig({
      scopeKey: "https://remote.example.invalid",
      channelId: 9,
      ruleId: "remote",
      updatedAt: 200,
    })

    await Promise.all([
      channelConfigStorage.mergeConfigs(snapshotOf(remote)),
      channelConfigStorage.upsertFilters(
        local.resourceRef,
        local.modelFilterSettings.rules,
        local.channelId,
      ),
    ])

    await expect(channelConfigStorage.exportConfigs()).resolves.toMatchObject({
      configs: {
        [getManagedUpstreamResourceRefKey(local.resourceRef)]: {
          resourceRef: local.resourceRef,
        },
        [getManagedUpstreamResourceRefKey(remote.resourceRef)]: {
          resourceRef: remote.resourceRef,
        },
      },
    })
  })

  it("discards legacy numeric configs without using them as fallback", async () => {
    const resourceRef = createRef("https://admin.example.invalid", 9)
    storageData.set(CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_CONFIGS, {
      9: createConfig({
        scopeKey: "https://legacy.example.invalid",
        channelId: 9,
        ruleId: "legacy",
      }),
    })

    const config = await channelConfigStorage.getConfig(resourceRef)

    expect(config.resourceRef).toEqual(resourceRef)
    expect(config.modelFilterSettings.rules).toEqual([])
    expect(storageData.has(CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_CONFIGS)).toBe(
      false,
    )
  })

  it("supports non-numeric native resource ids for every managed-site type", async () => {
    const resourceRef = createManagedUpstreamResourceRef({
      managedSiteType: "axonhub",
      scopeKey: "https://admin.example.invalid",
      resourceId: "provider/native-id",
    })

    await channelConfigStorage.upsertFilters(resourceRef, [
      {
        id: "native-rule",
        kind: "pattern",
        name: "Native rule",
        pattern: "claude",
        isRegex: false,
        action: "exclude",
        enabled: true,
        createdAt: 10,
        updatedAt: 20,
      },
    ])

    await expect(channelConfigStorage.getConfig(resourceRef)).resolves.toEqual(
      expect.objectContaining({
        resourceRef,
        modelFilterSettings: expect.objectContaining({
          rules: [expect.objectContaining({ id: "native-rule" })],
        }),
      }),
    )
  })

  it("propagates storage read failures instead of returning an empty map", async () => {
    const storage = (channelConfigStorage as any).storage
    vi.spyOn(storage, "get").mockRejectedValueOnce(new Error("read failed"))

    await expect(channelConfigStorage.exportConfigs()).rejects.toThrow(
      "read failed",
    )
  })

  it("propagates authoritative write failures", async () => {
    const resourceRef = createRef("https://admin.example.invalid")
    const storage = (channelConfigStorage as any).storage
    vi.spyOn(storage, "set").mockRejectedValueOnce(new Error("write failed"))

    await expect(
      channelConfigStorage.upsertFilters(resourceRef, []),
    ).rejects.toThrow("write failed")
  })

  it("keeps authoritative writes successful when legacy cleanup fails", async () => {
    const resourceRef = createRef("https://admin.example.invalid")
    const storage = (channelConfigStorage as any).storage
    vi.spyOn(storage, "remove").mockRejectedValueOnce(
      new Error("legacy cleanup failed"),
    )

    await expect(
      channelConfigStorage.upsertFilters(resourceRef, []),
    ).resolves.toBeUndefined()
    await expect(channelConfigStorage.getConfig(resourceRef)).resolves.toEqual(
      expect.objectContaining({ resourceRef }),
    )
  })

  it("exports and replaces complete scoped snapshots", async () => {
    const siteA = createConfig({
      scopeKey: "https://a.example.invalid",
      channelId: 9,
      ruleId: "site-a",
    })
    const siteB = createConfig({
      scopeKey: "https://b.example.invalid",
      channelId: 9,
      ruleId: "site-b",
    })
    storageData.set(
      CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_RESOURCE_CONFIGS,
      snapshotOf(siteA).configs,
    )

    await expect(channelConfigStorage.exportConfigs()).resolves.toEqual(
      snapshotOf(siteA),
    )
    await expect(
      channelConfigStorage.importConfigs(snapshotOf(siteB)),
    ).resolves.toBe(1)
    await expect(channelConfigStorage.exportConfigs()).resolves.toEqual(
      snapshotOf(siteB),
    )
  })

  it("rejects legacy numeric maps as channel-config snapshots", async () => {
    const legacy = {
      9: {
        channelId: 9,
        createdAt: 1,
        updatedAt: 2,
        modelFilterSettings: { rules: [], updatedAt: 2 },
      },
    }

    expect(coerceChannelConfigSnapshot(legacy)).toBeNull()
    await expect(channelConfigStorage.importConfigs(legacy)).rejects.toThrow(
      "snapshot is invalid",
    )
  })

  it.each([
    [
      "entirely malformed",
      {
        malformed: {
          createdAt: 1,
          updatedAt: 2,
          modelFilterSettings: { rules: [], updatedAt: 2 },
        },
      },
    ],
    [
      "partially malformed",
      {
        ...snapshotOf(
          createConfig({ scopeKey: "https://valid.example.invalid" }),
        ).configs,
        malformed: {
          createdAt: 1,
          updatedAt: 2,
          modelFilterSettings: { rules: [], updatedAt: 2 },
        },
      },
    ],
  ])(
    "rejects %s non-empty snapshots without replacing authoritative storage",
    async (_label, configs) => {
      const existing = createConfig({
        scopeKey: "https://existing.example.invalid",
        ruleId: "existing",
      })
      await channelConfigStorage.importConfigs(snapshotOf(existing))

      await expect(
        channelConfigStorage.importConfigs({
          schemaVersion: CHANNEL_CONFIG_SNAPSHOT_VERSION,
          configs,
        }),
      ).rejects.toThrow("snapshot is invalid")
      await expect(channelConfigStorage.exportConfigs()).resolves.toEqual(
        snapshotOf(existing),
      )
    },
  )

  it("rejects snapshots whose conflict timestamps are missing", () => {
    const resourceRef = createRef("https://admin.example.invalid")

    expect(
      coerceChannelConfigSnapshot({
        schemaVersion: CHANNEL_CONFIG_SNAPSHOT_VERSION,
        configs: {
          missingTimestamps: {
            resourceRef,
            modelFilterSettings: { rules: [] },
          },
        },
      }),
    ).toBeNull()
  })

  it.each([
    [
      "an unknown rule action",
      (config: any) => {
        config.modelFilterSettings.rules[0].action = "archive"
      },
    ],
    [
      "a non-boolean enabled flag",
      (config: any) => {
        config.modelFilterSettings.rules[0].enabled = "yes"
      },
    ],
    [
      "a non-finite timestamp",
      (config: any) => {
        config.updatedAt = Number.POSITIVE_INFINITY
      },
    ],
    [
      "filter settings newer than the containing config",
      (config: any) => {
        config.updatedAt = config.modelFilterSettings.updatedAt - 1
      },
    ],
    [
      "a rule created after its last update",
      (config: any) => {
        config.modelFilterSettings.rules[0].createdAt =
          config.modelFilterSettings.rules[0].updatedAt + 1
      },
    ],
  ])("rejects snapshots with %s", (_label, mutate) => {
    const config = createConfig({
      scopeKey: "https://admin.example.invalid",
      ruleId: "strict-rule",
    })
    mutate(config)

    expect(coerceChannelConfigSnapshot(snapshotOf(config))).toBeNull()
  })

  it("rejects duplicate canonical resource identities", () => {
    const first = createConfig({
      scopeKey: "https://admin.example.invalid/path-a",
      ruleId: "first",
    })
    const duplicate = createConfig({
      scopeKey: "https://admin.example.invalid/path-b",
      ruleId: "duplicate",
    })

    expect(
      coerceChannelConfigSnapshot({
        schemaVersion: CHANNEL_CONFIG_SNAPSHOT_VERSION,
        configs: { first, duplicate },
      }),
    ).toBeNull()
  })

  it("uses deterministic timestamps when sanitizing historical local data", async () => {
    const resourceRef = createRef("https://admin.example.invalid")
    storageData.set(CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_RESOURCE_CONFIGS, {
      historical: {
        resourceRef,
        modelFilterSettings: { rules: [] },
      },
    })

    const first = (await channelConfigStorage.exportConfigs()).configs
    vi.advanceTimersByTime(60_000)
    const second = (await channelConfigStorage.exportConfigs()).configs

    expect(first).toEqual(second)
    expect(first[getManagedUpstreamResourceRefKey(resourceRef)]).toMatchObject({
      createdAt: 1,
      updatedAt: 1,
      modelFilterSettings: { updatedAt: 1 },
    })
    await expect(channelConfigStorage.exportConfigs()).resolves.toEqual({
      schemaVersion: CHANNEL_CONFIG_SNAPSHOT_VERSION,
      configs: first,
    })
    expect(
      coerceChannelConfigSnapshot(await channelConfigStorage.exportConfigs()),
    ).toEqual({
      schemaVersion: CHANNEL_CONFIG_SNAPSHOT_VERSION,
      configs: first,
    })
  })

  it("exports historical rules as a snapshot that the strict interface can restore", async () => {
    const resourceRef = createRef("https://historical.example.invalid")
    const rule = createConfig({
      scopeKey: resourceRef.scopeKey,
      ruleId: "historical-rule",
      updatedAt: 200,
    }).modelFilterSettings.rules[0]
    storageData.set(CHANNEL_CONFIG_STORAGE_KEYS.CHANNEL_RESOURCE_CONFIGS, {
      historical: {
        resourceRef,
        modelFilterSettings: { rules: [rule] },
      },
    })

    const snapshot = await channelConfigStorage.exportConfigs()

    expect(
      snapshot.configs[getManagedUpstreamResourceRefKey(resourceRef)],
    ).toMatchObject({
      createdAt: 1,
      updatedAt: 200,
      modelFilterSettings: {
        updatedAt: 200,
        rules: [expect.objectContaining({ updatedAt: 200 })],
      },
    })
    expect(coerceChannelConfigSnapshot(snapshot)).toEqual(snapshot)
    await expect(channelConfigStorage.importConfigs(snapshot)).resolves.toBe(1)
  })

  it("rekeys imported entries from their structured resource refs", () => {
    const config = createConfig({
      scopeKey: "https://admin.example.invalid/path",
      ruleId: "normalized",
    })

    expect(
      coerceChannelConfigSnapshot({
        schemaVersion: CHANNEL_CONFIG_SNAPSHOT_VERSION,
        configs: { "untrusted-key": config },
      }),
    ).toEqual(
      snapshotOf({
        ...config,
        resourceRef: createRef("https://admin.example.invalid"),
      }),
    )
  })

  it("merges by complete resource identity and keeps the newest same-resource value", async () => {
    const localA = createConfig({
      scopeKey: "https://a.example.invalid",
      ruleId: "local-a",
      updatedAt: 200,
    })
    const remoteA = createConfig({
      scopeKey: "https://a.example.invalid",
      ruleId: "remote-a",
      updatedAt: 300,
    })
    const remoteB = createConfig({
      scopeKey: "https://b.example.invalid",
      ruleId: "remote-b",
      updatedAt: 100,
    })

    await channelConfigStorage.importConfigs(snapshotOf(localA))

    await expect(
      channelConfigStorage.mergeConfigs(snapshotOf(remoteA, remoteB)),
    ).resolves.toEqual(snapshotOf(remoteA, remoteB))
    await expect(channelConfigStorage.exportConfigs()).resolves.toEqual(
      snapshotOf(remoteA, remoteB),
    )
  })

  it("normalizes and persists resource-aware runtime messages", async () => {
    const resourceRef = createRef("https://admin.example.invalid", 12)

    await expect(
      resolveChannelConfigUpsertFiltersMessage({
        channelId: 12,
        resourceRef,
        filters: [
          {
            name: " Include GPT ",
            pattern: " gpt ",
            isRegex: false,
            enabled: true,
          },
        ],
      }),
    ).resolves.toEqual({
      success: true,
      data: [
        expect.objectContaining({
          id: "generated-filter-id",
          name: "Include GPT",
          pattern: "gpt",
        }),
      ],
    })

    await expect(
      resolveChannelConfigGetMessage({ channelId: 12, resourceRef }),
    ).resolves.toEqual({
      success: true,
      data: expect.objectContaining({
        resourceRef,
        channelId: 12,
        modelFilterSettings: expect.objectContaining({
          rules: [expect.objectContaining({ name: "Include GPT" })],
        }),
      }),
    })
  })

  it("rejects invalid refs and filter payloads through typed messages", async () => {
    const resourceRef = createRef("https://admin.example.invalid", 12)

    await expect(
      resolveChannelConfigGetMessage({
        resourceRef: { ...resourceRef, scopeKey: "" },
      }),
    ).resolves.toEqual({ success: false, error: "resourceRef is invalid" })

    await expect(
      resolveChannelConfigUpsertFiltersMessage({
        resourceRef,
        filters: [{ name: "Broken regex", pattern: "[", isRegex: true }],
      }),
    ).resolves.toEqual({
      success: false,
      error: expect.stringContaining("Invalid regex pattern"),
    })
  })

  it("registers typed channel-config listeners once", () => {
    setupChannelConfigMessagingListeners()
    setupChannelConfigMessagingListeners()

    expect(mockOnChannelConfigMessage).toHaveBeenCalledTimes(2)
    expect(mockOnChannelConfigMessage).toHaveBeenNthCalledWith(
      1,
      ChannelConfigMessageTypes.Get,
      expect.any(Function),
    )
    expect(mockOnChannelConfigMessage).toHaveBeenNthCalledWith(
      2,
      ChannelConfigMessageTypes.UpsertFilters,
      expect.any(Function),
    )
  })
})
