import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "~/services/apiTransport/errors"
import { createOctopusModelSyncCapability } from "~/services/models/modelSync/octopusModelSync"
import {
  PROTECTION_BYPASS_AUTOMATIC_TRIGGERS,
  PROTECTION_BYPASS_FEATURES,
} from "~/services/protectionBypass/contracts"
import {
  createManagedUpstreamResourceRef,
  getManagedUpstreamResourceRefKey,
} from "~/types/managedUpstreamResource"
import {
  OctopusAutoGroupType,
  OctopusOutboundType,
  type OctopusChannel,
} from "~/types/octopus"
import { automaticExecution } from "~~/tests/services/protectionBypass/fixtures"

const {
  apiListChannelsMock,
  fetchRemoteModelsMock,
  updateChannelMock,
  updateModelsMock,
  loggerErrorMock,
  runApiVerificationProbeMock,
} = vi.hoisted(() => ({
  apiListChannelsMock: vi.fn(),
  fetchRemoteModelsMock: vi.fn(),
  updateChannelMock: vi.fn(),
  updateModelsMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  runApiVerificationProbeMock: vi.fn(),
}))

vi.mock("~/services/apiService/octopus", () => ({
  listChannels: vi.fn((...args) => apiListChannelsMock(...args)),
  fetchRemoteModels: vi.fn((...args) => fetchRemoteModelsMock(...args)),
  updateChannel: vi.fn((...args) => updateChannelMock(...args)),
}))

vi.mock("~/services/apiAdapters/managedSites/octopus", () => {
  const octopusManagedResourceModels = {
    updateModels: (...args: unknown[]) => updateModelsMock(...args),
  }
  return {
    octopusManagedResourceModels,
    octopusManagedSiteCapabilities: {
      models: octopusManagedResourceModels,
      matching: {},
    },
  }
})

vi.mock("~/services/verification/aiApiVerification", async (original) => ({
  ...(await original<
    typeof import("~/services/verification/aiApiVerification")
  >()),
  runApiVerificationProbe: runApiVerificationProbeMock,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => ({
    error: loggerErrorMock,
  })),
}))

const config = {
  baseUrl: "https://octopus.example.com",
  username: "admin",
  password: "secret",
}

type OctopusModelSyncCapability = ReturnType<
  typeof createOctopusModelSyncCapability
>
type OctopusModelSyncTestOptions = Parameters<
  OctopusModelSyncCapability["runBatch"]
>[1] & {
  protectionBypassExecution?: Parameters<
    typeof createOctopusModelSyncCapability
  >[1]
}

const runOctopusBatch = (
  config: Parameters<typeof createOctopusModelSyncCapability>[0],
  channels: Parameters<OctopusModelSyncCapability["runBatch"]>[0],
  options: OctopusModelSyncTestOptions,
) => {
  const {
    protectionBypassExecution = automaticExecution(
      PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
      PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
    ),
    ...batchOptions
  } = options
  return createOctopusModelSyncCapability(
    config,
    protectionBypassExecution,
  ).runBatch(channels, batchOptions)
}

const createChannel = (
  overrides: Partial<OctopusChannel> = {},
): OctopusChannel => ({
  id: 1,
  name: "Alpha",
  type: OctopusOutboundType.OpenAIChat,
  enabled: true,
  base_urls: [{ url: "https://upstream.example.invalid" }],
  keys: [{ enabled: true, channel_key: "key-1" }],
  model: "model-a",
  proxy: false,
  auto_sync: true,
  auto_group: OctopusAutoGroupType.None,
  ...overrides,
})

const createProbeChannelConfigs = () => {
  const resourceRef = createManagedUpstreamResourceRef({
    managedSiteType: "octopus",
    scopeKey: config.baseUrl,
    resourceId: 1,
  })
  return {
    [getManagedUpstreamResourceRefKey(resourceRef)]: {
      resourceRef,
      channelId: 1,
      modelFilterSettings: {
        rules: [
          {
            id: "probe-rule",
            kind: "probe" as const,
            name: "Probe model",
            probeIds: ["text-generation" as const],
            match: "all" as const,
            action: "include" as const,
            enabled: true,
            createdAt: 100,
            updatedAt: 100,
          },
        ],
        updatedAt: 100,
      },
      createdAt: 100,
      updatedAt: 100,
    },
  }
}

describe("runOctopusBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    apiListChannelsMock.mockResolvedValue([])
    runApiVerificationProbeMock.mockResolvedValue({ status: "pass" })
    updateModelsMock.mockResolvedValue({
      outcome: "succeeded",
      data: undefined,
      confirmedEffects: [
        {
          kind: "models-updated",
          resourceKind: "channel",
          resourceId: 1,
        },
      ],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("syncs a native Octopus channel without a converted carrier and preserves its probe settings", async () => {
    const channel: OctopusChannel = {
      id: 7,
      name: "Native channel",
      type: OctopusOutboundType.Anthropic,
      enabled: true,
      base_urls: [{ url: "http://upstream.lan", delay: 25 }],
      keys: [{ enabled: true, channel_key: "native-key" }],
      model: " model-a , model-b ",
      custom_model: "custom-model",
      proxy: true,
      channel_proxy: "http://proxy.lan",
      custom_header: [{ header_key: "x-provider", header_value: "native" }],
      param_override: '{"max_tokens":1024}',
      auto_sync: true,
      auto_group: OctopusAutoGroupType.Exact,
    }
    fetchRemoteModelsMock.mockResolvedValueOnce(["model-c"])

    const result = await runOctopusBatch(config, [channel], {
      concurrency: 1,
      maxRetries: 0,
    })

    expect(result.items).toEqual([
      expect.objectContaining({
        channelId: 7,
        ok: true,
        oldModels: ["model-a", "model-b"],
        newModels: ["model-c"],
      }),
    ])
    expect(fetchRemoteModelsMock).toHaveBeenCalledWith(
      config,
      {
        type: OctopusOutboundType.Anthropic,
        baseUrl: "http://upstream.lan",
        key: "native-key",
        proxy: true,
        source: channel,
      },
      expect.anything(),
    )
    expect(updateModelsMock).toHaveBeenCalledWith(
      config,
      7,
      ["model-c"],
      expect.anything(),
    )
  })

  it("returns empty statistics without invoking progress when no channels are provided", async () => {
    const onProgress = vi.fn()

    const result = await runOctopusBatch(config, [], {
      concurrency: 0,
      maxRetries: 0,
      onProgress,
    })

    expect(result).toMatchObject({
      items: [],
      statistics: {
        total: 0,
        successCount: 0,
        failureCount: 0,
      },
    })
    expect(onProgress).not.toHaveBeenCalled()
    expect(fetchRemoteModelsMock).not.toHaveBeenCalled()
  })

  it("normalizes fetched models, updates changed channels, and reports progress", async () => {
    fetchRemoteModelsMock.mockResolvedValueOnce([
      " beta ",
      "beta",
      "",
      " gamma ",
    ])

    const onProgress = vi.fn()
    const result = await runOctopusBatch(config, [createChannel()], {
      concurrency: 4,
      maxRetries: 0,
      onProgress,
    })

    expect(fetchRemoteModelsMock).toHaveBeenCalledWith(
      config,
      {
        type: OctopusOutboundType.OpenAIChat,
        baseUrl: "https://upstream.example.invalid",
        key: "key-1",
        proxy: false,
        source: createChannel(),
      },
      expect.objectContaining({
        protectionBypassExecution: expect.objectContaining({
          feature: PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
          trigger: PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
        }),
      }),
    )
    expect(updateModelsMock).toHaveBeenCalledWith(
      config,
      1,
      ["beta", "gamma"],
      expect.objectContaining({
        protectionBypassExecution: expect.objectContaining({
          feature: PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
        }),
      }),
    )
    expect(updateChannelMock).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      items: [
        {
          channelId: 1,
          channelName: "Alpha",
          ok: true,
          attempts: 0,
          oldModels: ["model-a"],
          newModels: ["beta", "gamma"],
          message: "Success",
        },
      ],
      statistics: {
        total: 1,
        successCount: 1,
        failureCount: 0,
      },
    })
    expect(onProgress).toHaveBeenCalledWith({
      completed: 1,
      total: 1,
      lastResult: expect.objectContaining({
        channelId: 1,
        ok: true,
        newModels: ["beta", "gamma"],
      }),
    })
  })

  it("preserves model-sync execution for Octopus reads and writes", async () => {
    const execution = automaticExecution(
      PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
      PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
    )
    fetchRemoteModelsMock.mockResolvedValueOnce(["model-b"])

    await createOctopusModelSyncCapability(config, execution).runBatch(
      [createChannel()],
      {
        concurrency: 1,
        maxRetries: 0,
      },
    )

    expect(fetchRemoteModelsMock).toHaveBeenCalledWith(
      config,
      expect.anything(),
      expect.objectContaining({ protectionBypassExecution: execution }),
    )
    expect(updateModelsMock).toHaveBeenCalledWith(
      config,
      1,
      ["model-b"],
      expect.objectContaining({ protectionBypassExecution: execution }),
    )
  })

  it.each([
    { type: OctopusOutboundType.OpenAIChat, apiType: "openai-compatible" },
    { type: OctopusOutboundType.OpenAIResponse, apiType: "openai" },
    { type: OctopusOutboundType.Anthropic, apiType: "anthropic" },
    { type: OctopusOutboundType.Gemini, apiType: "google" },
  ])(
    "uses the native $apiType protocol for Octopus probe filters",
    async ({ type, apiType }) => {
      fetchRemoteModelsMock.mockResolvedValueOnce(["model-b"])
      const result = await runOctopusBatch(config, [createChannel({ type })], {
        concurrency: 1,
        maxRetries: 0,
        channelConfigs: createProbeChannelConfigs(),
      })

      expect(result.items[0]).toMatchObject({
        ok: true,
        newModels: ["model-b"],
      })
      expect(runApiVerificationProbeMock).toHaveBeenCalledWith(
        expect.objectContaining({
          apiType,
          baseUrl: "https://upstream.example.invalid",
          apiKey: "key-1",
          modelId: "model-b",
        }),
      )
      expect(updateModelsMock).toHaveBeenCalledWith(
        config,
        1,
        ["model-b"],
        expect.anything(),
      )
    },
  )

  it("keeps Octopus embedding model lists unchanged when chat probes are unsupported", async () => {
    fetchRemoteModelsMock.mockResolvedValueOnce(["embedding-model"])
    const result = await runOctopusBatch(
      config,
      [createChannel({ type: OctopusOutboundType.OpenAIEmbedding })],
      {
        concurrency: 1,
        maxRetries: 0,
        channelConfigs: createProbeChannelConfigs(),
      },
    )

    expect(result.items[0]).toMatchObject({
      ok: false,
      oldModels: ["model-a"],
      message: "Probe filtering is unsupported for this channel type.",
    })
    expect(runApiVerificationProbeMock).not.toHaveBeenCalled()
    expect(updateModelsMock).not.toHaveBeenCalled()
  })

  it("preserves model-sync execution when listing Octopus channels", async () => {
    const execution = automaticExecution(
      PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
      PROTECTION_BYPASS_AUTOMATIC_TRIGGERS.BackgroundRecovery,
    )

    await createOctopusModelSyncCapability(config, execution).listChannels()

    expect(apiListChannelsMock).toHaveBeenCalledWith(config, {
      protectionBypassExecution: execution,
    })
  })

  it("applies the scoped resource filters before updating an Octopus channel", async () => {
    fetchRemoteModelsMock.mockResolvedValueOnce(["model-a", "model-b"])
    const resourceRef = createManagedUpstreamResourceRef({
      managedSiteType: "octopus",
      scopeKey: config.baseUrl,
      resourceId: 1,
    })
    const channelConfigs = {
      [getManagedUpstreamResourceRefKey(resourceRef)]: {
        resourceRef,
        channelId: 1,
        modelFilterSettings: {
          rules: [
            {
              id: "exclude-model-b",
              kind: "pattern" as const,
              name: "Exclude model-b",
              pattern: "model-b",
              isRegex: false,
              action: "exclude" as const,
              enabled: true,
              createdAt: 10,
              updatedAt: 10,
            },
          ],
          updatedAt: 10,
        },
        createdAt: 10,
        updatedAt: 10,
      },
    }

    const result = await runOctopusBatch(
      config,
      [createChannel({ model: "legacy-model" })],
      {
        concurrency: 1,
        maxRetries: 0,
        channelConfigs,
      },
    )

    expect(updateModelsMock).toHaveBeenCalledWith(
      config,
      1,
      ["model-a"],
      expect.objectContaining({
        protectionBypassExecution: expect.objectContaining({
          feature: PROTECTION_BYPASS_FEATURES.ManagedSiteModelSync,
        }),
      }),
    )
    expect(result.items[0]).toMatchObject({
      ok: true,
      newModels: ["model-a"],
    })
  })

  it("returns a channel failure when a probe filter cannot resolve a channel key", async () => {
    fetchRemoteModelsMock.mockResolvedValueOnce(["model-a"])
    const channelConfigs = createProbeChannelConfigs()

    const result = await runOctopusBatch(
      config,
      [createChannel({ model: "legacy-model", keys: [] })],
      { concurrency: 1, maxRetries: 0, channelConfigs },
    )

    expect(updateModelsMock).not.toHaveBeenCalled()
    expect(result.items).toEqual([
      expect.objectContaining({
        channelId: 1,
        ok: false,
        attempts: 1,
        message:
          "Probe filtering is unsupported because this managed-site provider cannot resolve hidden channel keys.",
      }),
    ])
  })

  it("skips updates when the normalized model set is unchanged", async () => {
    fetchRemoteModelsMock.mockResolvedValueOnce([" model-b ", "model-a", " "])

    const result = await runOctopusBatch(
      config,
      [createChannel({ model: "model-a,model-b" })],
      {
        concurrency: 2,
        maxRetries: 0,
      },
    )

    expect(updateModelsMock).not.toHaveBeenCalled()
    expect(result.items).toEqual([
      expect.objectContaining({
        channelId: 1,
        ok: true,
        oldModels: ["model-a", "model-b"],
        newModels: ["model-b", "model-a"],
      }),
    ])
  })

  it("retries ApiError failures, preserves http status, and returns terminal failure metadata", async () => {
    vi.useFakeTimers()
    fetchRemoteModelsMock.mockRejectedValue(
      new ApiError("octopus upstream failed", 503),
    )

    const resultPromise = runOctopusBatch(config, [createChannel()], {
      concurrency: 1,
      maxRetries: 1,
    })

    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(fetchRemoteModelsMock).toHaveBeenCalledTimes(2)
    expect(updateModelsMock).not.toHaveBeenCalled()
    expect(result.items).toEqual([
      expect.objectContaining({
        channelId: 1,
        ok: false,
        httpStatus: 503,
        attempts: 2,
        oldModels: ["model-a"],
        message: "octopus upstream failed",
      }),
    ])
    expect(result.statistics).toMatchObject({
      total: 1,
      successCount: 0,
      failureCount: 1,
    })
  })

  it("records worker-level failures when a channel throws before per-channel handling starts", async () => {
    fetchRemoteModelsMock.mockResolvedValueOnce(["model-b"])

    const explosiveChannel = {
      ...createChannel(),
      id: 9,
      name: "Explosive",
      get model() {
        throw new Error("models getter exploded")
      },
    }

    const onProgress = vi.fn()
    const result = await runOctopusBatch(
      config,
      [explosiveChannel as any, createChannel({ id: 2, name: "Stable" })],
      {
        concurrency: 5,
        maxRetries: 2,
        onProgress,
      },
    )

    expect(result.statistics).toMatchObject({
      total: 2,
      successCount: 1,
      failureCount: 1,
    })
    expect(result.items).toEqual([
      expect.objectContaining({
        channelId: 9,
        channelName: "Explosive",
        ok: false,
        attempts: 3,
        message: "models getter exploded",
      }),
      expect.objectContaining({
        channelId: 2,
        channelName: "Stable",
        ok: true,
      }),
    ])
    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(loggerErrorMock).toHaveBeenCalled()
  })

  it("marks a channel failed when per-channel processing exceeds the configured timeout", async () => {
    vi.useFakeTimers()
    try {
      fetchRemoteModelsMock.mockReturnValue(
        new Promise<string[]>(() => undefined),
      )

      const onProgress = vi.fn()
      const resultPromise = runOctopusBatch(config, [createChannel()], {
        concurrency: 1,
        maxRetries: 2,
        channelProcessingTimeout: 1,
        onProgress,
      })

      await vi.advanceTimersByTimeAsync(1_000)
      const result = await resultPromise

      expect(fetchRemoteModelsMock).toHaveBeenCalledTimes(1)
      expect(fetchRemoteModelsMock).toHaveBeenCalledWith(
        config,
        expect.anything(),
        expect.objectContaining({
          signal: expect.any(AbortSignal),
        }),
      )
      expect(updateModelsMock).not.toHaveBeenCalled()
      expect(result.items).toEqual([
        expect.objectContaining({
          channelId: 1,
          channelName: "Alpha",
          ok: false,
          attempts: 3,
          oldModels: ["model-a"],
          message: "managedSiteModelSync:execution.errors.channelTimeout",
        }),
      ])
      expect(onProgress).toHaveBeenCalledWith({
        completed: 1,
        total: 1,
        lastResult: expect.objectContaining({
          channelId: 1,
          ok: false,
        }),
      })
    } finally {
      vi.useRealTimers()
    }
  })

  it("passes abort signals to Octopus fetch and update requests", async () => {
    fetchRemoteModelsMock.mockResolvedValueOnce(["model-b"])
    updateModelsMock.mockResolvedValueOnce({
      outcome: "succeeded",
      data: undefined,
      confirmedEffects: [
        {
          kind: "models-updated",
          resourceKind: "channel",
          resourceId: 1,
        },
      ],
    })

    await runOctopusBatch(config, [createChannel()], {
      concurrency: 1,
      maxRetries: 0,
      channelProcessingTimeout: 30,
    })

    expect(fetchRemoteModelsMock).toHaveBeenCalledWith(
      config,
      expect.anything(),
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
    expect(updateModelsMock).toHaveBeenCalledWith(
      config,
      1,
      ["model-b"],
      expect.objectContaining({
        signal: expect.any(AbortSignal),
      }),
    )
    expect(updateChannelMock).not.toHaveBeenCalled()
  })

  it("retries rejected writes through the shared policy", async () => {
    vi.useFakeTimers()
    fetchRemoteModelsMock.mockResolvedValue(["model-b"])
    updateModelsMock.mockResolvedValue({
      outcome: "rejected",
      diagnostic: { message: "write rejected" },
    })

    const resultPromise = runOctopusBatch(config, [createChannel()], {
      concurrency: 1,
      maxRetries: 1,
    })
    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(updateModelsMock).toHaveBeenCalledTimes(2)
    expect(result.items).toEqual([
      expect.objectContaining({
        channelId: 1,
        ok: false,
        attempts: 2,
        message: "write rejected",
      }),
    ])
  })

  it.each(["thrown", "malformed"] as const)(
    "propagates a %s write failure without replay",
    async (failureKind) => {
      fetchRemoteModelsMock.mockResolvedValue(["model-b"])
      const thrown = new Error("octopus write invariant failed")
      if (failureKind === "thrown") {
        updateModelsMock.mockRejectedValue(thrown)
      } else {
        updateModelsMock.mockResolvedValue(undefined)
      }

      const execution = runOctopusBatch(config, [createChannel()], {
        concurrency: 1,
        maxRetries: 2,
      })

      if (failureKind === "thrown") {
        await expect(execution).rejects.toBe(thrown)
      } else {
        await expect(execution).rejects.toThrow(
          "Invalid managed site mutation result",
        )
      }
      expect(updateModelsMock).toHaveBeenCalledOnce()
      expect(fetchRemoteModelsMock).toHaveBeenCalledOnce()
    },
  )

  it.each([
    { label: "null", value: null },
    { label: "undefined", value: undefined },
    { label: "string", value: "primitive octopus write failure" },
    { label: "symbol", value: Symbol("primitive octopus write failure") },
  ])(
    "propagates a $label write failure without retry or raw logging",
    async ({ value }) => {
      vi.useFakeTimers()
      fetchRemoteModelsMock.mockResolvedValue(["model-b"])
      updateModelsMock.mockRejectedValue(value)

      const observed = runOctopusBatch(config, [createChannel()], {
        concurrency: 1,
        maxRetries: 2,
      }).then(
        () => ({ status: "resolved" as const, error: undefined }),
        (error: unknown) => ({ status: "rejected" as const, error }),
      )
      await vi.runAllTimersAsync()

      await expect(observed).resolves.toEqual({
        status: "rejected",
        error: value,
      })
      expect(updateModelsMock).toHaveBeenCalledOnce()
      expect(fetchRemoteModelsMock).toHaveBeenCalledOnce()
      expect(loggerErrorMock).not.toHaveBeenCalledWith(
        "Unexpected error for channel",
        expect.objectContaining({ error: value }),
      )
    },
  )

  it("does not carry write-failure identity into a later read operation", async () => {
    vi.useFakeTimers()
    const reused = new Error("reused octopus operation failure")
    fetchRemoteModelsMock
      .mockResolvedValueOnce(["model-b"])
      .mockRejectedValueOnce(reused)
      .mockResolvedValueOnce(["model-a"])
    updateModelsMock.mockRejectedValueOnce(reused)

    await expect(
      runOctopusBatch(config, [createChannel()], {
        concurrency: 1,
        maxRetries: 0,
      }),
    ).rejects.toBe(reused)

    const laterRead = runOctopusBatch(config, [createChannel()], {
      concurrency: 1,
      maxRetries: 1,
    }).then(
      (result) => ({ status: "resolved" as const, result }),
      (error: unknown) => ({ status: "rejected" as const, error }),
    )
    await vi.runAllTimersAsync()

    await expect(laterRead).resolves.toMatchObject({
      status: "resolved",
      result: {
        items: [
          expect.objectContaining({ channelId: 1, ok: true, attempts: 1 }),
        ],
      },
    })
    expect(fetchRemoteModelsMock).toHaveBeenCalledTimes(3)
    expect(updateModelsMock).toHaveBeenCalledOnce()
  })

  it.each(["partial", "uncertain"] as const)(
    "reconciles and never replays a %s write",
    async (outcome) => {
      fetchRemoteModelsMock.mockResolvedValue(["model-b"])
      updateModelsMock.mockResolvedValue(
        outcome === "partial"
          ? {
              outcome,
              confirmedEffects: [
                {
                  kind: "models-updated",
                  resourceKind: "channel",
                  resourceId: 1,
                },
              ],
              completion: "uncertain",
              diagnostic: { message: `${outcome} write` },
            }
          : {
              outcome,
              diagnostic: { message: `${outcome} write` },
            },
      )

      const result = await runOctopusBatch(config, [createChannel()], {
        concurrency: 1,
        maxRetries: 2,
      })

      expect(updateModelsMock).toHaveBeenCalledTimes(1)
      expect(apiListChannelsMock).toHaveBeenCalledOnce()
      expect(result.items).toEqual([
        expect.objectContaining({
          channelId: 1,
          ok: false,
          attempts: 1,
          message: `${outcome} write`,
        }),
      ])
    },
  )
})
