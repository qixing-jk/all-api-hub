import { beforeEach, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { WEB_AI_API_CHECK_STORAGE_KEYS } from "~/services/core/storageKeys"
import { MODEL_METADATA_URL } from "~/services/models/modelMetadata/constants"
import { CONTEXT_TOKEN_ENCODINGS } from "~/services/verification/modelQuality/contextTokenConstants"
import {
  NEEDLE_OUTCOMES,
  NEEDLE_RUN_REASONS,
} from "~/services/verification/modelQuality/needleConstants"
import {
  createNeedlePlan,
  expandNeedlePlan,
} from "~/services/verification/modelQuality/needlePlan"
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

it("rejects an invalid connection without dispatching a provider request", async () => {
  const fetch = vi.spyOn(globalThis, "fetch")
  await expect(
    runDurableNeedleTest({
      ...request,
      baseUrl: "not a URL",
      abortSignal: new AbortController().signal,
    }),
  ).rejects.toThrow("Invalid base URL")
  expect(fetch).not.toHaveBeenCalled()
})

it.each(["google", "openai-compatible"] as const)(
  "preserves consecutive protocol version segments through real %s dispatch and history",
  async (apiType) => {
    const version = apiType === "google" ? "v1beta" : "v1"
    const mount = `https://example.invalid/relay/${version}/${version}`
    const operation =
      apiType === "google" ? "models/test:generateContent" : "chat/completions"
    const urls: string[] = []
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (input) => {
        const url = input instanceof Request ? input.url : String(input)
        if (url === MODEL_METADATA_URL) return Response.json({ models: [] })
        urls.push(url)
        return Response.json(
          apiType === "google"
            ? {
                candidates: [
                  {
                    content: { role: "model", parts: [{ text: "wrong" }] },
                    finishReason: "STOP",
                  },
                ],
              }
            : {
                id: "needle",
                object: "chat.completion",
                created: 1,
                model: "test",
                choices: [
                  {
                    index: 0,
                    message: { role: "assistant", content: "wrong" },
                    finish_reason: "stop",
                  },
                ],
              },
        )
      })
    try {
      const result = await runDurableNeedleTest({
        ...request,
        apiType,
        baseUrl: `${mount}/${operation}`,
        mode: "non-streaming",
        maxInputTokens: 1024,
        quick: true,
        abortSignal: new AbortController().signal,
      })
      expect(urls).toEqual(Array(3).fill(`${mount}/${operation}`))
      expect(result.cells.map((cell) => cell.outcome)).toEqual([
        "miss",
        "miss",
        "miss",
      ])
      expect(
        (
          await needleHistory.get({
            ...request,
            apiType,
            baseUrl: mount,
            mode: "non-streaming",
          })
        )?.result,
      ).toMatchObject({
        seed: result.seed,
        plan: result.plan,
        cells: result.cells.map(({ targetTokens, depth, outcome }) => ({
          targetTokens,
          depth,
          outcome,
        })),
      })
    } finally {
      fetch.mockRestore()
    }
  },
)

it("executes the selected retry from a recovered recipe without replaying other cells", async () => {
  const { modelMetadataService } = await import(
    "~/services/models/modelMetadata"
  )
  modelMetadataService.clearCache()
  let requests = 0
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url === MODEL_METADATA_URL) return Response.json({ models: [] })
      requests++
      return Response.json({
        id: "needle",
        object: "chat.completion",
        created: 1,
        model: "test",
        usage: {
          prompt_tokens: requests === 4 ? 1001 : 1000,
          completion_tokens: 1,
        },
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "wrong" },
            finish_reason: "stop",
          },
        ],
      })
    })
  const save = vi
    .spyOn(needleHistory, "save")
    .mockRejectedValueOnce(new Error("Storage unavailable"))
    .mockRejectedValueOnce(new Error("Storage unavailable"))
  const params = {
    ...request,
    mode: "non-streaming" as const,
    maxInputTokens: 1024,
    quick: true,
    abortSignal: new AbortController().signal,
  }
  try {
    await expect(runDurableNeedleTest(params)).rejects.toThrow(
      "Storage unavailable",
    )
    expect(requests).toBe(3)
    expect(await needleHistory.get(params)).toBeNull()
    const store = new Storage({ area: "local" })
    const scope = await getVerificationScopeKey(params)
    const checkpoints = await store.get<
      Record<string, { result: { cells: unknown[] } }>
    >(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS)
    const previousCells = checkpoints![scope]!.result.cells
    const result = await runDurableNeedleTest({
      ...params,
      seed: 456,
      maxInputTokens: 8192,
      selection: { depth: 10 },
      approvedPlan: createNeedlePlan({ counter, maxInputTokens: 1024 }),
      approvedCounter: counter,
    })
    expect(requests).toBe(4)
    expect(result.seed).toBe(123)
    expect(result.plan.limit).toBe(1024)
    expect(result.scheduled).toEqual([{ targetTokens: 1024, depth: 10 }])
    expect(result.cells.filter((cell) => cell.depth !== 10)).toEqual(
      previousCells.slice(1),
    )
    expect(result.cells).toHaveLength(3)
    const retried = result.cells.find((cell) => cell.depth === 10)
    expect(retried?.inputTokens).toBe(1001)
    const history = await needleHistory.get(params)
    expect(history?.result.seed).toBe(123)
    expect(
      history?.result.cells.find((cell) => cell.depth === 10)?.inputTokens,
    ).toBe(1001)
    expect(
      await store.get(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS),
    ).toEqual({})
  } finally {
    save.mockRestore()
    fetch.mockRestore()
    modelMetadataService.clearCache()
  }
})

it.each(["smaller", "missing"] as const)(
  "restores a terminal checkpoint without dispatch when the approved scope is %s",
  async (approval) => {
    const store = new Storage({ area: "local" })
    const scope = await getVerificationScopeKey(request)
    const previous = createNeedleResult({
      counter,
      plan: createNeedlePlan({ counter, maxInputTokens: 16384 }),
      cells: [
        {
          targetTokens: 16384,
          depth: 50,
          actualDepth: 50,
          localInputTokens: 16000,
          outcome: "hit",
        },
      ],
    })
    await store.set(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS, {
      [scope]: { result: previous },
    })
    const fetch = vi.spyOn(globalThis, "fetch")
    await expect(
      runDurableNeedleTest({
        ...request,
        selection: { depth: 10 },
        approvedPlan:
          approval === "smaller"
            ? createNeedlePlan({ counter, maxInputTokens: 8192 })
            : undefined,
        approvedCounter: counter,
        abortSignal: new AbortController().signal,
      }),
    ).rejects.toThrow("review the saved result")
    expect(fetch).not.toHaveBeenCalled()
    expect((await needleHistory.get(request))?.result).toEqual(previous)
    expect(
      await store.get(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS),
    ).toEqual({})
  },
)

it("allows a recovered cell retry within the approved scope of a smaller plan", async () => {
  const { modelMetadataService } = await import(
    "~/services/models/modelMetadata"
  )
  modelMetadataService.clearCache()
  const params = { ...request, mode: "non-streaming" as const }
  const store = new Storage({ area: "local" })
  const scope = await getVerificationScopeKey(params)
  const previous = createNeedleResult({
    counter,
    plan: createNeedlePlan({ counter, maxInputTokens: 16384 }),
    cells: [
      {
        targetTokens: 8192,
        depth: 10,
        actualDepth: 10,
        localInputTokens: 8000,
        inputTokens: 8000,
        outcome: "hit",
      },
      ...([50, 90] as const).map((depth) => ({
        targetTokens: 16384,
        depth,
        actualDepth: depth,
        localInputTokens: 16000,
        inputTokens: 16000,
        outcome: "hit" as const,
      })),
    ],
  })
  await store.set(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS, {
    [scope]: { result: previous },
  })
  const urls: string[] = []
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : String(input)
      if (url === MODEL_METADATA_URL) return Response.json({ models: [] })
      urls.push(url)
      return Response.json({
        id: "needle",
        object: "chat.completion",
        created: 1,
        model: "test",
        usage: { prompt_tokens: 8001, completion_tokens: 1 },
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: "wrong" },
            finish_reason: "stop",
          },
        ],
      })
    })
  try {
    const result = await runDurableNeedleTest({
      ...params,
      seed: 456,
      selection: { targetTokens: 8192, depth: 10 },
      approvedPlan: createNeedlePlan({ counter, maxInputTokens: 8192 }),
      approvedCounter: counter,
      abortSignal: new AbortController().signal,
    })
    expect(urls).toEqual(["https://example.invalid/v1/chat/completions"])
    expect(result.seed).toBe(previous.seed)
    expect(result.plan).toEqual(expandNeedlePlan(previous.plan))
    expect(result.scheduled).toEqual([{ targetTokens: 8192, depth: 10 }])
    expect(result.cells).toHaveLength(3)
    expect(result.cells[0]).toMatchObject({
      targetTokens: 8192,
      depth: 10,
      inputTokens: 8001,
      outcome: "miss",
    })
    expect(result.cells.slice(1)).toEqual(previous.cells.slice(1))
    const history = await needleHistory.get(params)
    expect(history?.result.cells).toHaveLength(3)
    expect(history?.result.cells[0]).toMatchObject({
      targetTokens: 8192,
      depth: 10,
      inputTokens: 8001,
      outcome: "miss",
    })
    expect(history?.result.cells.slice(1)).toEqual(previous.cells.slice(1))
    expect(
      await store.get(WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS),
    ).toEqual({})
  } finally {
    fetch.mockRestore()
    modelMetadataService.clearCache()
  }
})

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
  const root = {
    ...request,
    apiType: "google" as const,
    baseUrl: "https://example.invalid/v1beta/proxy",
  }
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
      expect(params.baseUrl).toBe(`${root.baseUrl}/v1beta`)
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
