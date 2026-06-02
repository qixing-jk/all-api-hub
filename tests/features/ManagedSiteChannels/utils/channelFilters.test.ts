import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  fetchChannelFilters,
  saveChannelFilters,
} from "~/features/ManagedSiteChannels/utils/channelFilters"
import { ChannelConfigMessageTypes } from "~/services/managedSites/channelConfigMessaging"
import type { ChannelModelFilterRule } from "~/types/channelModelFilters"

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

    await expect(fetchChannelFilters(9)).resolves.toEqual(sampleRules)

    expect(mockSendChannelConfigMessage).toHaveBeenCalledWith(
      ChannelConfigMessageTypes.Get,
      { channelId: 9 },
    )
    expect(mockGetConfig).not.toHaveBeenCalled()
  })

  it("throws explicit runtime load failures instead of falling back to local storage", async () => {
    mockSendChannelConfigMessage.mockResolvedValue({
      success: false,
      error: "runtime unavailable",
    })

    await expect(fetchChannelFilters(11)).rejects.toThrow("runtime unavailable")

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

    await expect(fetchChannelFilters(11)).resolves.toEqual(sampleRules)

    expect(mockGetConfig).toHaveBeenCalledWith(11)
    expect(mockWarn).toHaveBeenCalledTimes(1)
  })

  it("saves through the runtime handler when available", async () => {
    mockSendChannelConfigMessage.mockResolvedValue({ success: true })

    await expect(saveChannelFilters(15, sampleRules)).resolves.toBeUndefined()

    expect(mockSendChannelConfigMessage).toHaveBeenCalledWith(
      ChannelConfigMessageTypes.UpsertFilters,
      {
        channelId: 15,
        filters: sampleRules,
      },
    )
    expect(mockUpsertFilters).not.toHaveBeenCalled()
  })

  it("falls back to local persistence when runtime saving fails", async () => {
    mockSendChannelConfigMessage.mockRejectedValue(
      new Error("Receiving end does not exist"),
    )
    mockUpsertFilters.mockResolvedValue(true)

    await expect(saveChannelFilters(19, sampleRules)).resolves.toBeUndefined()

    expect(mockUpsertFilters).toHaveBeenCalledWith(19, sampleRules)
    expect(mockWarn).toHaveBeenCalledTimes(1)
  })

  it("throws explicit runtime save failures instead of falling back locally", async () => {
    mockSendChannelConfigMessage.mockResolvedValue({
      success: false,
      error: "save rejected",
    })

    await expect(saveChannelFilters(21, sampleRules)).rejects.toThrow(
      "save rejected",
    )

    expect(mockUpsertFilters).not.toHaveBeenCalled()
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it("throws when runtime is unavailable and local persistence fails", async () => {
    mockSendChannelConfigMessage.mockRejectedValue(
      new Error("Receiving end does not exist"),
    )
    mockUpsertFilters.mockResolvedValue(false)

    await expect(saveChannelFilters(21, sampleRules)).rejects.toThrow(
      "Failed to persist filters locally",
    )

    expect(mockUpsertFilters).toHaveBeenCalledWith(21, sampleRules)
  })
})
