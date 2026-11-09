import { afterEach, expect, it, vi } from "vitest"

import { modelMetadataService } from "~/services/models/modelMetadata"
import { MODEL_METADATA_URL } from "~/services/models/modelMetadata/constants"
import * as probeGeneration from "~/services/verification/aiApiVerification/probes/probeGeneration"
import { NEEDLE_OUTCOMES } from "~/services/verification/modelQuality/needleConstants"
import { createNeedlePlan } from "~/services/verification/modelQuality/needlePlan"
import * as needlePrompt from "~/services/verification/modelQuality/needlePrompt"
import { coerceNeedleResult } from "~/services/verification/modelQuality/needleResultCodec"
import {
  runNeedleTest,
  type NeedleResult,
  type NeedleRunControls,
} from "~/services/verification/modelQuality/needleRun"
import { createDeferred } from "~~/tests/test-utils/deferred"
import { createNeedleResult } from "~~/tests/test-utils/needle"

const params = {
  baseUrl: "https://example.invalid",
  apiKey: "test-secret",
  apiType: "openai-compatible" as const,
  modelId: "test",
  mode: "non-streaming" as const,
  maxInputTokens: 1024,
  quick: true,
  seed: 123,
}

it("propagates a preparation failure before dispatch without retrying it", async () => {
  const failure = new Error("Preparation failed")
  const prepare = vi
    .spyOn(needlePrompt, "prepareNeedlePrompt")
    .mockRejectedValue(failure)
  const fetch = vi.fn(async (_url: unknown) => Response.json({ models: [] }))
  vi.stubGlobal("fetch", fetch)
  try {
    await expect(
      runNeedleTest({ ...params, abortSignal: new AbortController().signal }),
    ).rejects.toBe(failure)
    expect(prepare).toHaveBeenCalledOnce()
    expect(
      fetch.mock.calls.every(([url]) => String(url) === MODEL_METADATA_URL),
    ).toBe(true)
  } finally {
    prepare.mockRestore()
  }
})

it.each([
  { seed: -1 },
  { seed: 0.5 },
  {
    approvedPlan: {
      ...createNeedlePlan({
        counter: { encoding: "o200k_base", estimated: true },
        maxInputTokens: 1024,
      }),
      requests: 5,
    },
  },
  {
    approvedPlan: createNeedlePlan({
      counter: { encoding: "o200k_base", estimated: true },
      maxInputTokens: 1024,
    }),
    approvedCounter: { encoding: "cl100k_base", estimated: true },
  },
  { resumeFrom: createNeedleResult({ seed: 456 }) },
  { cancelledCells: [{ targetTokens: 999, depth: 50 }] },
])(
  "rejects invalid or incompatible approved runs before any inference request %#",
  async (override) => {
    const fetch = vi.fn(async (_url: unknown) => Response.json({ models: [] }))
    vi.stubGlobal("fetch", fetch)
    await expect(
      runNeedleTest({
        ...params,
        ...override,
        abortSignal: new AbortController().signal,
      }),
    ).rejects.toThrow()
    expect(
      fetch.mock.calls.every(([url]) => String(url) === MODEL_METADATA_URL),
    ).toBe(true)
  },
)

it.each(["preparation", "checkpoint"])(
  "stops the whole run during %s without recording unsent measurements",
  async (phase) => {
    const controller = new AbortController()
    let requests = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (String(url) === MODEL_METADATA_URL)
          return Response.json({ models: [] })
        requests++
        return completion("wrong")
      }),
    )
    const result = await runNeedleTest({
      ...params,
      abortSignal: controller.signal,
      onProgress: (value) => {
        if (phase === "preparation" && value.preparing) controller.abort()
      },
      onCheckpoint: async (_value, inFlight) => {
        if (phase === "checkpoint" && inFlight) controller.abort()
      },
    })
    expect(requests).toBe(0)
    expect(result).toMatchObject({ reason: "stopped", cells: [], processed: 0 })
  },
)

it("honors a cell stop during checkpoint persistence and sends the remaining cells", async () => {
  let controls: NeedleRunControls | undefined
  let requests = 0
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (String(url) === MODEL_METADATA_URL)
        return Response.json({ models: [] })
      requests++
      return completion("wrong")
    }),
  )
  const result = await runNeedleTest({
    ...params,
    abortSignal: new AbortController().signal,
    onControls: (value) => {
      controls = value
    },
    onCheckpoint: async (_value, inFlight) => {
      if (inFlight?.depth === 10) await controls!.stopSelection(inFlight)
    },
  })
  expect(requests).toBe(2)
  expect(result.cells.map(({ depth }) => depth)).toEqual([50, 90])
  expect(result.cancelled).toEqual([{ targetTokens: 1024, depth: 10 }])
  expect(result.processed).toBe(2)
})

it.each(["run", "cell"])(
  "honors a %s stop when preparation has just settled",
  async (scope) => {
    const controller = new AbortController()
    let controls: NeedleRunControls | undefined
    let requests = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (String(url) === MODEL_METADATA_URL)
          return Response.json({ models: [] })
        requests++
        return completion("wrong")
      }),
    )
    const prepare = needlePrompt.prepareNeedlePrompt
    const prepared = vi
      .spyOn(needlePrompt, "prepareNeedlePrompt")
      .mockImplementation(async (...args) => {
        const value = await prepare(...args)
        if (args[2] === 10) {
          if (scope === "run") controller.abort()
          else await controls!.stopSelection({ depth: 10 })
        }
        return value
      })
    try {
      const result = await runNeedleTest({
        ...params,
        abortSignal: controller.signal,
        onControls: (value) => {
          controls = value
        },
      })
      expect(requests).toBe(scope === "run" ? 0 : 2)
      expect(result.cells.map(({ depth }) => depth)).toEqual(
        scope === "run" ? [] : [50, 90],
      )
      expect(result.reason).toBe("stopped")
    } finally {
      prepared.mockRestore()
    }
  },
)

it("honors cells cancelled before the background starts without sending those requests", async () => {
  let requests = 0
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (String(url) === MODEL_METADATA_URL)
        return Response.json({ models: [] })
      requests++
      return completion("wrong")
    }),
  )
  const result = await runNeedleTest({
    ...params,
    cancelledCells: [{ targetTokens: 1024, depth: 50 }],
    abortSignal: new AbortController().signal,
  })
  expect(requests).toBe(2)
  expect(result.cells.map((cell) => cell.depth)).toEqual([10, 90])
  expect(result.cancelled).toEqual([{ targetTokens: 1024, depth: 50 }])
  expect(result.reason).toBe("stopped")
})

it("stops only the selected in-flight cell and continues the remaining requests", async () => {
  const dispatched = createDeferred<void>()
  const finish = createDeferred<void>()
  let controls: NeedleRunControls | undefined
  let requests = 0
  let interruptedSignal: AbortSignal | null | undefined
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url) === MODEL_METADATA_URL)
        return Response.json({ models: [] })
      requests++
      if (requests === 2) {
        interruptedSignal = init?.signal
        dispatched.resolve()
        await Promise.race([
          finish.promise,
          new Promise((_, reject) =>
            init?.signal?.addEventListener(
              "abort",
              () => reject(init.signal?.reason),
              { once: true },
            ),
          ),
        ])
      }
      return completion("wrong")
    }),
  )
  const execution = runNeedleTest({
    ...params,
    abortSignal: new AbortController().signal,
    onControls: (value) => {
      controls = value
    },
  })
  await dispatched.promise
  try {
    expect(controls).toBeDefined()
    expect(
      await controls!.stopSelection({ targetTokens: 1024, depth: 50 }),
    ).toBe(true)
    expect(interruptedSignal?.aborted).toBe(true)
  } finally {
    finish.resolve()
    await execution
  }
  const result = await execution
  expect(requests).toBe(3)
  expect(result.cells.map((cell) => cell.outcome)).toEqual([
    "miss",
    "interrupted",
    "miss",
  ])
  expect(result.cancelled).toEqual([{ targetTokens: 1024, depth: 50 }])
  expect(coerceNeedleResult(result)?.cancelled).toEqual([
    { targetTokens: 1024, depth: 50 },
  ])
  expect(result.reason).toBe("stopped")
  expect(await controls!.stopSelection({ depth: 90 })).toBe(false)
})

it("publishes preparation before dispatch and counts only the selected run's requests", async () => {
  const progress: NeedleResult[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) =>
      String(url) === MODEL_METADATA_URL
        ? Response.json({ models: [] })
        : completion("wrong"),
    ),
  )
  const result = await runNeedleTest({
    ...params,
    selection: { depth: 50 },
    abortSignal: new AbortController().signal,
    onProgress: (value) => progress.push(value),
    onCheckpoint: async (_value, inFlight) => {
      if (inFlight)
        expect(progress.at(-1)?.preparing).toEqual({
          targetTokens: 1024,
          depth: 50,
        })
    },
  })
  expect(progress[0]).toMatchObject({
    scheduled: [{ targetTokens: 1024, depth: 50 }],
    processed: 0,
  })
  expect(result.processed).toBe(1)
  expect(result.scheduled).toEqual([{ targetTokens: 1024, depth: 50 }])
  expect(result.preparing).toBeUndefined()
})

it.each([
  {
    name: "current row",
    selection: { targetTokens: 8192 },
    requests: 5,
    cancelled: [
      [8192, 50],
      [8192, 90],
    ],
    second: "interrupted",
  },
  {
    name: "crossing column",
    selection: { depth: 50 },
    requests: 5,
    cancelled: [
      [8192, 50],
      [16384, 50],
    ],
    second: "interrupted",
  },
  {
    name: "queued row",
    selection: { targetTokens: 16384 },
    requests: 3,
    cancelled: [
      [16384, 10],
      [16384, 50],
      [16384, 90],
    ],
    second: "miss",
  },
  {
    name: "queued cell",
    selection: { targetTokens: 8192, depth: 90 },
    requests: 5,
    cancelled: [[8192, 90]],
    second: "miss",
  },
])(
  "cancels the $name while retaining completed and unrelated work",
  async ({ selection, requests: expectedRequests, cancelled, second }) => {
    let controls: NeedleRunControls | undefined
    let requests = 0
    const progress: NeedleResult[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown, init?: RequestInit) => {
        if (String(url) === MODEL_METADATA_URL)
          return Response.json({ models: [] })
        requests++
        if (requests === 2) {
          expect(await controls!.stopSelection(selection)).toBe(true)
          expect(await controls!.stopSelection(selection)).toBe(false)
          expect(await controls!.stopSelection({ targetTokens: 999 })).toBe(
            false,
          )
          // @ts-expect-error Deliberately exercise a malformed runtime selection.
          expect(await controls!.stopSelection({})).toBe(false)
          if (init?.signal?.aborted) throw init.signal.reason
        }
        return completion("wrong")
      }),
    )
    const result = await runNeedleTest({
      ...params,
      maxInputTokens: 16384,
      quick: false,
      abortSignal: new AbortController().signal,
      onControls: (value) => {
        controls = value
      },
      onProgress: (value) => progress.push(value),
    })
    expect(requests).toBe(expectedRequests)
    expect(result.reason).toBe("stopped")
    expect(result.cells[0]).toMatchObject({
      targetTokens: 8192,
      depth: 10,
      outcome: NEEDLE_OUTCOMES.Miss,
    })
    expect(result.cells[1]).toMatchObject({
      targetTokens: 8192,
      depth: 50,
      outcome: second,
    })
    expect(
      result.cancelled?.map((cell) => [cell.targetTokens, cell.depth]),
    ).toEqual(cancelled)
    expect(result.processed).toBe(expectedRequests)
    for (const update of progress.filter((value) => value.cancelled?.length)) {
      expect(
        update.pending?.some((cell) =>
          update.cancelled!.some(
            (item) =>
              item.targetTokens === cell.targetTokens &&
              item.depth === cell.depth,
          ),
        ),
      ).not.toBe(true)
    }
  },
)

it("cancels during preparation without inventing a dispatched measurement", async () => {
  let controls: NeedleRunControls | undefined
  let requests = 0
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (String(url) === MODEL_METADATA_URL)
        return Response.json({ models: [] })
      requests++
      return completion("wrong")
    }),
  )
  const result = await runNeedleTest({
    ...params,
    abortSignal: new AbortController().signal,
    onControls: (value) => {
      controls = value
    },
    onProgress: (value) => {
      if (value.preparing?.depth === 10 && !value.cancelled?.length)
        void controls!.stopSelection({ depth: 10 })
    },
  })
  expect(requests).toBe(2)
  expect(result.cells.map((cell) => cell.depth)).toEqual([50, 90])
  expect(result.cancelled).toEqual([{ targetTokens: 1024, depth: 10 }])
})

it("interrupts an open response stream and continues the next cell", async () => {
  const opened = createDeferred<void>()
  let controls: NeedleRunControls | undefined
  let requests = 0
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url) === MODEL_METADATA_URL)
        return Response.json({ models: [] })
      requests++
      const encoder = new TextEncoder()
      const chunk = (delta: object, finish_reason: string | null) =>
        encoder.encode(
          `data: ${JSON.stringify({ id: "needle", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta, finish_reason }] })}\n\n`,
        )
      const body = new ReadableStream({
        start(controller) {
          controller.enqueue(
            chunk({ role: "assistant", content: "wrong" }, null),
          )
          if (requests === 2) {
            init?.signal?.addEventListener(
              "abort",
              () => controller.error(init.signal?.reason),
              { once: true },
            )
            opened.resolve()
          } else {
            controller.enqueue(chunk({}, "stop"))
            controller.enqueue(encoder.encode("data: [DONE]\n\n"))
            controller.close()
          }
        },
      })
      return new Response(body, {
        headers: { "Content-Type": "text/event-stream" },
      })
    }),
  )
  const controller = new AbortController()
  const execution = runNeedleTest({
    ...params,
    mode: "streaming",
    abortSignal: controller.signal,
    onControls: (value) => {
      controls = value
    },
  })
  try {
    await opened.promise
    await controls!.stopSelection({ targetTokens: 1024, depth: 50 })
    const result = await execution
    expect(requests).toBe(3)
    expect(result.cells.map((cell) => cell.outcome)).toEqual([
      "miss",
      "interrupted",
      "miss",
    ])
    expect(result.reason).toBe("stopped")
  } finally {
    controller.abort()
    await execution
  }
})

it("keeps an accepted stop when the streaming result settles at the same time", async () => {
  let controls: NeedleRunControls | undefined
  let requests = 0
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (String(url) === MODEL_METADATA_URL)
        return Response.json({ models: [] })
      requests++
      const event = (delta: object, finish_reason: string | null) =>
        `data: ${JSON.stringify({ id: "needle", object: "chat.completion.chunk", created: 1, model: "test", choices: [{ index: 0, delta, finish_reason }] })}\n\n`
      return new Response(
        event({ role: "assistant", content: "wrong" }, null) +
          event({}, "stop") +
          "data: [DONE]\n\n",
        {
          headers: { "Content-Type": "text/event-stream" },
        },
      )
    }),
  )
  const generate = probeGeneration.runProbeGeneration
  const generation = vi
    .spyOn(probeGeneration, "runProbeGeneration")
    .mockImplementation(async (...args) => {
      const result = await generate(...args)
      // The SDK aggregate has settled, but the runner has not recorded it yet.
      if (requests === 2)
        expect(
          await controls!.stopSelection({ targetTokens: 1024, depth: 50 }),
        ).toBe(true)
      return result
    })
  try {
    const result = await runNeedleTest({
      ...params,
      mode: "streaming",
      abortSignal: new AbortController().signal,
      onControls: (value) => {
        controls = value
      },
    })
    expect(requests).toBe(3)
    expect(result.cells.map((cell) => cell.outcome)).toEqual([
      "miss",
      "interrupted",
      "miss",
    ])
    expect(result.cells[1]!.response).toBeUndefined()
    expect(result.cancelled).toEqual([{ targetTokens: 1024, depth: 50 }])
    expect(result.reason).toBe("stopped")
  } finally {
    generation.mockRestore()
  }
})

afterEach(() => {
  vi.unstubAllGlobals()
  modelMetadataService.clearCache()
})

function completion(text: string, finish = "stop", input = 990) {
  return Response.json({
    id: "needle",
    object: "chat.completion",
    created: 1,
    model: "test",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: text },
        finish_reason: finish,
      },
    ],
    usage: {
      prompt_tokens: input,
      completion_tokens: 20,
      total_tokens: input + 20,
    },
  })
}

it("honors a whole-run stop after publishing a completed cell", async () => {
  const controller = new AbortController()
  let requests = 0
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (String(url) === MODEL_METADATA_URL)
        return Response.json({ models: [] })
      requests++
      return completion("wrong")
    }),
  )
  const result = await runNeedleTest({
    ...params,
    abortSignal: controller.signal,
    onProgress: (progress) => {
      if (progress.processed === 1) controller.abort()
    },
  })
  expect(requests).toBe(1)
  expect(result).toMatchObject({ reason: "stopped", processed: 1 })
  expect(result.cells).toHaveLength(1)
})

it.each([
  {
    apiType: "openai-compatible" as const,
    error: {
      error: { message: "Input rejected", code: "context_length_exceeded" },
    },
  },
  {
    apiType: "openai-compatible" as const,
    error: {
      error: {
        message: "Input rejected",
        code: "upstream_error",
        innererror: { code: "context_length_exceeded" },
      },
    },
  },
  {
    apiType: "openai" as const,
    error: {
      type: "error",
      sequence_number: 1,
      code: "model_context_window_exceeded",
      message: "Input rejected",
      param: null,
    },
  },
])(
  "records a statusless SSE overflow as a context limit and stops the needle plan without retrying: $apiType $error",
  async ({ apiType, error }) => {
    let requests = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) => {
        if (String(url) === MODEL_METADATA_URL)
          return Response.json({ models: [] })
        requests++
        return new Response(
          `: PING\n\ndata: ${JSON.stringify(error)}\n\ndata: [DONE]\n\n`,
          { headers: { "Content-Type": "text/event-stream" } },
        )
      }),
    )
    const result = await runNeedleTest({
      ...params,
      apiType,
      mode: "streaming",
      abortSignal: new AbortController().signal,
    })
    expect(result).toMatchObject({ reason: "error", processed: 1 })
    expect(result.cells).toHaveLength(1)
    expect(result.cells[0]).toMatchObject({
      targetTokens: 1024,
      depth: 10,
      outcome: NEEDLE_OUTCOMES.ContextLimit,
    })
    expect(requests).toBe(1)
  },
)

it.each([
  {
    response: () => completion("wrong"),
    outcome: NEEDLE_OUTCOMES.Miss,
    count: 3,
  },
  {
    response: () => completion("", "length"),
    outcome: NEEDLE_OUTCOMES.Incomplete,
    count: 3,
  },
  {
    response: () =>
      new Response(
        ': PING\n\ndata: {"error":{"message":"maximum context length exceeded","code":400}}\n\ndata: [DONE]\n\n',
        { headers: { "Content-Type": "text/event-stream" } },
      ),
    mode: "streaming" as const,
    outcome: NEEDLE_OUTCOMES.ContextLimit,
    count: 1,
  },
  {
    response: () =>
      Response.json(
        { error: { message: "maximum context length exceeded" } },
        { status: 400 },
      ),
    outcome: NEEDLE_OUTCOMES.ContextLimit,
    count: 1,
  },
  {
    response: () =>
      Response.json(
        { error: { message: "private test-secret 429 error" } },
        { status: 429 },
      ),
    outcome: NEEDLE_OUTCOMES.Error,
    count: 1,
  },
])(
  "separates $outcome from retrieval and never retries failures",
  async ({ response, outcome, count, mode = params.mode }) => {
    let requests = 0
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: unknown) =>
        String(url) === MODEL_METADATA_URL
          ? Response.json({ models: [] })
          : (requests++, response()),
      ),
    )
    const result = await runNeedleTest({
      ...params,
      mode,
      abortSignal: new AbortController().signal,
    })
    expect(result.cells[0]?.outcome).toBe(outcome)
    expect(requests).toBe(count)
    expect(JSON.stringify(result)).not.toContain("test-secret")
  },
)

it("stops at the input budget and gives an explicit retest a fresh budget", async () => {
  let requests = 0
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) =>
      String(url) === MODEL_METADATA_URL
        ? Response.json({ models: [] })
        : (requests++, completion("wrong", "stop", 9000000)),
    ),
  )
  const result = await runNeedleTest({
    ...params,
    abortSignal: new AbortController().signal,
  })
  expect(result.reason).toBe("budget")
  expect(result.cells).toHaveLength(1)
  expect(requests).toBe(1)
  const repeated = await runNeedleTest({
    ...params,
    resumeFrom: result,
    selection: { targetTokens: 1024, depth: 50 },
    abortSignal: new AbortController().signal,
  })
  expect(requests).toBe(2)
  expect(repeated.processed).toBe(1)
  expect(repeated.cells.map((cell) => cell.depth)).toEqual([10, 50])
})

it("records dispatch before sending and preserves an uncertain cancelled request", async () => {
  const controller = new AbortController()
  const checkpoints: unknown[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (String(url) === MODEL_METADATA_URL)
        return Response.json({ models: [] })
      expect(checkpoints).toEqual([{ targetTokens: 1024, depth: 10 }])
      controller.abort()
      throw controller.signal.reason
    }),
  )
  const result = await runNeedleTest({
    ...params,
    abortSignal: controller.signal,
    onCheckpoint: async (_result, inFlight) => {
      checkpoints.push(inFlight)
    },
  })
  expect(result.reason).toBe("stopped")
  expect(result.cells.map((cell) => cell.outcome)).toEqual(["interrupted"])
})

it("retrieves a fresh value at three positions through the selected API without exceeding the input plan", async () => {
  const prompts: string[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url) === MODEL_METADATA_URL)
        return Response.json({ models: [] })
      const body = JSON.parse(String(init?.body))
      expect(body.stream).not.toBe(true)
      const prompt = body.messages.at(-1).content as string
      prompts.push(prompt)
      const key =
        /Question: Return only the archive code for record "([^"]+)"/.exec(
          prompt,
        )![1]
      const value = new RegExp(
        `Record "${key}" has archive code "([^"]+)"`,
      ).exec(prompt)![1]!
      expect(prompt.split(value)).toHaveLength(2)
      expect(prompt.slice(prompt.indexOf("Question:"))).not.toContain(value)
      return Response.json({
        id: "needle",
        object: "chat.completion",
        created: 1,
        model: "test",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: value },
            finish_reason: "stop",
          },
        ],
        usage: {
          prompt_tokens: 990,
          completion_tokens: 20,
          total_tokens: 1010,
        },
      })
    }),
  )
  const result = await runNeedleTest({
    ...params,
    abortSignal: new AbortController().signal,
  })
  expect(result.reason).toBe("complete")
  expect(result.cells.map((cell) => cell.outcome)).toEqual([
    "hit",
    "hit",
    "hit",
  ])
  expect(result.cells.map((cell) => cell.depth)).toEqual([10, 50, 90])
  for (const cell of result.cells) {
    expect(cell.localInputTokens).toBeLessThanOrEqual(1024)
    expect(cell.localInputTokens).toBeGreaterThan(850)
    expect(Math.abs(cell.actualDepth - cell.depth)).toBeLessThan(12)
  }
  expect(prompts).toHaveLength(3)
  expect(new Set(prompts).size).toBe(3)
  expect(new Set(result.cells.map((cell) => cell.expected)).size).toBe(1)
  const repeated = await runNeedleTest({
    ...params,
    abortSignal: new AbortController().signal,
  })
  expect(prompts.slice(3)).toEqual(prompts.slice(0, 3))
  expect(repeated.cells.map((cell) => cell.expected)).toEqual(
    result.cells.map((cell) => cell.expected),
  )
})

it("does not award a match for an answer that includes the value among other guesses", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      if (String(url) === MODEL_METADATA_URL)
        return Response.json({ models: [] })
      const prompt = JSON.parse(String(init?.body)).messages.at(-1)
        .content as string
      const key =
        /Question: Return only the archive code for record "([^"]+)"/.exec(
          prompt,
        )![1]
      const value = new RegExp(
        `Record "${key}" has archive code "([^"]+)"`,
      ).exec(prompt)![1]
      return completion(`${value} or another code`)
    }),
  )
  const result = await runNeedleTest({
    ...params,
    abortSignal: new AbortController().signal,
  })
  expect(result.cells.map((cell) => cell.outcome)).toEqual([
    "miss",
    "miss",
    "miss",
  ])
})

it("reruns every cell in a selected column or row while preserving results outside it", async () => {
  let requests = 0
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown) => {
      if (String(url) === MODEL_METADATA_URL)
        return Response.json({ models: [] })
      requests++
      return completion("wrong")
    }),
  )
  const config = {
    ...params,
    maxInputTokens: 16384,
    quick: false,
    abortSignal: new AbortController().signal,
  }
  const row = await runNeedleTest({
    ...config,
    selection: { targetTokens: 8192 },
  })
  expect(requests).toBe(3)
  expect(
    row.cells.map(({ targetTokens, depth }) => [targetTokens, depth]),
  ).toEqual([
    [8192, 10],
    [8192, 50],
    [8192, 90],
  ])
  const column = await runNeedleTest({
    ...config,
    selection: { depth: 50 },
    resumeFrom: row,
  })
  expect(requests).toBe(5)
  expect(column.scheduled).toEqual([
    { targetTokens: 8192, depth: 50 },
    { targetTokens: 16384, depth: 50 },
  ])
  expect(
    column.cells.map(({ targetTokens, depth }) => [targetTokens, depth]),
  ).toEqual([
    [8192, 10],
    [8192, 50],
    [8192, 90],
    [16384, 50],
  ])
  const repeated = await runNeedleTest({
    ...config,
    selection: { targetTokens: 8192 },
    resumeFrom: column,
  })
  expect(requests).toBe(8)
  expect(repeated.cells).toHaveLength(4)
  expect(
    repeated.cells.filter((cell) => cell.targetTokens === 16384),
  ).toMatchObject([
    { targetTokens: 16384, depth: 50, outcome: NEEDLE_OUTCOMES.Miss },
  ])
})

it.each([{ targetTokens: 2048 }, { depth: 25 }, {}])(
  "rejects selection %j outside the plan before sending a provider request",
  async (selection) => {
    const fetch = vi.fn(async (_url: unknown) => Response.json({ models: [] }))
    vi.stubGlobal("fetch", fetch)
    await expect(
      runNeedleTest({
        ...params,
        abortSignal: new AbortController().signal,
        selection: selection as any,
      }),
    ).rejects.toThrow("Invalid needle selection")
    expect(
      fetch.mock.calls.every(([url]) => String(url) === MODEL_METADATA_URL),
    ).toBe(true)
  },
)
