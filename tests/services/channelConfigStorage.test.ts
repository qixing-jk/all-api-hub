import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  channelConfigStorage,
  handleChannelConfigMessage,
} from "~/services/managedSites/channelConfigStorage"

const storageData = new Map<string, any>()

const { mockSafeRandomUUID } = vi.hoisted(() => ({
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
  }

  return { Storage }
})

vi.mock("~/utils/core/identifier", () => ({
  safeRandomUUID: mockSafeRandomUUID,
}))

describe("channelConfigStorage", () => {
  beforeEach(() => {
    storageData.clear()
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-03-28T05:30:00.000Z"))
  })

  it("returns a default config when a channel has no stored entry", async () => {
    const config = await channelConfigStorage.getConfig(42)

    expect(config.channelId).toBe(42)
    expect(config.modelFilterSettings.rules).toEqual([])
    expect(config.createdAt).toBe(Date.now())
    expect(config.updatedAt).toBe(Date.now())
  })

  it("saves configs with a refreshed updatedAt timestamp", async () => {
    storageData.set("channel_configs", {
      7: {
        channelId: 7,
        createdAt: 10,
        updatedAt: 10,
        modelFilterSettings: {
          rules: [],
          updatedAt: 10,
        },
      },
    })

    const ok = await channelConfigStorage.saveConfig({
      channelId: 9,
      createdAt: 100,
      updatedAt: 100,
      modelFilterSettings: {
        rules: [],
        updatedAt: 100,
      },
    })

    expect(ok).toBe(true)
    expect(storageData.get("channel_configs")).toEqual({
      7: expect.objectContaining({ channelId: 7 }),
      9: expect.objectContaining({
        channelId: 9,
        createdAt: 100,
        updatedAt: Date.now(),
      }),
    })
  })

  it("imports configs by sanitizing invalid keys, legacy filters, and malformed rules", async () => {
    const count = await channelConfigStorage.importConfigs({
      1: {
        createdAt: 5,
        filters: [
          {
            name: " Legacy Include ",
            pattern: "gpt-4o",
            isRegex: false,
            action: "include",
            enabled: true,
          },
          null,
        ],
      },
      2: {
        modelFilterSettings: {
          updatedAt: 0,
          rules: [
            {
              id: " explicit-id ",
              name: " Block Legacy ",
              description: "  trimmed description  ",
              pattern: "^claude",
              isRegex: true,
              action: "exclude",
              enabled: false,
              createdAt: 123,
              updatedAt: 456,
            },
            {
              name: " ",
              pattern: "ignored",
            },
          ],
        },
      },
      broken: {
        createdAt: 1,
      },
      "-3": {
        createdAt: 1,
      },
    })

    expect(count).toBe(2)

    const imported = await channelConfigStorage.getAllConfigs()
    expect(Object.keys(imported)).toEqual(["1", "2"])
    expect(imported[1]).toEqual(
      expect.objectContaining({
        channelId: 1,
        createdAt: 5,
        updatedAt: Date.now(),
        modelFilterSettings: {
          updatedAt: Date.now(),
          rules: [
            expect.objectContaining({
              id: "generated-filter-id",
              name: "Legacy Include",
              pattern: "gpt-4o",
              action: "include",
              enabled: true,
            }),
          ],
        },
      }),
    )
    expect(imported[2].modelFilterSettings.rules).toEqual([
      {
        id: "explicit-id",
        name: "Block Legacy",
        description: "trimmed description",
        kind: "pattern",
        pattern: "^claude",
        isRegex: true,
        action: "exclude",
        enabled: false,
        createdAt: 123,
        updatedAt: 456,
      },
    ])
  })

  it("drops non-object imported filter entries instead of crashing import", async () => {
    const count = await channelConfigStorage.importConfigs({
      12: {
        modelFilterSettings: {
          rules: [
            {
              name: "Keep GPT",
              pattern: "gpt",
              isRegex: false,
              action: "include",
              enabled: true,
            },
            42 as any,
          ],
        },
      },
    })

    expect(count).toBe(1)

    const imported = await channelConfigStorage.getAllConfigs()
    expect(imported[12].modelFilterSettings.rules).toEqual([
      expect.objectContaining({
        name: "Keep GPT",
        kind: "pattern",
      }),
    ])
  })

  it("upserts filters while preserving existing createdAt", async () => {
    storageData.set("channel_configs", {
      9: {
        channelId: 9,
        createdAt: 111,
        updatedAt: 222,
        modelFilterSettings: {
          rules: [],
          updatedAt: 222,
        },
      },
    })

    const ok = await channelConfigStorage.upsertFilters(9, [
      {
        id: "rule-1",
        name: "Allow GPT",
        pattern: "gpt",
        isRegex: false,
        action: "include",
        enabled: true,
        createdAt: 50,
        updatedAt: 60,
      },
    ])

    expect(ok).toBe(true)
    expect(storageData.get("channel_configs")[9]).toEqual(
      expect.objectContaining({
        channelId: 9,
        createdAt: 111,
        updatedAt: Date.now(),
        modelFilterSettings: {
          updatedAt: Date.now(),
          rules: [
            expect.objectContaining({
              id: "rule-1",
              name: "Allow GPT",
            }),
          ],
        },
      }),
    )
  })

  it("creates missing filter settings and falls back to the current timestamp when createdAt is invalid", async () => {
    storageData.set("channel_configs", {
      15: {
        channelId: 15,
        createdAt: 0,
        updatedAt: 0,
      },
    })

    const ok = await channelConfigStorage.upsertFilters(15, [
      {
        id: "rule-2",
        name: "Exclude Claude",
        pattern: "claude",
        isRegex: false,
        action: "exclude",
        enabled: false,
        createdAt: 1,
        updatedAt: 2,
      },
    ])

    expect(ok).toBe(true)
    expect(storageData.get("channel_configs")[15]).toEqual({
      channelId: 15,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      modelFilterSettings: {
        rules: [
          expect.objectContaining({
            id: "rule-2",
            action: "exclude",
            enabled: false,
          }),
        ],
        updatedAt: Date.now(),
      },
    })
  })

  it("returns empty configs and false saves when storage operations fail", async () => {
    const storage = (channelConfigStorage as any).storage
    const getSpy = vi
      .spyOn(storage, "get")
      .mockRejectedValueOnce(new Error("read failed"))
    const setSpy = vi
      .spyOn(storage, "set")
      .mockRejectedValueOnce(new Error("write failed"))

    await expect(channelConfigStorage.getAllConfigs()).resolves.toEqual({})
    await expect(
      channelConfigStorage.saveConfig({
        channelId: 99,
        createdAt: 1,
        updatedAt: 1,
        modelFilterSettings: {
          rules: [],
          updatedAt: 1,
        },
      }),
    ).resolves.toBe(false)

    getSpy.mockRestore()
    setSpy.mockRestore()
  })

  it("handles get and upsert runtime messages", async () => {
    const getResponse = vi.fn()
    await handleChannelConfigMessage(
      {
        action: RuntimeActionIds.ChannelConfigGet,
        channelId: 12,
      },
      getResponse,
    )

    expect(getResponse).toHaveBeenCalledWith({
      success: true,
      data: expect.objectContaining({ channelId: 12 }),
    })

    const upsertResponse = vi.fn()
    await handleChannelConfigMessage(
      {
        action: RuntimeActionIds.ChannelConfigUpsertFilters,
        channelId: 12,
        filters: [
          {
            name: " Include GPT ",
            pattern: "gpt",
            isRegex: false,
            enabled: true,
          },
        ],
      },
      upsertResponse,
    )

    expect(upsertResponse).toHaveBeenCalledWith({
      success: true,
      data: [
        expect.objectContaining({
          id: "generated-filter-id",
          name: "Include GPT",
          pattern: "gpt",
          action: "include",
          enabled: true,
        }),
      ],
    })
  })

  it("sanitizes empty imports and preserves explicit rule timestamps when provided", async () => {
    await expect(channelConfigStorage.importConfigs(null)).resolves.toBe(0)
    expect(storageData.get("channel_configs")).toEqual({})

    const count = await channelConfigStorage.importConfigs({
      8: {
        updatedAt: 999,
        modelFilterSettings: {
          updatedAt: 777,
          rules: [
            {
              id: " kept-id ",
              name: " Keep GPT ",
              pattern: " gpt ",
              isRegex: false,
              action: "unsupported",
              enabled: undefined,
              createdAt: 555,
              updatedAt: 666,
            },
          ],
        },
      },
    })

    expect(count).toBe(1)
    expect(storageData.get("channel_configs")[8]).toEqual({
      channelId: 8,
      createdAt: Date.now(),
      updatedAt: 999,
      modelFilterSettings: {
        updatedAt: 777,
        rules: [
          {
            id: "kept-id",
            name: "Keep GPT",
            description: undefined,
            kind: "pattern",
            pattern: "gpt",
            isRegex: false,
            action: "include",
            enabled: true,
            createdAt: 555,
            updatedAt: 666,
          },
        ],
      },
    })
  })

  it("rejects invalid message payloads and unknown actions", async () => {
    const invalidIdResponse = vi.fn()
    await handleChannelConfigMessage(
      {
        action: RuntimeActionIds.ChannelConfigGet,
        channelId: 0,
      },
      invalidIdResponse,
    )
    expect(invalidIdResponse).toHaveBeenCalledWith({
      success: false,
      error: "channelId is required",
    })

    const invalidRegexResponse = vi.fn()
    await handleChannelConfigMessage(
      {
        action: RuntimeActionIds.ChannelConfigUpsertFilters,
        channelId: 12,
        filters: [
          {
            name: "Broken Regex",
            pattern: "[",
            isRegex: true,
          },
        ],
      },
      invalidRegexResponse,
    )
    expect(invalidRegexResponse).toHaveBeenCalledWith({
      success: false,
      error: expect.stringContaining("Invalid regex pattern"),
    })

    const unknownActionResponse = vi.fn()
    await handleChannelConfigMessage(
      { action: "channelConfig:unknown" },
      unknownActionResponse,
    )
    expect(unknownActionResponse).toHaveBeenCalledWith({
      success: false,
      error: "Unknown action",
    })
  })

  it("normalizes probe rules and drops imported credential fields", async () => {
    const count = await channelConfigStorage.importConfigs({
      3: {
        modelFilterSettings: {
          rules: [
            {
              id: "probe-id",
              kind: "probe",
              name: "Text capable",
              description: "  requires chat  ",
              action: "include",
              enabled: true,
              probeIds: ["text-generation", "text-generation", "unknown-probe"],
              match: "all",
              apiKey: "sk-should-not-persist",
              key: "sk-channel",
              baseUrl: "https://manual.example.com",
              createdAt: 10,
              updatedAt: 20,
            },
            {
              kind: "probe",
              name: "Invalid",
              probeIds: [],
            },
          ],
        },
      },
    })

    expect(count).toBe(1)
    const imported = await channelConfigStorage.getAllConfigs()
    expect(imported[3].modelFilterSettings.rules).toEqual([
      {
        id: "probe-id",
        kind: "probe",
        name: "Text capable",
        description: "requires chat",
        action: "include",
        enabled: true,
        probeIds: ["text-generation"],
        match: "all",
        createdAt: 10,
        updatedAt: 20,
      },
    ])
  })

  it("surfaces non-array and missing-field filter validation errors through the message handler", async () => {
    const nonArrayResponse = vi.fn()
    await handleChannelConfigMessage(
      {
        action: RuntimeActionIds.ChannelConfigUpsertFilters,
        channelId: 12,
        filters: "not-an-array",
      },
      nonArrayResponse,
    )
    expect(nonArrayResponse).toHaveBeenCalledWith({
      success: false,
      error: "Filters must be an array",
    })

    const missingPatternResponse = vi.fn()
    await handleChannelConfigMessage(
      {
        action: RuntimeActionIds.ChannelConfigUpsertFilters,
        channelId: 12,
        filters: [
          {
            name: "Missing Pattern",
            pattern: "   ",
          },
        ],
      },
      missingPatternResponse,
    )
    expect(missingPatternResponse).toHaveBeenCalledWith({
      success: false,
      error: "Filter pattern is required",
    })
  })
})
