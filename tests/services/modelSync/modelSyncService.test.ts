import { beforeEach, describe, expect, it, vi } from "vitest"

import { ChannelType } from "~/constants/newApi"
import { VELOERA } from "~/constants/siteType"
import { getApiService } from "~/services/apiService"
import { matchesProbeFilterRule } from "~/services/models/modelSync/channelModelFilterEvaluator"
import { ModelSyncService } from "~/services/models/modelSync/modelSyncService"
import type {
  ChannelModelFilterRule,
  ChannelModelPatternFilterRule,
  ChannelModelProbeFilterRule,
} from "~/types/channelModelFilters"

const {
  listAllChannelsMock,
  fetchChannelModelsMock,
  updateChannelModelsMock,
  updateChannelModelMappingMock,
  fetchChannelSecretKeyMock,
  getManagedSiteServiceForTypeMock,
  runApiVerificationProbeMock,
} = vi.hoisted(() => ({
  listAllChannelsMock: vi.fn(),
  fetchChannelModelsMock: vi.fn(),
  updateChannelModelsMock: vi.fn(),
  updateChannelModelMappingMock: vi.fn(),
  fetchChannelSecretKeyMock: vi.fn(),
  getManagedSiteServiceForTypeMock: vi.fn(),
  runApiVerificationProbeMock: vi.fn(),
}))

vi.mock("~/services/apiService", () => ({
  getApiService: vi.fn(() => ({
    listAllChannels: listAllChannelsMock,
    fetchChannelModels: fetchChannelModelsMock,
    updateChannelModels: updateChannelModelsMock,
    updateChannelModelMapping: updateChannelModelMappingMock,
  })),
}))

vi.mock("~/services/managedSites/managedSiteService", () => ({
  getManagedSiteServiceForType: getManagedSiteServiceForTypeMock,
}))

vi.mock("~/services/verification/aiApiVerification", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/verification/aiApiVerification")
    >()
  return {
    ...actual,
    runApiVerificationProbe: runApiVerificationProbeMock,
  }
})

const makeFilterRule = (
  partial: Partial<ChannelModelPatternFilterRule>,
): ChannelModelFilterRule => ({
  id: partial.id ?? "id",
  kind: "pattern",
  name: partial.name ?? "rule",
  pattern: partial.pattern ?? "",
  isRegex: partial.isRegex ?? false,
  action: partial.action ?? "include",
  enabled: partial.enabled ?? true,
  createdAt: partial.createdAt ?? Date.now(),
  updatedAt: partial.updatedAt ?? Date.now(),
  description: partial.description,
})

const makeProbeRule = (
  partial: Partial<ChannelModelProbeFilterRule> = {},
): ChannelModelProbeFilterRule => ({
  id: partial.id ?? "probe-rule",
  kind: "probe",
  name: partial.name ?? "probe rule",
  probeIds: partial.probeIds ?? ["text-generation"],
  match: partial.match ?? "all",
  action: partial.action ?? "include",
  enabled: partial.enabled ?? true,
  createdAt: partial.createdAt ?? Date.now(),
  updatedAt: partial.updatedAt ?? Date.now(),
  description: partial.description,
})

beforeEach(() => {
  vi.clearAllMocks()
  getManagedSiteServiceForTypeMock.mockReturnValue({
    fetchChannelSecretKey: fetchChannelSecretKeyMock,
  })
  fetchChannelSecretKeyMock.mockResolvedValue("sk-resolved-channel-key")
  runApiVerificationProbeMock.mockResolvedValue({
    id: "text-generation",
    status: "pass",
    latencyMs: 1,
    summary: "ok",
  })
})

describe("ModelSyncService - allowed model filtering", () => {
  const createService = (allowed?: string[]) =>
    new ModelSyncService(
      "https://example.com",
      "dummy-token",
      "1",
      undefined,
      allowed,
    )

  const callFilter = (service: ModelSyncService, models: string[]) =>
    (service as any).filterAllowedModels(models) as string[]

  it("returns trimmed unique models when no allow-list exists", () => {
    const service = createService()

    const result = callFilter(service, [
      "  gpt-4o  ",
      "gpt-4o",
      "claude-3",
      "  ",
    ])

    expect(result).toEqual(["gpt-4o", "claude-3"])
  })

  it("filters models using the configured allow-list", () => {
    const service = createService(["gpt-4o", "claude-3"])

    const result = callFilter(service, [
      " gpt-4o  ",
      "gpt-4o-mini",
      "claude-3",
      "unknown-model",
    ])

    expect(result).toEqual(["gpt-4o", "claude-3"])
  })

  it("deduplicates after filtering", () => {
    const service = createService(["gpt-4o"])

    const result = callFilter(service, ["gpt-4o", " gpt-4o  ", "gpt-4o"])

    expect(result).toEqual(["gpt-4o"])
  })
})

describe("ModelSyncService - siteType routing", () => {
  it("forwards ManagedSiteType hint to apiService listAllChannels", async () => {
    listAllChannelsMock.mockResolvedValue({
      items: [],
      total: 0,
      type_counts: {},
    })

    const service = new ModelSyncService(
      "https://example.com",
      "token",
      "1",
      undefined,
      undefined,
      undefined,
      undefined,
      VELOERA,
    )

    await service.listChannels()

    expect(getApiService).toHaveBeenCalledWith(VELOERA)
    expect(listAllChannelsMock).toHaveBeenCalled()
  })
})

describe("ModelSyncService - global and channel filters", () => {
  const baseModels = ["gpt-4o", "gpt-4o-mini", "claude-3", "local-debug-model"]

  const callApplyFilters = (
    rules: ChannelModelFilterRule[] | null | undefined,
    models: string[],
  ): Promise<string[]> => {
    const service = new ModelSyncService("https://example.com", "token")
    return (service as any).applyFilters(rules, models)
  }

  it("returns normalized models when no filters are provided", async () => {
    const result = await callApplyFilters(undefined, [" gpt-4o ", "gpt-4o", ""])
    expect(result).toEqual(["gpt-4o"])
  })

  it("applies include-then-exclude logic correctly", async () => {
    const rules: ChannelModelFilterRule[] = [
      makeFilterRule({
        id: "include-openai",
        name: "Include GPT-4 family",
        pattern: "gpt-4o",
        isRegex: false,
        action: "include",
      }),
      makeFilterRule({
        id: "exclude-mini",
        name: "Exclude mini",
        pattern: "mini",
        isRegex: false,
        action: "exclude",
      }),
    ]

    const result = await callApplyFilters(rules, baseModels)
    expect(result).toEqual(["gpt-4o"])
  })

  it("supports regex patterns in filters", async () => {
    const rules: ChannelModelFilterRule[] = [
      makeFilterRule({
        id: "include-gpt",
        name: "Include GPT*",
        pattern: "^gpt-",
        isRegex: true,
        action: "include",
      }),
    ]

    const result = await callApplyFilters(rules, baseModels)
    expect(result.sort()).toEqual(["gpt-4o", "gpt-4o-mini"].sort())
  })

  it("returns an empty result when regex filters are invalid", async () => {
    const rules: ChannelModelFilterRule[] = [
      makeFilterRule({
        id: "broken",
        pattern: "[",
        isRegex: true,
        action: "include",
      }),
    ]

    const result = await callApplyFilters(rules, baseModels)
    expect(result).toEqual([])
  })
})

describe("ModelSyncService - channel execution", () => {
  it("invokes the configured rate limiter before channel listing callbacks run", async () => {
    const acquire = vi.fn().mockResolvedValue(undefined)
    listAllChannelsMock.mockImplementation(async (_ctx, options) => {
      await options.beforeRequest?.()
      return {
        items: [],
        total: 0,
        type_counts: {},
      }
    })

    const service = new ModelSyncService("https://example.com", "token", "1")
    ;(service as any).rateLimiter = { acquire }

    await service.listChannels()

    expect(acquire).toHaveBeenCalledTimes(1)
  })

  it("skips channel updates when the normalized model set is unchanged", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce([" model-b ", "model-a"])

    const service = new ModelSyncService("https://example.com", "token", "1")
    const channel = {
      id: 1,
      name: "Alpha",
      models: "model-a,model-b",
    } as any

    const result = await service.runForChannel(channel, 0)

    expect(result).toMatchObject({
      channelId: 1,
      channelName: "Alpha",
      ok: true,
      oldModels: ["model-a", "model-b"],
      newModels: ["model-b", "model-a"],
      message: "Success",
    })
    expect(updateChannelModelsMock).not.toHaveBeenCalled()
  })

  it("composes global and channel filters before updating changed models", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce([
      "gpt-4o",
      "gpt-4o-mini",
      "claude-3",
    ])

    const service = new ModelSyncService(
      "https://example.com",
      "token",
      "1",
      undefined,
      undefined,
      undefined,
      [
        makeFilterRule({
          id: "exclude-mini",
          action: "exclude",
          pattern: "mini",
        }),
      ],
    )
    service.setChannelConfigs({
      7: {
        modelFilterSettings: {
          rules: [
            makeFilterRule({
              id: "include-claude",
              action: "include",
              pattern: "claude",
            }),
          ],
        },
      },
    } as any)

    const channel = {
      id: 7,
      name: "Scoped",
      models: "gpt-4o",
    } as any

    const result = await service.runForChannel(channel, 0)

    expect(updateChannelModelsMock).toHaveBeenCalledWith(
      expect.anything(),
      7,
      "claude-3",
    )
    expect(channel.models).toBe("claude-3")
    expect(result).toMatchObject({
      channelId: 7,
      ok: true,
      oldModels: ["gpt-4o"],
      newModels: ["claude-3"],
    })
  })

  it("clears stored models when the upstream response only contains blank entries", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce([" ", "", "   "])

    const service = new ModelSyncService("https://example.com", "token", "1")
    const channel = {
      id: 8,
      name: "Blank Upstream",
      models: "gpt-4o",
    } as any

    const result = await service.runForChannel(channel, 0)

    expect(updateChannelModelsMock).toHaveBeenCalledWith(
      expect.anything(),
      8,
      "",
    )
    expect(channel.models).toBe("")
    expect(result).toMatchObject({
      channelId: 8,
      ok: true,
      oldModels: ["gpt-4o"],
      newModels: [],
    })
  })

  it("retries failed channel fetches and returns a terminal failure after max retries", async () => {
    vi.useFakeTimers()
    fetchChannelModelsMock.mockRejectedValue(new Error("upstream failed"))

    const service = new ModelSyncService("https://example.com", "token", "1")
    const channel = {
      id: 2,
      name: "Beta",
      models: "gpt-4o",
    } as any

    try {
      const resultPromise = service.runForChannel(channel, 1)
      await vi.runAllTimersAsync()
      const result = await resultPromise

      expect(fetchChannelModelsMock).toHaveBeenCalledTimes(2)
      expect(result).toMatchObject({
        channelId: 2,
        channelName: "Beta",
        ok: false,
        attempts: 2,
        message: "upstream failed",
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("falls back to an unknown error message when terminal failures have no message", async () => {
    fetchChannelModelsMock.mockRejectedValue({
      httpStatus: 503,
    })

    const service = new ModelSyncService("https://example.com", "token", "1")
    const channel = {
      id: 9,
      name: "Status Only",
      models: "gpt-4o",
    } as any

    const result = await service.runForChannel(channel, 0)

    expect(result).toMatchObject({
      channelId: 9,
      ok: false,
      httpStatus: 503,
      attempts: 1,
      message: "Unknown error",
      oldModels: ["gpt-4o"],
    })
  })
})

describe("ModelSyncService - probe-backed filters", () => {
  it("passes channel credentials and model ids to selected probes", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce(["model-a", "model-b"])
    runApiVerificationProbeMock.mockImplementation(async ({ modelId }) => ({
      id: "text-generation",
      status: modelId === "model-a" ? "pass" : "fail",
      latencyMs: 1,
      summary: "ok",
    }))

    const service = new ModelSyncService(
      "https://managed.example.com",
      "admin-token",
      "1",
      undefined,
      undefined,
      undefined,
      [makeProbeRule()],
    )
    const channel = {
      id: 77,
      name: "Probe Channel",
      type: ChannelType.OpenAI,
      base_url: "https://channel.example.com",
      key: "sk-channel-key",
      models: "model-a,model-b",
    } as any

    const result = await service.runForChannel(channel, 0)

    expect(runApiVerificationProbeMock).toHaveBeenCalledWith({
      baseUrl: "https://channel.example.com",
      apiKey: "sk-channel-key",
      apiType: "openai-compatible",
      modelId: "model-a",
      probeId: "text-generation",
      abortSignal: expect.any(AbortSignal),
    })
    expect(runApiVerificationProbeMock).toHaveBeenCalledWith({
      baseUrl: "https://channel.example.com",
      apiKey: "sk-channel-key",
      apiType: "openai-compatible",
      modelId: "model-b",
      probeId: "text-generation",
      abortSignal: expect.any(AbortSignal),
    })
    expect(updateChannelModelsMock).toHaveBeenCalledWith(
      expect.anything(),
      77,
      "model-a",
    )
    expect(result).toMatchObject({
      ok: true,
      newModels: ["model-a"],
    })
  })

  it("resolves hidden channel keys through the managed-site provider", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce(["model-a"])

    const service = new ModelSyncService(
      "https://managed.example.com",
      "admin-token",
      "1",
      undefined,
      undefined,
      undefined,
      [makeProbeRule()],
    )
    const channel = {
      id: 78,
      name: "Hidden Key",
      type: ChannelType.OpenAI,
      base_url: "https://channel.example.com",
      key: "",
      models: "",
    } as any

    await service.runForChannel(channel, 0)

    expect(fetchChannelSecretKeyMock).toHaveBeenCalledWith(
      "https://managed.example.com",
      "admin-token",
      "1",
      78,
    )
    expect(runApiVerificationProbeMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "sk-resolved-channel-key",
        modelId: "model-a",
        abortSignal: expect.any(AbortSignal),
      }),
    )
  })

  it("caches duplicate probe checks across global and channel rules", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce(["model-a", "model-b"])

    const duplicateRule = makeProbeRule({ id: "duplicate" })
    const service = new ModelSyncService(
      "https://managed.example.com",
      "admin-token",
      "1",
      undefined,
      undefined,
      undefined,
      [duplicateRule],
    )
    service.setChannelConfigs({
      79: {
        modelFilterSettings: {
          rules: [makeProbeRule({ id: "channel-duplicate" })],
        },
      },
    } as any)

    const channel = {
      id: 79,
      name: "Cached",
      type: ChannelType.OpenAI,
      base_url: "https://channel.example.com",
      key: "sk-channel-key",
      models: "",
    } as any

    await service.runForChannel(channel, 0)

    expect(runApiVerificationProbeMock).toHaveBeenCalledTimes(2)
  })

  it("does not update models when probe filtering cannot resolve a hidden key", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce(["model-a"])
    getManagedSiteServiceForTypeMock.mockReturnValue({})

    const service = new ModelSyncService(
      "https://managed.example.com",
      "admin-token",
      "1",
      undefined,
      undefined,
      undefined,
      [makeProbeRule()],
    )
    const channel = {
      id: 80,
      name: "Unsupported Provider",
      type: ChannelType.OpenAI,
      base_url: "https://channel.example.com",
      key: "",
      models: "model-a",
    } as any

    const result = await service.runForChannel(channel, 0)

    expect(result).toMatchObject({
      ok: false,
      oldModels: ["model-a"],
    })
    expect(updateChannelModelsMock).not.toHaveBeenCalled()
    expect(runApiVerificationProbeMock).not.toHaveBeenCalled()
  })

  it("does not update models for unsupported channel types", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce(["model-a"])

    const service = new ModelSyncService(
      "https://managed.example.com",
      "admin-token",
      "1",
      undefined,
      undefined,
      undefined,
      [makeProbeRule()],
    )
    const channel = {
      id: 81,
      name: "Unsupported Type",
      type: ChannelType.Midjourney,
      base_url: "https://channel.example.com",
      key: "sk-channel-key",
      models: "model-a",
    } as any

    const result = await service.runForChannel(channel, 0)

    expect(result).toMatchObject({
      ok: false,
      message: "Probe filtering is unsupported for this channel type.",
    })
    expect(updateChannelModelsMock).not.toHaveBeenCalled()
    expect(runApiVerificationProbeMock).not.toHaveBeenCalled()
  })

  it("keeps key-resolution failure messages secret-safe", async () => {
    fetchChannelModelsMock.mockResolvedValueOnce(["model-a"])
    fetchChannelSecretKeyMock.mockRejectedValueOnce(
      new Error("failed with admin-token sk-hidden-channel-key 123456"),
    )

    const service = new ModelSyncService(
      "https://managed.example.com",
      "admin-token",
      "1",
      undefined,
      undefined,
      undefined,
      [makeProbeRule()],
    )
    const channel = {
      id: 82,
      name: "Secret Safe",
      type: ChannelType.OpenAI,
      base_url: "https://channel.example.com",
      key: "",
      models: "model-a",
    } as any

    const result = await service.runForChannel(channel, 0)

    expect(result.message).not.toContain("admin-token")
    expect(result.message).not.toContain("sk-hidden-channel-key")
    expect(result.message).not.toContain("123456")
    expect(updateChannelModelsMock).not.toHaveBeenCalled()
  })

  it("resolves a hidden key only once across repeated probe evaluations", async () => {
    const context = {
      channel: {
        id: 90,
        type: ChannelType.OpenAI,
        base_url: "https://channel.example.com",
        key: "",
      },
      siteType: VELOERA,
      managedSiteBaseUrl: "https://managed.example.com",
      adminToken: "admin-token",
      userId: "1",
      cache: new Map<string, boolean>(),
    } as any

    await matchesProbeFilterRule(makeProbeRule(), "model-a", context)
    await matchesProbeFilterRule(
      makeProbeRule({ id: "other-rule" }),
      "model-b",
      context,
    )

    expect(fetchChannelSecretKeyMock).toHaveBeenCalledTimes(1)
  })

  it("treats empty probe rules as non-matches", async () => {
    const context = {
      channel: {
        id: 91,
        type: ChannelType.OpenAI,
        base_url: "https://channel.example.com",
        key: "sk-channel-key",
      },
      siteType: VELOERA,
      managedSiteBaseUrl: "https://managed.example.com",
      adminToken: "admin-token",
      cache: new Map<string, boolean>(),
    } as any

    await expect(
      matchesProbeFilterRule(
        makeProbeRule({ probeIds: [] }),
        "model-a",
        context,
      ),
    ).resolves.toBe(false)

    expect(runApiVerificationProbeMock).not.toHaveBeenCalled()
  })
})

describe("ModelSyncService - batching and mapping", () => {
  it("returns empty statistics without progress callbacks when no channels are provided", async () => {
    const service = new ModelSyncService("https://example.com", "token", "1")
    const onProgress = vi.fn()

    const result = await service.runBatch([], {
      concurrency: 0,
      maxRetries: 0,
      onProgress,
    })

    expect(onProgress).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      items: [],
      statistics: {
        total: 0,
        successCount: 0,
        failureCount: 0,
      },
    })
  })

  it("records failures when a worker throws unexpectedly during batch execution", async () => {
    const service = new ModelSyncService("https://example.com", "token", "1")
    const runForChannelSpy = vi
      .spyOn(service, "runForChannel")
      .mockImplementation(async (channel) => {
        if (channel.id === 2) {
          throw new Error("worker exploded")
        }

        return {
          channelId: channel.id,
          channelName: channel.name,
          ok: true,
          attempts: 0,
          finishedAt: 1,
          message: "Success",
        } as any
      })

    const onProgress = vi.fn()
    const result = await service.runBatch(
      [
        { id: 1, name: "Alpha", models: "" } as any,
        { id: 2, name: "Beta", models: "" } as any,
      ],
      {
        concurrency: 5,
        maxRetries: 0,
        onProgress,
      },
    )

    expect(runForChannelSpy).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(result.statistics).toMatchObject({
      total: 2,
      successCount: 1,
      failureCount: 1,
    })
    expect(result.items).toEqual([
      expect.objectContaining({
        channelId: 1,
        ok: true,
      }),
      expect.objectContaining({
        channelId: 2,
        ok: false,
        attempts: 1,
        message: "worker exploded",
      }),
    ])
  })

  it("merges existing channel models with mapping keys before updating model_mapping", async () => {
    const service = new ModelSyncService("https://example.com", "token", "1")

    await service.updateChannelModelMapping(
      {
        id: 3,
        name: "Gamma",
        models: "gpt-4o,claude-3",
      } as any,
      {
        "gpt-4o": "gpt-4o",
        "deepseek-chat": "deepseek-chat",
      },
    )

    expect(updateChannelModelMappingMock).toHaveBeenCalledWith(
      expect.objectContaining({
        baseUrl: "https://example.com",
        auth: expect.objectContaining({
          authType: "access_token",
          accessToken: "token",
          userId: "1",
        }),
      }),
      3,
      "gpt-4o,claude-3,deepseek-chat",
      JSON.stringify({
        "gpt-4o": "gpt-4o",
        "deepseek-chat": "deepseek-chat",
      }),
    )
  })
})
