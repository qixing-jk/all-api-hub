import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance
} from "vitest"

import { ChannelType } from "~/constants/newApi.ts"
import type { NewApiChannel, NewApiChannelListData } from "~/types"

import {
  generateModelMapping,
  getCurrentMapping,
  getStandardModelSuggestions
} from "../mappingService"
import { modelRedirectStorage } from "../storage"

const listChannelsMock = vi.fn() as MockInstance<
  () => Promise<NewApiChannelListData>
>
const fetchChannelModelsMock = vi.fn() as MockInstance<() => Promise<string[]>>

vi.mock("~/services/newApiModelSync", () => {
  class MockNewApiModelSyncService {
    listChannels = listChannelsMock
    fetchChannelModels = fetchChannelModelsMock
  }

  return {
    NewApiModelSyncService: MockNewApiModelSyncService
  }
})

vi.mock("~/services/newApiService", () => ({
  getNewApiConfig: vi.fn().mockResolvedValue({
    baseUrl: "https://api.example.com",
    token: "token",
    userId: "1"
  })
}))

vi.mock("~/services/userPreferences", () => ({
  userPreferences: {
    getPreferences: vi.fn().mockResolvedValue({
      newApiModelSync: {
        rateLimit: {
          requestsPerMinute: 60,
          burst: 10
        }
      }
    })
  }
}))

describe("model redirect mapping service", () => {
  beforeEach(async () => {
    listChannelsMock.mockReset()
    fetchChannelModelsMock.mockReset()
    await modelRedirectStorage.clearMapping()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2024-04-10T00:00:00.000Z"))
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  const createChannel = (
    overrides: Partial<NewApiChannel> & { used_quota?: number }
  ) => {
    const channel: NewApiChannel = {
      id: overrides.id ?? 1,
      type: overrides.type ?? ChannelType.OpenAI,
      key: overrides.key ?? `key-${overrides.id ?? 1}`,
      name: overrides.name ?? `Channel ${overrides.id ?? 1}`,
      base_url: overrides.base_url ?? "https://channel.example.com",
      models: overrides.models ?? "",
      groups: overrides.groups ?? "default",
      status: overrides.status ?? 1,
      weight: overrides.weight ?? 0,
      priority: overrides.priority ?? 0
    }
    return { ...channel, used_quota: overrides.used_quota }
  }

  it("should generate deterministic mapping based on priority", async () => {
    listChannelsMock.mockResolvedValue({
      items: [
        createChannel({
          id: 1,
          name: "High Priority",
          priority: 10,
          weight: 1,
          models: "gpt-4o"
        }),
        createChannel({
          id: 2,
          name: "Lower Priority",
          priority: 5,
          weight: 10,
          models: "gpt-4o"
        })
      ],
      total: 2,
      type_counts: {}
    })

    fetchChannelModelsMock
      .mockResolvedValueOnce(["gpt-4o"])
      .mockResolvedValueOnce(["gpt-4o"])

    const result = await generateModelMapping({ trigger: "manual" })

    expect(result.metadata.trigger).toBe("manual")
    expect(result.metadata.channelCount).toBe(2)
    expect(result.metadata.mappingCount).toBe(1)

    const mappingEntry = result.mapping["gpt-4o"]
    expect(mappingEntry).toBeDefined()
    expect(mappingEntry?.targetChannelName).toBe("High Priority")
    expect(mappingEntry?.standardModel).toBe("gpt-4o")

    const stored = await getCurrentMapping()
    expect(stored).toEqual(result)
  })

  it("should ignore disabled channels", async () => {
    listChannelsMock.mockResolvedValue({
      items: [
        createChannel({
          id: 1,
          name: "Disabled",
          status: 2,
          models: "gpt-4o"
        }),
        createChannel({
          id: 2,
          name: "Enabled",
          status: 1,
          models: "gpt-4o"
        })
      ],
      total: 2,
      type_counts: {}
    })

    fetchChannelModelsMock
      .mockResolvedValueOnce(["gpt-4o"])
      .mockResolvedValueOnce(["gpt-4o"])

    const result = await generateModelMapping({ trigger: "auto" })

    expect(result.metadata.channelCount).toBe(1)
    expect(Object.keys(result.mapping)).toHaveLength(1)
    expect(result.mapping["gpt-4o"].targetChannelName).toBe("Enabled")
  })

  it("should prefer higher weight when priority equal", async () => {
    listChannelsMock.mockResolvedValue({
      items: [
        createChannel({
          id: 1,
          name: "Higher Weight",
          priority: 5,
          weight: 20,
          models: "gpt-4o"
        }),
        createChannel({
          id: 2,
          name: "Lower Weight",
          priority: 5,
          weight: 10,
          models: "gpt-4o"
        })
      ],
      total: 2,
      type_counts: {}
    })

    fetchChannelModelsMock
      .mockResolvedValueOnce(["gpt-4o"])
      .mockResolvedValueOnce(["gpt-4o"])

    const result = await generateModelMapping()
    expect(result.mapping["gpt-4o"].targetChannelName).toBe("Higher Weight")
  })

  it("should prefer lower used quota when priority and weight equal", async () => {
    listChannelsMock.mockResolvedValue({
      items: [
        createChannel({
          id: 1,
          name: "Higher Usage",
          priority: 5,
          weight: 10,
          models: "gpt-4o",
          used_quota: 200
        }),
        createChannel({
          id: 2,
          name: "Lower Usage",
          priority: 5,
          weight: 10,
          models: "gpt-4o",
          used_quota: 50
        })
      ],
      total: 2,
      type_counts: {}
    })

    fetchChannelModelsMock
      .mockResolvedValueOnce(["gpt-4o"])
      .mockResolvedValueOnce(["gpt-4o"])

    const result = await generateModelMapping()
    expect(result.mapping["gpt-4o"].targetChannelName).toBe("Lower Usage")
  })

  it("should use deterministic tiebreaker by date and name", async () => {
    listChannelsMock.mockResolvedValue({
      items: [
        createChannel({
          id: 1,
          name: "Older",
          priority: 5,
          weight: 10,
          models: "gpt-4o-2024-03-01"
        }),
        createChannel({
          id: 2,
          name: "Newer",
          priority: 5,
          weight: 10,
          models: "gpt-4o-2024-04-01"
        }),
        createChannel({
          id: 3,
          name: "Alphabetical",
          priority: 5,
          weight: 10,
          models: "gpt-4o-alpha"
        })
      ],
      total: 3,
      type_counts: {}
    })

    fetchChannelModelsMock
      .mockResolvedValueOnce(["gpt-4o-2024-03-01"])
      .mockResolvedValueOnce(["gpt-4o-2024-04-01"])
      .mockResolvedValueOnce(["gpt-4o-alpha"])

    const result = await generateModelMapping()
    const entry = result.mapping["gpt-4o-2024-04-01"] ?? result.mapping["gpt-4o"]

    expect(entry?.targetChannelName).toBe("Newer")
  })

  it("should return empty mapping when no candidates", async () => {
    listChannelsMock.mockResolvedValue({
      items: [createChannel({ id: 1, models: "" })],
      total: 1,
      type_counts: {}
    })

    fetchChannelModelsMock.mockResolvedValueOnce([])

    const result = await generateModelMapping()
    expect(Object.keys(result.mapping)).toHaveLength(0)
  })

  it("should throw descriptive error when New API config missing", async () => {
    const getNewApiConfig = (await import("~/services/newApiService")).getNewApiConfig
    ;(getNewApiConfig as any).mockResolvedValueOnce(null)

    await expect(generateModelMapping()).rejects.toThrow(
      /New API configuration is missing/
    )
  })

  it("should handle errors when fetching channels", async () => {
    listChannelsMock.mockRejectedValueOnce(new Error("network"))

    await expect(generateModelMapping()).rejects.toThrow(
      /Failed to fetch channel list/
    )
  })

  it("should provide standard model suggestions", async () => {
    listChannelsMock.mockResolvedValue({
      items: [
        createChannel({ id: 1, models: "gpt-4o,gpt-4o-mini" }),
        createChannel({ id: 2, models: "gpt-4o,claude-3-sonnet" })
      ],
      total: 2,
      type_counts: {}
    })

    fetchChannelModelsMock
      .mockResolvedValueOnce(["gpt-4o", "gpt-4o-mini"])
      .mockResolvedValueOnce(["gpt-4o", "claude-3-sonnet"])

    const suggestions = await getStandardModelSuggestions()
    expect(suggestions).toEqual(["claude-3-sonnet", "gpt-4o", "gpt-4o-mini"])
  })

  it("should gracefully handle suggestion errors", async () => {
    listChannelsMock.mockRejectedValueOnce(new Error("network"))

    const suggestions = await getStandardModelSuggestions()
    expect(suggestions).toEqual([])
  })
})
