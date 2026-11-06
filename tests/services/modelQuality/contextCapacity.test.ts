import { describe, expect, it } from "vitest"

import { probeContextCapacity } from "~/services/verification/modelQuality/contextCapacity"
import { CONTEXT_ATTEMPT_OUTCOMES } from "~/services/verification/modelQuality/contextCapacityConstants"

describe("context capacity", () => {
  it("pauses a near-1M search at its input budget and completes it on continuation", async () => {
    const attempt = async (tokens: number) => ({
      outcome:
        tokens <= 1000000
          ? CONTEXT_ATTEMPT_OUTCOMES.Accepted
          : CONTEXT_ATTEMPT_OUTCOMES.ContextLimit,
    })
    const paused = await probeContextCapacity({
      maxInputTokens: 1048576,
      attempt,
    })
    expect(paused.reason).toBe("budget")
    expect(
      paused.attempts.reduce((total, value) => total + value.targetTokens, 0),
    ).toBeLessThanOrEqual(8388608)
    const resumed = await probeContextCapacity({
      maxInputTokens: 1048576,
      resumeFrom: paused,
      attempt,
    })
    expect(resumed.reason).toBe("bracketed")
    expect(resumed.lowerBoundTokens).toBe(999424)
    expect(resumed.upperBoundTokens).toBe(1000448)
    expect(resumed.attempts.slice(0, paused.attempts.length)).toEqual(
      paused.attempts,
    )
  })
  it("continues the final confirmation when the previous batch could not afford it", async () => {
    const attempt = async (tokens: number) => ({
      outcome:
        tokens <= 6144
          ? CONTEXT_ATTEMPT_OUTCOMES.Accepted
          : CONTEXT_ATTEMPT_OUTCOMES.ContextLimit,
    })
    const paused = await probeContextCapacity({
      maxInputTokens: 8192,
      maxRequests: 4,
      attempt,
    })
    expect(paused.reason).toBe("budget")
    const sent: number[] = []
    const result = await probeContextCapacity({
      maxInputTokens: 8192,
      resumeFrom: paused,
      attempt: async (tokens) => {
        sent.push(tokens)
        return attempt(tokens)
      },
    })
    expect(sent).toEqual([6144])
    expect(result.reason).toBe("bracketed")
  })
  it("counts reported usage above the target and pauses before spending more", async () => {
    const result = await probeContextCapacity({
      maxInputTokens: 8192,
      initialInputTokens: 1024,
      maxTotalInputTokens: 4096,
      attempt: async () => ({
        outcome: CONTEXT_ATTEMPT_OUTCOMES.Accepted,
        inputTokens: 3072,
      }),
    })
    expect(result.reason).toBe("budget")
    expect(result.attempts).toHaveLength(1)
  })
  it("rejects malformed continuation before dispatching", async () => {
    const attempt = async () => {
      throw new Error("must not dispatch")
    }
    await expect(
      probeContextCapacity({
        maxInputTokens: 8192,
        resumeFrom: {
          reason: "budget",
          lowerBoundTokens: 0,
          attempts: [{ targetTokens: 0, outcome: "accepted" }],
        },
        attempt,
      }),
    ).rejects.toThrow("Invalid capacity continuation")
  })
  it("continues a budget pause from the next candidate without replaying requests", async () => {
    const attempt = async (tokens: number) => ({
      outcome:
        tokens <= 6144
          ? CONTEXT_ATTEMPT_OUTCOMES.Accepted
          : CONTEXT_ATTEMPT_OUTCOMES.ContextLimit,
    })
    const paused = await probeContextCapacity({
      maxInputTokens: 8192,
      maxRequests: 2,
      attempt,
    })
    expect(paused.reason).toBe("budget")
    const sent: number[] = []
    const result = await probeContextCapacity({
      maxInputTokens: 8192,
      resumeFrom: paused,
      attempt: async (tokens) => {
        sent.push(tokens)
        return attempt(tokens)
      },
    })
    expect(sent[0]).toBe(6144)
    expect(result).toMatchObject({
      reason: "bracketed",
      lowerBoundTokens: 6144,
      upperBoundTokens: 7168,
    })
    expect(result.attempts).toHaveLength(5)
  })
  it("starts at the test ceiling and finishes after one successful request", async () => {
    const result = await probeContextCapacity({
      maxInputTokens: 65536,
      attempt: async () => ({ outcome: CONTEXT_ATTEMPT_OUTCOMES.Accepted }),
    })
    expect(result.attempts.map((attempt) => attempt.targetTokens)).toEqual([
      65536,
    ])
    expect(result.reason).toBe("test-limit")
  })
  it("respects the request budget while backing off from a rejected start", async () => {
    const result = await probeContextCapacity({
      maxInputTokens: 65536,
      maxRequests: 2,
      attempt: async () => ({ outcome: CONTEXT_ATTEMPT_OUTCOMES.ContextLimit }),
    })
    expect(result.attempts.map((attempt) => attempt.targetTokens)).toEqual([
      65536, 32768,
    ])
    expect(result).toMatchObject({
      reason: "budget",
      lowerBoundTokens: 0,
      upperBoundTokens: 32768,
    })
  })
  it("starts at the ceiling and finds a smaller capacity after rejection", async () => {
    const sent: number[] = []
    const result = await probeContextCapacity({
      maxInputTokens: 65536,
      attempt: async (tokens) => {
        sent.push(tokens)
        return {
          outcome:
            tokens <= 12288
              ? CONTEXT_ATTEMPT_OUTCOMES.Accepted
              : CONTEXT_ATTEMPT_OUTCOMES.ContextLimit,
        }
      },
    })
    expect(sent[0]).toBe(65536)
    expect(result).toMatchObject({
      lowerBoundTokens: 12288,
      upperBoundTokens: 13312,
      reason: "bracketed",
    })
  })
  it("stops without reporting a bracket when even the minimum input is rejected", async () => {
    const sent: number[] = []
    const result = await probeContextCapacity({
      maxInputTokens: 8192,
      attempt: async (tokens) => {
        sent.push(tokens)
        return { outcome: CONTEXT_ATTEMPT_OUTCOMES.ContextLimit }
      },
    })
    expect(sent).toEqual([8192, 4096, 2048, 1024])
    expect(result).toMatchObject({
      lowerBoundTokens: 0,
      upperBoundTokens: 1024,
      reason: "inconclusive",
    })
  })
  it("rechecks the largest accepted input before reporting a bracket", async () => {
    const sent: number[] = []
    await probeContextCapacity({
      maxInputTokens: 8192,
      resolutionTokens: 1024,
      attempt: async (tokens) => {
        sent.push(tokens)
        return {
          outcome:
            tokens <= 6144
              ? CONTEXT_ATTEMPT_OUTCOMES.Accepted
              : CONTEXT_ATTEMPT_OUTCOMES.ContextLimit,
        }
      },
    })
    expect(sent.at(-1)).toBe(6144)
  })
  it("does not infer an upper bound from an inconclusive request", async () => {
    const result = await probeContextCapacity({
      maxInputTokens: 8192,
      initialInputTokens: 1024,
      attempt: async (tokens) => ({
        outcome:
          tokens === 1024 ? CONTEXT_ATTEMPT_OUTCOMES.Accepted : "inconclusive",
      }),
    })
    expect(result).toMatchObject({
      lowerBoundTokens: 1024,
      reason: "inconclusive",
    })
    expect(result.upperBoundTokens).toBeUndefined()
  })
  it("reports only a lower bound at the configured test limit", async () => {
    const result = await probeContextCapacity({
      maxInputTokens: 4096,
      attempt: async () => ({ outcome: CONTEXT_ATTEMPT_OUTCOMES.Accepted }),
    })
    expect(result).toMatchObject({
      lowerBoundTokens: 4096,
      reason: "test-limit",
    })
    expect(result.upperBoundTokens).toBeUndefined()
  })
  it("does not accept a response arriving after cancellation", async () => {
    const controller = new AbortController()
    const result = await probeContextCapacity({
      maxInputTokens: 4096,
      signal: controller.signal,
      attempt: async () => {
        controller.abort()
        return { outcome: CONTEXT_ATTEMPT_OUTCOMES.Accepted }
      },
    })
    expect(result).toMatchObject({
      lowerBoundTokens: 0,
      reason: "stopped",
      attempts: [],
    })
  })
  it("rejects invalid limits without making a request", async () => {
    await expect(
      probeContextCapacity({
        maxInputTokens: Number.NaN,
        attempt: async () => ({ outcome: "accepted" }),
      }),
    ).rejects.toThrow()
  })
  it("stops before another request would exceed the cumulative budget", async () => {
    const result = await probeContextCapacity({
      maxInputTokens: 8192,
      maxTotalInputTokens: 3072,
      initialInputTokens: 1024,
      attempt: async () => ({ outcome: CONTEXT_ATTEMPT_OUTCOMES.Accepted }),
    })
    expect(result.reason).toBe("budget")
    expect(result.lowerBoundTokens).toBe(2048)
    expect(result.attempts).toHaveLength(2)
  })
  it("reports a bracket after an explicit capacity rejection", async () => {
    const result = await probeContextCapacity({
      maxInputTokens: 8192,
      resolutionTokens: 1024,
      attempt: async (tokens) => ({
        outcome:
          tokens <= 6144
            ? CONTEXT_ATTEMPT_OUTCOMES.Accepted
            : CONTEXT_ATTEMPT_OUTCOMES.ContextLimit,
      }),
    })
    expect(result.lowerBoundTokens).toBe(6144)
    expect(result.upperBoundTokens).toBe(7168)
    expect(result.reason).toBe("bracketed")
  })
})
