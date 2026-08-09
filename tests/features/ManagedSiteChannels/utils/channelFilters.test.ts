import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchChannelFilters,
  saveChannelFilters,
} from "~/features/ManagedSiteChannels/utils/channelFilters"
import { ChannelConfigMessageTypes } from "~/services/managedSites/channelConfigMessaging"
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
  "~/services/managedSites/channelConfigMessaging",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/managedSites/channelConfigMessaging")
      >()
    return {
      ...actual,
      sendChannelConfigMessage: mockSendChannelConfigMessage,
    }
  },
)

vi.mock("~/services/managedSites/channelConfigStorage", () => ({
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
      fetchChannelFilters({ channelId: 9, resourceRef: sampleResourceRef }),
    ).resolves.toEqual(sampleRules)

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
      fetchChannelFilters({
        channelId: 9,
        resourceRef: sampleResourceRef,
      }),
    ).resolves.toEqual(sampleRules)

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
      fetchChannelFilters({ channelId: 11, resourceRef: sampleResourceRef }),
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
      fetchChannelFilters({ channelId: 11, resourceRef: sampleResourceRef }),
    ).resolves.toEqual(sampleRules)

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
      fetchChannelFilters({
        channelId: 11,
        resourceRef: sampleResourceRef,
      }),
    ).resolves.toEqual(sampleRules)

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
      19,
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
      19,
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
      21,
    )
  })
})
