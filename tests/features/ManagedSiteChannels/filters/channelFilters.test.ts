import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchChannelFilterSettings,
  saveChannelFilters,
} from "~/features/ManagedSiteChannels/filters/channelFilters"
import { ChannelConfigMessageTypes } from "~/services/managedSites/configuration/channelConfigMessaging"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"
import { createManagedUpstreamResourceRef } from "~/types/managedUpstreamResource"

const {
  mockSendChannelConfigMessage,
  mockGetConfig,
  mockUpsertFilters,
  mockWarn,
} = vi.hoisted(() => ({
  mockSendChannelConfigMessage: vi.fn(),
  mockGetConfig: vi.fn(),
  mockUpsertFilters: vi.fn(),
  mockWarn: vi.fn(),
}))

vi.mock(
  "~/services/managedSites/configuration/channelConfigMessaging",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/managedSites/configuration/channelConfigMessaging")
      >()
    return {
      ...actual,
      sendChannelConfigMessage: mockSendChannelConfigMessage,
    }
  },
)

vi.mock("~/services/managedSites/configuration/channelConfigStorage", () => ({
  channelConfigStorage: {
    getConfig: mockGetConfig,
    upsertFilters: mockUpsertFilters,
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    warn: mockWarn,
  }),
}))

const sampleRules: ChannelModelFilterRule[] = [
  {
    id: "rule-1",
    name: "Allow GPT",
    pattern: "gpt",
    isRegex: false,
    action: "include",
    enabled: true,
    createdAt: 100,
    updatedAt: 200,
  },
]

const sampleResourceRef = createManagedUpstreamResourceRef({
  managedSiteType: "axonhub",
  scopeKey: "https://admin.example.invalid",
  resourceId: "provider/native-id",
})

describe("channelFilters", () => {
  it.each(["runtime", "local"])(
    "loads exclusion and rules together through %s",
    async (source) => {
      const config = {
        modelFilterSettings: { rules: sampleRules },
        modelSyncExcluded: true,
      }
      if (source === "runtime") {
        mockSendChannelConfigMessage.mockResolvedValue({
          success: true,
          data: config,
        })
      } else {
        mockSendChannelConfigMessage.mockRejectedValue(
          new Error("Receiving end does not exist"),
        )
        mockGetConfig.mockResolvedValue(config)
      }
      expect(
        await fetchChannelFilterSettings({ resourceRef: sampleResourceRef }),
      ).toEqual({ filters: sampleRules, modelSyncExcluded: true })
    },
  )

  it.each([true, false])(
    "sends an explicit exclusion change (%s) with the rules",
    async (modelSyncExcluded) => {
      mockSendChannelConfigMessage.mockResolvedValue({ success: true })
      await saveChannelFilters(
        { resourceRef: sampleResourceRef },
        sampleRules,
        { modelSyncExcluded },
      )
      expect(mockSendChannelConfigMessage).toHaveBeenCalledWith(
        ChannelConfigMessageTypes.UpsertFilters,
        {
          resourceRef: sampleResourceRef,
          filters: sampleRules,
          modelSyncExcluded,
        },
      )
    },
  )

  it("preserves the combined mutation in the local fallback", async () => {
    mockSendChannelConfigMessage.mockRejectedValue(
      new Error("Receiving end does not exist"),
    )
    mockUpsertFilters.mockResolvedValue(undefined)
    await saveChannelFilters(
      { resourceRef: sampleResourceRef, channelId: 9 },
      sampleRules,
      { modelSyncExcluded: false },
    )
    expect(mockUpsertFilters).toHaveBeenCalledWith(
      sampleResourceRef,
      sampleRules,
      { channelId: 9, modelSyncExcluded: false },
    )
  })

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns runtime-backed filter rules when the background responds successfully", async () => {
    mockSendChannelConfigMessage.mockResolvedValue({
      success: true,
      data: {
        modelFilterSettings: {
          rules: sampleRules,
        },
      },
    })

    await expect(
      fetchChannelFilterSettings({
        channelId: 9,
        resourceRef: sampleResourceRef,
      }),
    ).resolves.toEqual({ filters: sampleRules, modelSyncExcluded: false })

    expect(mockSendChannelConfigMessage).toHaveBeenCalledWith(
      ChannelConfigMessageTypes.Get,
      { channelId: 9, resourceRef: sampleResourceRef },
    )
    expect(mockGetConfig).not.toHaveBeenCalled()
  })

  it("sends resource-aware runtime requests when a resource ref is available", async () => {
    mockSendChannelConfigMessage.mockResolvedValue({
      success: true,
      data: {
        modelFilterSettings: {
          rules: sampleRules,
        },
      },
    })

    await expect(
      fetchChannelFilterSettings({
        channelId: 9,
        resourceRef: sampleResourceRef,
      }),
    ).resolves.toEqual({ filters: sampleRules, modelSyncExcluded: false })

    expect(mockSendChannelConfigMessage).toHaveBeenCalledWith(
      ChannelConfigMessageTypes.Get,
      {
        channelId: 9,
        resourceRef: sampleResourceRef,
      },
    )
    expect(mockGetConfig).not.toHaveBeenCalled()
  })

  it("throws explicit runtime load failures instead of falling back to local storage", async () => {
    mockSendChannelConfigMessage.mockResolvedValue({
      success: false,
      error: "runtime unavailable",
    })

    await expect(
      fetchChannelFilterSettings({
        channelId: 11,
        resourceRef: sampleResourceRef,
      }),
    ).rejects.toThrow("runtime unavailable")

    expect(mockGetConfig).not.toHaveBeenCalled()
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it("falls back to local storage when runtime loading is unavailable", async () => {
    mockSendChannelConfigMessage.mockRejectedValue(
      new Error("Receiving end does not exist"),
    )
    mockGetConfig.mockResolvedValue({
      modelFilterSettings: {
        rules: sampleRules,
      },
    })

    await expect(
      fetchChannelFilterSettings({
        channelId: 11,
        resourceRef: sampleResourceRef,
      }),
    ).resolves.toEqual({ filters: sampleRules, modelSyncExcluded: false })

    expect(mockGetConfig).toHaveBeenCalledWith(sampleResourceRef)
    expect(mockWarn).toHaveBeenCalledTimes(1)
  })

  it("falls back to resource-aware local storage when runtime loading is unavailable", async () => {
    mockSendChannelConfigMessage.mockRejectedValue(
      new Error("Receiving end does not exist"),
    )
    mockGetConfig.mockResolvedValue({
      modelFilterSettings: {
        rules: sampleRules,
      },
    })

    await expect(
      fetchChannelFilterSettings({
        channelId: 11,
        resourceRef: sampleResourceRef,
      }),
    ).resolves.toEqual({ filters: sampleRules, modelSyncExcluded: false })

    expect(mockGetConfig).toHaveBeenCalledWith(sampleResourceRef)
    expect(mockWarn).toHaveBeenCalledTimes(1)
  })

  it("saves through the runtime handler when available", async () => {
    mockSendChannelConfigMessage.mockResolvedValue({ success: true })

    await expect(
      saveChannelFilters(
        { channelId: 15, resourceRef: sampleResourceRef },
        sampleRules,
      ),
    ).resolves.toBeUndefined()

    expect(mockSendChannelConfigMessage).toHaveBeenCalledWith(
      ChannelConfigMessageTypes.UpsertFilters,
      {
        channelId: 15,
        resourceRef: sampleResourceRef,
        filters: sampleRules,
      },
    )
    expect(mockUpsertFilters).not.toHaveBeenCalled()
  })

  it("saves resource-aware requests through the runtime handler when available", async () => {
    mockSendChannelConfigMessage.mockResolvedValue({ success: true })

    await expect(
      saveChannelFilters(
        {
          channelId: 15,
          resourceRef: sampleResourceRef,
        },
        sampleRules,
      ),
    ).resolves.toBeUndefined()

    expect(mockSendChannelConfigMessage).toHaveBeenCalledWith(
      ChannelConfigMessageTypes.UpsertFilters,
      {
        channelId: 15,
        resourceRef: sampleResourceRef,
        filters: sampleRules,
      },
    )
    expect(mockUpsertFilters).not.toHaveBeenCalled()
  })

  it("falls back to local persistence when runtime saving fails", async () => {
    mockSendChannelConfigMessage.mockRejectedValue(
      new Error("Receiving end does not exist"),
    )
    mockUpsertFilters.mockResolvedValue(undefined)

    await expect(
      saveChannelFilters(
        { channelId: 19, resourceRef: sampleResourceRef },
        sampleRules,
      ),
    ).resolves.toBeUndefined()

    expect(mockUpsertFilters).toHaveBeenCalledWith(
      sampleResourceRef,
      sampleRules,
      { channelId: 19 },
    )
    expect(mockWarn).toHaveBeenCalledTimes(1)
  })

  it("falls back to resource-aware local persistence when runtime saving fails", async () => {
    mockSendChannelConfigMessage.mockRejectedValue(
      new Error("Receiving end does not exist"),
    )
    mockUpsertFilters.mockResolvedValue(undefined)

    await expect(
      saveChannelFilters(
        {
          channelId: 19,
          resourceRef: sampleResourceRef,
        },
        sampleRules,
      ),
    ).resolves.toBeUndefined()

    expect(mockUpsertFilters).toHaveBeenCalledWith(
      sampleResourceRef,
      sampleRules,
      { channelId: 19 },
    )
    expect(mockWarn).toHaveBeenCalledTimes(1)
  })

  it("throws explicit runtime save failures instead of falling back locally", async () => {
    mockSendChannelConfigMessage.mockResolvedValue({
      success: false,
      error: "save rejected",
    })

    await expect(
      saveChannelFilters(
        { channelId: 21, resourceRef: sampleResourceRef },
        sampleRules,
      ),
    ).rejects.toThrow("save rejected")

    expect(mockUpsertFilters).not.toHaveBeenCalled()
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it("throws when runtime is unavailable and local persistence fails", async () => {
    mockSendChannelConfigMessage.mockRejectedValue(
      new Error("Receiving end does not exist"),
    )
    mockUpsertFilters.mockRejectedValue(new Error("local write failed"))

    await expect(
      saveChannelFilters(
        { channelId: 21, resourceRef: sampleResourceRef },
        sampleRules,
      ),
    ).rejects.toThrow("local write failed")

    expect(mockUpsertFilters).toHaveBeenCalledWith(
      sampleResourceRef,
      sampleRules,
      { channelId: 21 },
    )
  })
})
