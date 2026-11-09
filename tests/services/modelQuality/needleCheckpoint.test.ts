import { beforeEach, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { WEB_AI_API_CHECK_STORAGE_KEYS } from "~/services/core/storageKeys"
import { CONTEXT_TOKEN_ENCODINGS } from "~/services/verification/modelQuality/contextTokenConstants"
import {
  NEEDLE_OUTCOMES,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import { createNeedlePlan } from "~/services/verification/modelQuality/needlePlan"
import { needleHistory } from "~/services/verification/verificationResultHistory/needleHistory"
import { getVerificationScopeKey } from "~/services/verification/verificationResultHistory/requestIdentity"
import { runDurableNeedleTest } from "~/services/verification/webAiApiCheck/needleCheckpoint"
import { createNeedleResult } from "~~/tests/test-utils/needle"

const request = {
  baseUrl: "https://example.invalid",
  apiKey: "secret",
  apiType: "openai-compatible" as const,
  modelId: "test",
  seed: 123,
}
const counter = { encoding: CONTEXT_TOKEN_ENCODINGS.O200k, estimated: true }
beforeEach(() => vi.restoreAllMocks())

it("finalizes a failed preparation with retained measurements before another explicit run", async () => {
  const needle = await import("~/services/verification/modelQuality/needleRun")
  const observed = createNeedleResult({
    reason: "running",
    cells: [
      {
        targetTokens: 8192,
        depth: 10,
        actualDepth: 10,
        localInputTokens: 8000,
        outcome: "hit",
      },
    ],
  })
  const failure = new Error("Preparation failed")
  const run = vi
    .spyOn(needle, "runNeedleTest")
    .mockImplementationOnce(async (params) => {
      await params.onCheckpoint?.(observed)
      throw failure
    })
    .mockResolvedValue(createNeedleResult({ seed: 456 }))
  await expect(
    runDurableNeedleTest({
      ...request,
      abortSignal: new AbortController().signal,
    }),
  ).rejects.toBe(failure)
  expect((await needleHistory.get(request))?.result).toEqual({
    ...observed,
    reason: "error",
  })
  expect(
    await new Storage({ area: "local" }).get(
      WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS,
    ),
  ).toEqual({})
  const next = await runDurableNeedleTest({
    ...request,
    seed: 456,
    abortSignal: new AbortController().signal,
  })
  expect(next.seed).toBe(456)
  expect(run).toHaveBeenCalledTimes(2)
})

it.each([false, true])(
  "retains completed measurements after history save failure; recoverOnly=%s",
  async (recoverOnly) => {
    const needle = await import(
      "~/services/verification/modelQuality/needleRun"
    )
    const completed = createNeedleResult()
    const run = vi
      .spyOn(needle, "runNeedleTest")
      .mockImplementationOnce(async (params) => {
        await params.onCheckpoint?.(completed)
        return completed
      })
      .mockResolvedValue(createNeedleResult({ seed: 456 }))
    const save = vi
      .spyOn(needleHistory, "save")
      .mockRejectedValue(new Error("History unavailable"))
    await expect(
      runDurableNeedleTest({
        ...request,
        abortSignal: new AbortController().signal,
      }),
    ).rejects.toThrow("History unavailable")
    expect(
      await new Storage({ area: "local" }).get(
        WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS,
      ),
    ).toHaveProperty(await getVerificationScopeKey(request))
    save.mockRestore()
    const next = await runDurableNeedleTest(
      { ...request, seed: 456, abortSignal: new AbortController().signal },
      recoverOnly,
    )
    expect(next.seed).toBe(recoverOnly ? completed.seed : 456)
    expect(run).toHaveBeenCalledTimes(recoverOnly ? 1 : 2)
  },
)

it("shares execution and checkpoint identity between a Google endpoint and its root", async () => {
  const needle = await import("~/services/verification/modelQuality/needleRun")
  const root = { ...request, apiType: "google" as const }
  const alias = {
    ...root,
    baseUrl: `${root.baseUrl}/v1beta/models/test:generateContent`,
  }
  const scope = await getVerificationScopeKey(root)
  const store = new Storage({ area: "local" })
  const result = createNeedleResult()
  const run = vi
    .spyOn(needle, "runNeedleTest")
    .mockImplementation(async (params) => {
      expect(params.baseUrl).toBe(root.baseUrl)
      await params.onCheckpoint?.(result)
      expect(
        await store.get(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS),
      ).toHaveProperty(scope)
      return result
    })
  await runDurableNeedleTest({
    ...alias,
    abortSignal: new AbortController().signal,
  })
  expect(run).toHaveBeenCalledOnce()
  expect((await needleHistory.get(root))?.result).toEqual(result)
})

it.each([
  { result: { version: 999 } },
  { result: createNeedleResult(), inFlight: { targetTokens: 4096, depth: 10 } },
  { result: createNeedleResult(), inFlight: { targetTokens: 8192, depth: 25 } },
])(
  "retains invalid checkpoints for explicit discard without replaying requests %#",
  async (checkpoint) => {
    const scope = await getVerificationScopeKey(request)
    const store = new Storage({ area: "local" })
    await store.set(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS, {
      [scope]: checkpoint,
    })
    const fetch = vi.spyOn(globalThis, "fetch")
    await expect(
      runDurableNeedleTest(
        { ...request, abortSignal: new AbortController().signal },
        true,
      ),
    ).rejects.toThrow(/Invalid needle checkpoint/)
    expect(fetch).not.toHaveBeenCalled()
    expect(
      await store.get(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS),
    ).toEqual({ [scope]: checkpoint })
  },
)

it("does not start a new run when recovery has no saved checkpoint", async () => {
  const fetch = vi.spyOn(globalThis, "fetch")
  await expect(
    runDurableNeedleTest(
      { ...request, abortSignal: new AbortController().signal },
      true,
    ),
  ).rejects.toThrow("No needle checkpoint")
  expect(fetch).not.toHaveBeenCalled()
})

it("continues matching saved measurements with the compatible capacity observation", async () => {
  const needle = await import("~/services/verification/modelQuality/needleRun")
  const { contextCapacityHistory } = await import(
    "~/services/verification/verificationResultHistory/contextCapacityHistory"
  )
  const previous = createNeedleResult()
  await needleHistory.save(request, previous)
  const run = vi.spyOn(needle, "runNeedleTest").mockResolvedValue(previous)
  const capacity = vi.spyOn(contextCapacityHistory, "get").mockResolvedValue({
    scopeKey: "test",
    targetKey: "test",
    verifiedAt: Date.now(),
    apiType: "openai-compatible",
    modelId: "test",
    lowerBoundTokens: 32768,
    reason: "test-limit",
    requests: 1,
    outputLimited: false,
    counter,
  })
  try {
    await runDurableNeedleTest({
      ...request,
      resumeFrom: previous,
      selection: { depth: 50 },
      abortSignal: new AbortController().signal,
    })
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeFrom: previous,
        capacity: { lowerBoundTokens: 32768, counter },
      }),
    )
  } finally {
    run.mockRestore()
    capacity.mockRestore()
  }
})

it("keeps recoverable evidence when saving restored history fails and releases ownership for retry", async () => {
  const scope = await getVerificationScopeKey(request)
  const store = new Storage({ area: "local" })
  await store.set(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS, {
    [scope]: { result: createNeedleResult({ reason: "running" }) },
  })
  const save = vi
    .spyOn(needleHistory, "save")
    .mockRejectedValueOnce(new Error("Storage unavailable"))
  await expect(
    runDurableNeedleTest(
      { ...request, abortSignal: new AbortController().signal },
      true,
    ),
  ).rejects.toThrow("Storage unavailable")
  expect(
    await store.get(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS),
  ).toHaveProperty(scope)
  save.mockRestore()
  await expect(
    runDurableNeedleTest(
      { ...request, abortSignal: new AbortController().signal },
      true,
    ),
  ).resolves.toMatchObject({ reason: "interrupted" })
})

it("recovers an interrupted dispatched cell without issuing another provider request", async () => {
  const scope = await getVerificationScopeKey(request)
  const store = new Storage({ area: "local" })
  await store.set(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS, {
    [scope]: {
      result: createNeedleResult({
        plan: createNeedlePlan({ counter }),
        counter,
        reason: NEEDLE_RUN_REASONS.Running,
        cells: [],
      }),
      inFlight: { targetTokens: 8192, depth: 10 },
    },
  })
  const fetch = vi.spyOn(globalThis, "fetch")
  const result = await runDurableNeedleTest(
    { ...request, abortSignal: new AbortController().signal },
    true,
  )
  expect(result).toMatchObject({
    reason: NEEDLE_RUN_REASONS.Interrupted,
    cells: [
      { targetTokens: 8192, depth: 10, outcome: NEEDLE_OUTCOMES.Interrupted },
    ],
  })
  expect(fetch).not.toHaveBeenCalled()
  expect((await needleHistory.get(request))?.result.reason).toBe("interrupted")
  expect(
    await store.get(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS),
  ).toEqual({})
})

it("rejects continuation when its saved result belongs to another connection", async () => {
  const previous = createNeedleResult({
    plan: createNeedlePlan({ counter }),
    counter,
    reason: NEEDLE_RUN_REASONS.Stopped,
    cells: [],
  })
  await needleHistory.save(request, previous)
  const fetch = vi.spyOn(globalThis, "fetch")
  await expect(
    runDurableNeedleTest({
      ...request,
      apiKey: "different-connection",
      resumeFrom: previous,
      selection: { depth: 50 },
      abortSignal: new AbortController().signal,
    }),
  ).rejects.toThrow("different connection")
  expect(fetch).not.toHaveBeenCalled()
})

it("replaces an interrupted retest with one unknown cell and retains other measurements", async () => {
  const scope = await getVerificationScopeKey(request)
  const store = new Storage({ area: "local" })
  await store.set(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS, {
    [scope]: {
      result: createNeedleResult({
        plan: createNeedlePlan({ counter }),
        counter,
        reason: NEEDLE_RUN_REASONS.Running,
        scheduled: [{ targetTokens: 8192, depth: 10 }],
        processed: 0,
        cells: [
          {
            targetTokens: 8192,
            depth: 10,
            actualDepth: 10,
            localInputTokens: 8000,
            outcome: NEEDLE_OUTCOMES.Hit,
          },
          {
            targetTokens: 8192,
            depth: 50,
            actualDepth: 50,
            localInputTokens: 8000,
            outcome: NEEDLE_OUTCOMES.Hit,
          },
        ],
      }),
      inFlight: { targetTokens: 8192, depth: 10 },
    },
  })
  const fetch = vi.spyOn(globalThis, "fetch")
  const recovered = await runDurableNeedleTest(
    { ...request, abortSignal: new AbortController().signal },
    true,
  )
  expect(recovered.cells).toHaveLength(2)
  expect(recovered.processed).toBe(1)
  expect((await needleHistory.get(request))?.result).toMatchObject({
    scheduled: [{ targetTokens: 8192, depth: 10 }],
    processed: 1,
  })
  expect(recovered.cells.map(({ depth, outcome }) => [depth, outcome])).toEqual(
    [
      [10, "interrupted"],
      [50, "hit"],
    ],
  )
  expect(fetch).not.toHaveBeenCalled()
})
