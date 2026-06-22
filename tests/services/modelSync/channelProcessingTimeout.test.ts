import { describe, expect, it, vi } from "vitest"

import {
  normalizeChannelProcessingTimeout,
  runWithChannelProcessingTimeout,
} from "~/services/models/modelSync/channelProcessingTimeout"
import type { ManagedSiteChannel } from "~/types/managedSite"
import type { ExecutionItemResult } from "~/types/managedSiteModelSync"

vi.mock("~/utils/i18n/core", () => ({
  t: vi.fn((key: string, options?: { count?: number }) =>
    options?.count === undefined ? key : `${key}:${options.count}`,
  ),
}))

const channel = {
  id: 42,
  name: "Slow Channel",
  models: " gpt-4o, , claude-3 ",
} as ManagedSiteChannel

describe("normalizeChannelProcessingTimeout", () => {
  it("normalizes invalid and non-positive values to unlimited", () => {
    expect(normalizeChannelProcessingTimeout(null)).toBe(0)
    expect(normalizeChannelProcessingTimeout(undefined)).toBe(0)
    expect(normalizeChannelProcessingTimeout(Number.NaN)).toBe(0)
    expect(normalizeChannelProcessingTimeout(Number.POSITIVE_INFINITY)).toBe(0)
    expect(normalizeChannelProcessingTimeout(0)).toBe(0)
    expect(normalizeChannelProcessingTimeout(-1)).toBe(0)
  })

  it("keeps positive timeouts as integer seconds with a one-second minimum", () => {
    expect(normalizeChannelProcessingTimeout(0.5)).toBe(1)
    expect(normalizeChannelProcessingTimeout(1.9)).toBe(1)
    expect(normalizeChannelProcessingTimeout(120.7)).toBe(120)
  })
})

describe("runWithChannelProcessingTimeout", () => {
  it("runs without an abort signal when timeout is unlimited", async () => {
    const result: ExecutionItemResult = {
      channelId: channel.id,
      channelName: channel.name,
      ok: true,
      attempts: 0,
      finishedAt: 1,
      message: "Success",
    }
    const work = vi.fn(async () => result)

    await expect(
      runWithChannelProcessingTimeout(work, channel, 2, 0),
    ).resolves.toBe(result)

    expect(work).toHaveBeenCalledWith()
  })

  it("marks the channel failed and aborts work when timeout elapses", async () => {
    vi.useFakeTimers()
    try {
      let capturedSignal: AbortSignal | undefined
      const work = vi.fn(
        (abortSignal?: AbortSignal) =>
          new Promise<ExecutionItemResult>(() => {
            capturedSignal = abortSignal
          }),
      )

      const resultPromise = runWithChannelProcessingTimeout(work, channel, 2, 1)
      await vi.advanceTimersByTimeAsync(1_000)
      const result = await resultPromise

      expect(capturedSignal?.aborted).toBe(true)
      expect(result).toEqual(
        expect.objectContaining({
          channelId: 42,
          channelName: "Slow Channel",
          ok: false,
          attempts: 3,
          message: "managedSiteModelSync:execution.errors.channelTimeout:1",
          oldModels: ["gpt-4o", "claude-3"],
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })

  it("preserves an empty previous model list in timeout results", async () => {
    vi.useFakeTimers()
    try {
      const resultPromise = runWithChannelProcessingTimeout(
        () => new Promise<ExecutionItemResult>(() => undefined),
        { ...channel, models: "" },
        0,
        1,
      )

      await vi.advanceTimersByTimeAsync(1_000)

      await expect(resultPromise).resolves.toEqual(
        expect.objectContaining({
          attempts: 1,
          oldModels: [],
        }),
      )
    } finally {
      vi.useRealTimers()
    }
  })
})
