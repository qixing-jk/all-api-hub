import { beforeEach, describe, expect, it, vi } from "vitest"

import { channelConfigStorage } from "~/services/managedSites/configuration/channelConfigStorage"
import { toManagedUpstreamResourceRef } from "~/services/managedSites/managedResourceIdentity"
import { ModelSyncExecution } from "~/services/models/modelSync/execution"
import { managedSiteModelSyncStorage } from "~/services/models/modelSync/storage"
import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { userPreferences } from "~/services/preferences/userPreferences"
import { PROTECTION_BYPASS_USER_COMMANDS } from "~/services/protectionBypass/contracts"
import type { ManagedModelChannel } from "~/types/managedResourceModels"
import { getModelSyncItemStatus } from "~/types/managedSiteModelSync"
import { userCommandExecution } from "~~/tests/services/protectionBypass/fixtures"
import { modelResourceRef } from "~~/tests/test-utils/managedModelResource"

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  fetchModels: vi.fn(),
  updateModels: vi.fn(),
  save: vi.fn(),
  migrate: vi.fn(),
}))
vi.mock("~/services/apiAdapters/registry", () => ({
  getSiteTypeCapabilities: () => ({
    managedSites: {
      models: {
        list: mocks.list,
        fetchModels: mocks.fetchModels,
        updateModels: mocks.updateModels,
        updateModelMapping: vi.fn(),
      },
    },
  }),
}))
vi.mock("~/services/models/modelSync/executionResults", () => ({
  saveModelSyncExecution: mocks.save,
}))
vi.mock(
  "~/services/managedSites/configuration/legacyChannelConfigMigration",
  () => ({
    ensureLegacyChannelConfigMigrationReady: mocks.migrate,
  }),
)

const excludedRef = modelResourceRef("opaque/channel-a")
const includedRef = modelResourceRef("opaque/channel-b")
const channel = (ref: typeof excludedRef): ManagedModelChannel => ({
  ref,
  name: ref.resourceId,
  type: 1,
  baseUrl: "https://upstream.example",
  models: ["old"],
  disabled: false,
  modelMapping: "",
})

describe("model sync channel exclusions", () => {
  it("retains skipped channels after a manual full run is persisted and reopened", async () => {
    const { saveModelSyncExecution } = await vi.importActual<
      typeof import("~/services/models/modelSync/executionResults")
    >("~/services/models/modelSync/executionResults")
    mocks.save.mockImplementationOnce(saveModelSyncExecution)

    await new ModelSyncExecution().executeSync(
      undefined,
      undefined,
      userCommandExecution(
        PROTECTION_BYPASS_USER_COMMANDS.SyncManagedSiteModels,
      ),
    )
    const history = await managedSiteModelSyncStorage.getLastExecution()

    expect(
      history?.items.filter(
        (item) => getModelSyncItemStatus(item) === "skipped",
      ),
    ).toEqual([
      expect.objectContaining({
        resourceRef: excludedRef,
        skipReason: "excluded",
      }),
    ])
    expect(history?.statistics.skippedCount).toBe(1)
  })

  it("retries only failed items when history also contains skipped channels", async () => {
    const read = vi
      .spyOn(managedSiteModelSyncStorage, "getLastExecution")
      .mockResolvedValue({
        items: [
          {
            resourceRef: excludedRef,
            channelName: "Skipped",
            ok: false,
            skipReason: "excluded",
            attempts: 0,
            finishedAt: 1,
          },
          {
            resourceRef: includedRef,
            channelName: "Failed",
            ok: false,
            attempts: 1,
            finishedAt: 1,
          },
        ],
        statistics: {
          total: 1,
          failureCount: 1,
          successCount: 0,
          skippedCount: 1,
          startedAt: 1,
          endedAt: 1,
          durationMs: 0,
        },
      })
    try {
      const result = await new ModelSyncExecution().executeFailedOnly()
      expect(result.items.map((item) => item.resourceRef)).toEqual([
        includedRef,
      ])
      expect(mocks.fetchModels).toHaveBeenCalledOnce()
    } finally {
      read.mockRestore()
    }
  })

  it("does not create skipped results for exclusions absent from current inventory", async () => {
    mocks.list.mockResolvedValue({ items: [channel(includedRef)], total: 1 })
    const result = await new ModelSyncExecution().executeSync()
    expect(result.items.map((item) => item.resourceRef)).toEqual([includedRef])
    expect(result.statistics.skippedCount ?? 0).toBe(0)
  })

  it("publishes skip counts while participating channels run", async () => {
    const execution = new ModelSyncExecution()
    let duringFetch: ReturnType<typeof execution.getProgress>
    mocks.fetchModels.mockImplementationOnce(async () => {
      duringFetch = execution.getProgress()
      return ["new"]
    })
    await execution.executeSync()
    expect(duringFetch!).toMatchObject({
      isRunning: true,
      total: 1,
      skippedCount: 1,
    })
  })

  it("does not query any channel when exclusion settings cannot be read", async () => {
    const read = vi
      .spyOn(channelConfigStorage, "getConfigsForScope")
      .mockRejectedValueOnce(new Error("storage unavailable"))
    try {
      await expect(new ModelSyncExecution().executeSync()).rejects.toThrow(
        "storage unavailable",
      )
      expect(mocks.list).not.toHaveBeenCalled()
      expect(mocks.fetchModels).not.toHaveBeenCalled()
    } finally {
      read.mockRestore()
    }
  })

  beforeEach(async () => {
    vi.clearAllMocks()
    await browser.storage.local.clear()
    vi.spyOn(userPreferences, "getPreferences").mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      managedSiteType: "new-api",
      newApi: {
        baseUrl: "https://example.com",
        adminToken: "test",
        userId: "1",
      },
      modelRedirect: { ...DEFAULT_PREFERENCES.modelRedirect!, enabled: false },
    })
    mocks.list.mockResolvedValue({
      items: [channel(excludedRef), channel(includedRef)],
      total: 2,
    })
    mocks.fetchModels.mockResolvedValue(["new"])
    mocks.updateModels.mockResolvedValue({
      outcome: "succeeded",
      data: undefined,
      confirmedEffects: [],
    })
    await channelConfigStorage.setModelSyncExcluded(
      toManagedUpstreamResourceRef(excludedRef),
      true,
    )
  })

  it.each(["automatic", "run-all"])(
    "skips excluded channels before model queries for %s",
    async (mode) => {
      const result = await new ModelSyncExecution().executeSync(
        undefined,
        undefined,
        mode === "run-all"
          ? userCommandExecution(
              PROTECTION_BYPASS_USER_COMMANDS.SyncManagedSiteModels,
            )
          : undefined,
      )
      expect(result.statistics).toMatchObject({
        total: 1,
        successCount: 1,
        failureCount: 0,
        skippedCount: 1,
      })
      expect(result.items).toEqual([
        expect.objectContaining({ resourceRef: includedRef, ok: true }),
        expect.objectContaining({
          resourceRef: excludedRef,
          skipReason: "excluded",
          attempts: 0,
        }),
      ])
      expect(mocks.fetchModels).toHaveBeenCalledOnce()
      expect(mocks.fetchModels.mock.calls[0]?.[1]).toEqual(includedRef)
      expect(mocks.updateModels).toHaveBeenCalledOnce()
      expect(mocks.save).toHaveBeenCalledWith(result, true)
    },
  )

  it("permits an explicit selection without clearing its saved exclusion", async () => {
    const result = await new ModelSyncExecution().executeSync([excludedRef])
    expect(result.items.map((item) => item.resourceRef)).toEqual([excludedRef])
    expect(
      (
        await channelConfigStorage.getConfig(
          toManagedUpstreamResourceRef(excludedRef),
        )
      ).modelSyncExcluded,
    ).toBe(true)
  })

  it("keeps all excluded channels visible without querying models or migrating rules", async () => {
    await channelConfigStorage.setModelSyncExcluded(
      toManagedUpstreamResourceRef(includedRef),
      true,
    )
    const execution = new ModelSyncExecution()
    const result = await execution.executeSync()
    expect(result).toMatchObject({
      items: [
        expect.objectContaining({
          resourceRef: excludedRef,
          skipReason: "excluded",
          attempts: 0,
        }),
        expect.objectContaining({
          resourceRef: includedRef,
          skipReason: "excluded",
          attempts: 0,
        }),
      ],
      statistics: {
        total: 0,
        successCount: 0,
        failureCount: 0,
        skippedCount: 2,
      },
    })
    expect(mocks.fetchModels).not.toHaveBeenCalled()
    expect(mocks.updateModels).not.toHaveBeenCalled()
    expect(mocks.migrate).not.toHaveBeenCalled()
    expect(execution.getProgress()).toBeNull()
  })

  it("does not exclude an equal resource ID in a different deployment", async () => {
    await channelConfigStorage.setModelSyncExcluded(
      toManagedUpstreamResourceRef(excludedRef),
      false,
    )
    await channelConfigStorage.setModelSyncExcluded(
      toManagedUpstreamResourceRef({
        ...includedRef,
        scopeKey: "https://other.example",
      }),
      true,
    )
    const result = await new ModelSyncExecution().executeSync()
    expect(result.statistics.total).toBe(2)
  })
})
