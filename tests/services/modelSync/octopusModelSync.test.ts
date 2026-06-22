import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ApiError } from "~/services/apiService/common/errors"
import { runOctopusBatch } from "~/services/models/modelSync/octopusModelSync"
import type { OctopusChannelWithData } from "~/types/managedSite"

const { fetchRemoteModelsMock, updateChannelMock, loggerErrorMock } =
  vi.hoisted(() => ({
    fetchRemoteModelsMock: vi.fn(),
    updateChannelMock: vi.fn(),
    loggerErrorMock: vi.fn(),
  }))

vi.mock("~/services/apiService/octopus", () => ({
  fetchRemoteModels: vi.fn((...args) => fetchRemoteModelsMock(...args)),
  updateChannel: vi.fn((...args) => updateChannelMock(...args)),
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

const createChannel = (
  overrides: Record<string, unknown> = {},
): OctopusChannelWithData =>
  ({
    id: 1,
    name: "Alpha",
    models: "model-a",
    _octopusData: {
      type: 10,
      base_urls: ["https://upstream.example.com"],
      keys: ["key-1"],
      proxy: "http://proxy.example.com",
    },
    ...overrides,
  }) as unknown as OctopusChannelWithData

describe("runOctopusBatch", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns empty statistics without invoking progress when no channels are provided", async () => {
    const onProgress = vi.fn()

    const result = await runOctopusBatch(config as any, [], {
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
    const result = await runOctopusBatch(config as any, [createChannel()], {
      concurrency: 4,
      maxRetries: 0,
      onProgress,
    })

    expect(fetchRemoteModelsMock).toHaveBeenCalledWith(config, {
      type: 10,
      base_urls: ["https://upstream.example.com"],
      keys: ["key-1"],
      proxy: "http://proxy.example.com",
    })
    expect(updateChannelMock).toHaveBeenCalledWith(config, {
      id: 1,
      model: "beta,gamma",
    })
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

  it("skips updates when the normalized model set is unchanged", async () => {
    fetchRemoteModelsMock.mockResolvedValueOnce([" model-b ", "model-a", " "])

    const result = await runOctopusBatch(
      config as any,
      [createChannel({ models: "model-a,model-b" })],
      {
        concurrency: 2,
        maxRetries: 0,
      },
    )

    expect(updateChannelMock).not.toHaveBeenCalled()
    expect(result.items).toEqual([
      expect.objectContaining({
        channelId: 1,
        ok: true,
        oldModels: ["model-a", "model-b"],
        newModels: ["model-b", "model-a"],
      }),
    ])
  })

  it("returns a channel-level failure when octopus channel data is missing", async () => {
    const onProgress = vi.fn()

    const result = await runOctopusBatch(
      config as any,
      [createChannel({ models: "gpt-4o", _octopusData: undefined })],
      {
        concurrency: 1,
        maxRetries: 0,
        onProgress,
      },
    )

    expect(fetchRemoteModelsMock).not.toHaveBeenCalled()
    expect(result.items).toEqual([
      expect.objectContaining({
        channelId: 1,
        channelName: "Alpha",
        ok: false,
        attempts: 1,
        oldModels: ["gpt-4o"],
        message: "Missing Octopus channel data",
      }),
    ])
    expect(onProgress).toHaveBeenCalledWith({
      completed: 1,
      total: 1,
      lastResult: expect.objectContaining({
        channelId: 1,
        ok: false,
        message: "Missing Octopus channel data",
      }),
    })
    expect(loggerErrorMock).toHaveBeenCalled()
  })

  it("retries ApiError failures, preserves http status, and returns terminal failure metadata", async () => {
    vi.useFakeTimers()
    fetchRemoteModelsMock.mockRejectedValue(
      new ApiError("octopus upstream failed", 503),
    )

    const resultPromise = runOctopusBatch(config as any, [createChannel()], {
      concurrency: 1,
      maxRetries: 1,
    })

    await vi.runAllTimersAsync()
    const result = await resultPromise

    expect(fetchRemoteModelsMock).toHaveBeenCalledTimes(2)
    expect(updateChannelMock).not.toHaveBeenCalled()
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
      id: 9,
      name: "Explosive",
      get models() {
        throw new Error("models getter exploded")
      },
      _octopusData: {
        type: 10,
        base_urls: ["https://upstream.example.com"],
        keys: ["key-1"],
        proxy: "http://proxy.example.com",
      },
    }

    const onProgress = vi.fn()
    const result = await runOctopusBatch(
      config as any,
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
      const resultPromise = runOctopusBatch(config as any, [createChannel()], {
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
      expect(updateChannelMock).not.toHaveBeenCalled()
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
})
