import { describe, expect, it, vi } from "vitest"

import { DEFAULT_PREFERENCES } from "~/services/preferences/preferencesDefaults"
import { PRODUCT_ANALYTICS_ERROR_CATEGORIES } from "~/services/productAnalytics/contracts"
import type { ApiVerificationProbeResult } from "~/services/verification/aiApiVerification"
import { API_VERIFICATION_REQUEST_PROFILES } from "~/services/verification/aiApiVerification/types"
import { PELICAN_EXECUTION_MODES } from "~/services/verification/modelQuality/constants"
import {
  CONTEXT_ATTEMPT_OUTCOMES,
  CONTEXT_CAPACITY_REASONS,
} from "~/services/verification/modelQuality/contextCapacityConstants"
import {
  CONTEXT_HISTORY_ACTIONS,
  WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT,
} from "~/services/verification/webAiApiCheck/constants"

it.each(Object.values(API_VERIFICATION_REQUEST_PROFILES))(
  "preserves valid %s client identity through background probe dispatch",
  async (requestProfile) => {
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockResolvedValue({
      id: "text-generation",
      status: "pass",
      latencyMs: 1,
      summary: "OK",
      requestProfile,
      requestProfileEnhanced: true,
    })
    await background.resolveWebAiApiCheckRunProbeMessage({
      baseUrl: "https://example.invalid",
      apiKey: "sk-test",
      apiType: "openai",
      modelId: "test",
      probeId: "text-generation",
      requestProfile,
      requestProfileEnhanced: true,
    })
    expect(runApiVerificationProbe).toHaveBeenLastCalledWith(
      expect.objectContaining({
        requestProfile,
        requestProfileEnhanced: true,
      }),
    )
  },
)

const {
  onWebAiApiCheckMessageMock,
  webAiApiCheckMessageHandlers,
  tabRemovedListeners,
  tabUpdatedListeners,
} = vi.hoisted(() => ({
  webAiApiCheckMessageHandlers: new Map<
    string,
    (payload: { data: any; sender?: { tab?: { id?: number } } }) => unknown
  >(),
  onWebAiApiCheckMessageMock: vi.fn(
    (type: string, handler: (payload: { data: any }) => unknown) => {
      webAiApiCheckMessageHandlers.set(type, handler)
      return vi.fn()
    },
  ),
  tabRemovedListeners: [] as Array<(tabId: number) => void>,
  tabUpdatedListeners: [] as Array<
    (tabId: number, changeInfo: { status?: string }) => void
  >,
}))

vi.mock("~/utils/browser/tabs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browser/tabs")>()
  return {
    ...actual,
    onTabRemoved: (listener: (tabId: number) => void) => {
      tabRemovedListeners.push(listener)
      return () => {
        const index = tabRemovedListeners.indexOf(listener)
        if (index >= 0) tabRemovedListeners.splice(index, 1)
      }
    },
    onTabUpdated: (
      listener: (tabId: number, changeInfo: { status?: string }) => void,
    ) => {
      tabUpdatedListeners.push(listener)
      return () => {
        const index = tabUpdatedListeners.indexOf(listener)
        if (index >= 0) tabUpdatedListeners.splice(index, 1)
      }
    },
  }
})

function createDeferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
  const getPreferences = vi.fn()
  return {
    ...actual,
    userPreferences: {
      getPreferences,
      getPreferencesStrict: getPreferences,
      setWebAiApiCheckSiteEnabled: vi.fn(),
    },
  }
})

vi.mock("~/services/verification/webAiApiCheck/messaging", async () => {
  const actual = await vi.importActual<
    typeof import("~/services/verification/webAiApiCheck/messaging")
  >("~/services/verification/webAiApiCheck/messaging")
  return {
    ...actual,
    onWebAiApiCheckMessage: onWebAiApiCheckMessageMock,
  }
})

vi.mock("~/services/aiApi/openaiCompatible", () => ({
  fetchOpenAICompatibleModelIds: vi.fn(),
}))

vi.mock("~/services/aiApi/google", () => ({
  fetchGoogleModelIds: vi.fn(),
}))

vi.mock("~/services/aiApi/anthropic", () => ({
  fetchAnthropicModelIds: vi.fn(),
}))

vi.mock("~/services/apiCredentialProfiles/storage/profiles", () => ({
  apiCredentialProfilesStorage: {
    createProfile: vi.fn(),
  },
}))

vi.mock("~/services/tags/tagStorage", () => ({
  tagStorage: {
    listTags: vi.fn(),
    createTag: vi.fn(),
    renameTag: vi.fn(),
  },
}))

vi.mock("~/services/verification/aiApiVerification", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/verification/aiApiVerification")
    >()
  return {
    ...actual,
    runApiVerificationProbe: vi.fn(),
  }
})

describe("webAiApiCheck background handlers", () => {
  it("keeps one background owner across native pages, protects its checkpoint and preserves request headers", async () => {
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const needle = await import(
      "~/services/verification/modelQuality/needleRun"
    )
    const { createNeedlePlan } = await import(
      "~/services/verification/modelQuality/needlePlan"
    )
    const { needleHistory } = await import(
      "~/services/verification/verificationResultHistory/needleHistory"
    )
    const { Storage } = await import("@plasmohq/storage")
    const { WEB_AI_API_CHECK_STORAGE_KEYS } = await import(
      "~/services/core/storageKeys"
    )
    const entered = createDeferred<void>()
    const finish = createDeferred<void>()
    const counter = { encoding: "o200k_base", estimated: true }
    const snapshot: import("~/services/verification/modelQuality/needleRun").NeedleResult =
      {
        version: 1,
        seed: 42,
        counter,
        plan: createNeedlePlan({ counter }),
        reason: "running",
        cells: [],
      }
    const run = vi
      .spyOn(needle, "runNeedleTest")
      .mockImplementationOnce(async (params) => {
        await params.onCheckpoint?.(snapshot, { targetTokens: 8192, depth: 10 })
        entered.resolve()
        await finish.promise
        return { ...snapshot, reason: "complete" }
      })
    const save = vi.spyOn(needleHistory, "save")
    const target = {
      kind: "profile-model",
      profileId: "needle-owner",
      modelId: "test",
    } as const
    const data = {
      runId: "native-first",
      apiType: "openai",
      baseUrl: "https://native.example.invalid",
      apiKey: "native-key",
      modelId: "test",
      requestHeaders: { "x-route": "private" },
      seed: 42,
      historyTarget: target,
    }
    background.setupWebAiApiCheckMessagingListeners()
    const handler = webAiApiCheckMessageHandlers.get("webAiApiCheck:runNeedle")!
    const first = handler({ data })
    try {
      await entered.promise
      await expect(
        handler({
          data: { ...data, runId: "native-second", recoverOnly: true },
        }),
      ).resolves.toMatchObject({
        success: false,
        errorName: "LongContextBusyError",
      })
      await webAiApiCheckMessageHandlers.get(
        "webAiApiCheck:discardNeedleCheckpoints",
      )!({ data: {} })
      const checkpoint = await new Storage({ area: "local" }).get(
        WEB_AI_API_CHECK_STORAGE_KEYS.NEEDLE_CHECKPOINTS,
      )
      expect(JSON.stringify(checkpoint)).toContain("inFlight")
      expect(run).toHaveBeenCalledOnce()
      expect(run).toHaveBeenCalledWith(
        expect.objectContaining({ requestHeaders: data.requestHeaders }),
      )
    } finally {
      finish.resolve()
      await expect(first).resolves.toMatchObject({ success: true })
      run.mockRestore()
    }
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ requestHeaders: data.requestHeaders }),
      expect.objectContaining({ reason: "complete" }),
      target,
    )
    save.mockRestore()
  })
  it("recovers an interrupted in-flight request without sending it again", async () => {
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const capacity = await import(
      "~/services/verification/modelQuality/contextCapacityRun"
    )
    const snapshot = {
      lowerBoundTokens: 1024,
      reason: "test-limit" as const,
      inputLimit: 8192,
      attempts: [{ targetTokens: 1024, outcome: "accepted" as const }],
      counter: { encoding: "o200k_base", estimated: true },
    }
    const run = vi
      .spyOn(capacity, "runContextCapacity")
      .mockImplementationOnce(async (params) => {
        await params.onCheckpoint?.({ result: snapshot, inFlightTarget: 2048 })
        throw new Error("worker terminated")
      })
      .mockRejectedValue(new Error("Must not repeat provider request"))
    try {
      background.setupWebAiApiCheckMessagingListeners()
      const handler = webAiApiCheckMessageHandlers.get(
        "webAiApiCheck:runContextCapacity",
      )!
      const data = {
        runId: "interrupted-first",
        apiType: "openai",
        baseUrl: "https://example.invalid",
        apiKey: "checkpoint-key",
        modelId: "checkpoint-model",
      }
      await expect(handler({ data })).resolves.toMatchObject({ success: false })
      const recovered = await handler({
        data: { ...data, runId: "after-restart" },
      })
      expect(recovered).toMatchObject({
        success: true,
        result: {
          lowerBoundTokens: 1024,
          reason: "inconclusive",
          attempts: [
            { targetTokens: 1024, outcome: "accepted" },
            {
              targetTokens: 2048,
              outcome: "inconclusive",
              failureReason: "interrupted",
            },
          ],
        },
      })
      expect(run).toHaveBeenCalledOnce()
    } finally {
      run.mockRestore()
    }
  })

  it("does not dispatch a provider request for a recovery-only lookup without a checkpoint", async () => {
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const capacity = await import(
      "~/services/verification/modelQuality/contextCapacityRun"
    )
    const run = vi.spyOn(capacity, "runContextCapacity")
    try {
      background.setupWebAiApiCheckMessagingListeners()
      await expect(
        webAiApiCheckMessageHandlers.get("webAiApiCheck:runContextCapacity")!({
          data: {
            runId: "recover-missing",
            recoverOnly: true,
            apiType: "openai",
            baseUrl: "https://example.invalid",
            apiKey: "missing-key",
            modelId: "missing-model",
          },
        }),
      ).resolves.toMatchObject({ success: false })
      expect(run).not.toHaveBeenCalled()
    } finally {
      run.mockRestore()
    }
  })

  it("recovers completed attempts as an explicit budget continuation", async () => {
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const capacity = await import(
      "~/services/verification/modelQuality/contextCapacityRun"
    )
    const history = await import(
      "~/services/verification/verificationResultHistory/contextCapacityHistory"
    )
    const snapshot = {
      lowerBoundTokens: 1024,
      reason: "test-limit" as const,
      inputLimit: 8192,
      attempts: [{ targetTokens: 1024, outcome: "accepted" as const }],
      counter: { encoding: "o200k_base", estimated: true },
    }
    const run = vi
      .spyOn(capacity, "runContextCapacity")
      .mockImplementationOnce(async (params) => {
        await params.onCheckpoint?.({ result: snapshot })
        throw new Error("worker terminated between requests")
      })
    const request = {
      apiType: "openai" as const,
      baseUrl: "https://example.invalid",
      apiKey: "completed-key",
      modelId: "completed-model",
    }
    try {
      background.setupWebAiApiCheckMessagingListeners()
      const handler = webAiApiCheckMessageHandlers.get(
        "webAiApiCheck:runContextCapacity",
      )!
      await handler({ data: { ...request, runId: "completed-first" } })
      await expect(
        handler({
          data: { ...request, runId: "completed-recovery", recoverOnly: true },
        }),
      ).resolves.toMatchObject({
        success: true,
        result: { ...snapshot, reason: "budget" },
      })
      expect(run).toHaveBeenCalledOnce()
      expect(await history.contextCapacityHistory.get(request)).toMatchObject({
        reason: "budget",
        lowerBoundTokens: 1024,
      })
    } finally {
      run.mockRestore()
    }
  })

  it("persists a completed capacity observation before clearing its checkpoint", async () => {
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const capacity = await import(
      "~/services/verification/modelQuality/contextCapacityRun"
    )
    const history = await import(
      "~/services/verification/verificationResultHistory/contextCapacityHistory"
    )
    const { Storage } = await import("@plasmohq/storage")
    const { WEB_AI_API_CHECK_STORAGE_KEYS } = await import(
      "~/services/core/storageKeys"
    )
    const result = {
      lowerBoundTokens: 1024,
      reason: "test-limit" as const,
      inputLimit: 1024,
      attempts: [{ targetTokens: 1024, outcome: "accepted" as const }],
      counter: { encoding: "o200k_base", estimated: true },
    }
    const run = vi
      .spyOn(capacity, "runContextCapacity")
      .mockImplementationOnce(async (params) => {
        await params.onCheckpoint?.({
          result: { ...result, attempts: [] },
          inFlightTarget: 1024,
        })
        await params.onCheckpoint?.({ result })
        return result
      })
    const request = {
      apiType: "openai" as const,
      baseUrl: "https://example.invalid",
      apiKey: "success-key",
      modelId: "success-model",
    }
    try {
      background.setupWebAiApiCheckMessagingListeners()
      await expect(
        webAiApiCheckMessageHandlers.get("webAiApiCheck:runContextCapacity")!({
          data: { ...request, runId: "completed-success" },
        }),
      ).resolves.toMatchObject({ success: true, result })
      expect(await history.contextCapacityHistory.get(request)).toMatchObject({
        reason: "test-limit",
        lowerBoundTokens: 1024,
      })
      expect(
        await new Storage({ area: "local" }).get(
          WEB_AI_API_CHECK_STORAGE_KEYS.CONTEXT_CHECKPOINTS,
        ),
      ).toEqual({})
    } finally {
      run.mockRestore()
    }
  })

  it.each([
    { mode: "invalid" },
    { requestProfile: "invalid" },
    { apiKey: "" },
    { modelId: "" },
    { baseUrl: "file:///tmp" },
  ])("rejects invalid context history identity %j", async (override) => {
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const history = await import(
      "~/services/verification/verificationResultHistory/contextCapacityHistory"
    )
    const get = vi.spyOn(history.contextCapacityHistory, "get")
    try {
      background.setupWebAiApiCheckMessagingListeners()
      await expect(
        webAiApiCheckMessageHandlers.get("webAiApiCheck:contextHistory")!({
          data: {
            action: "get",
            request: {
              apiType: "openai",
              baseUrl: "https://example.invalid",
              apiKey: "key",
              modelId: "model",
              ...override,
            },
          },
        }),
      ).resolves.toEqual({ success: false })
      expect(get).not.toHaveBeenCalled()
    } finally {
      get.mockRestore()
    }
  })

  it.each(["get", "save"] as const)(
    "returns a safe failure when context history %s fails",
    async (action) => {
      const background = await import(
        "~/services/verification/webAiApiCheck/background"
      )
      const { contextCapacityHistory } = await import(
        "~/services/verification/verificationResultHistory/contextCapacityHistory"
      )
      const operation = vi
        .spyOn(contextCapacityHistory, action)
        .mockRejectedValueOnce(new Error("private history secret"))
      try {
        background.setupWebAiApiCheckMessagingListeners()
        await expect(
          webAiApiCheckMessageHandlers.get("webAiApiCheck:contextHistory")!({
            data: {
              action,
              request: {
                apiType: "openai",
                baseUrl: "https://example.invalid",
                apiKey: "private history secret",
                modelId: "model",
              },
            },
          }),
        ).resolves.toEqual({ success: false })
      } finally {
        operation.mockRestore()
      }
    },
  )
  it("returns a safe failure when interrupted-record cleanup cannot persist", async () => {
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const checkpoints = await import(
      "~/services/verification/webAiApiCheck/contextCapacityCheckpoint"
    )
    const discard = vi
      .spyOn(checkpoints, "discardInactiveContextCheckpoints")
      .mockRejectedValueOnce(new Error("private storage detail"))
    try {
      background.setupWebAiApiCheckMessagingListeners()
      await expect(
        webAiApiCheckMessageHandlers.get(
          "webAiApiCheck:discardContextCheckpoints",
        )!({ data: {} }),
      ).resolves.toEqual({ success: false })
    } finally {
      discard.mockRestore()
    }
  })

  it("restores compact webpage capacity history without exposing connection credentials", async () => {
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    background.setupWebAiApiCheckMessagingListeners()
    const handler = webAiApiCheckMessageHandlers.get(
      "webAiApiCheck:contextHistory",
    )!
    const request = {
      apiType: "openai-compatible",
      baseUrl: "https://context-history.invalid",
      apiKey: "private-history-key",
      modelId: "context-model",
    }
    await expect(
      handler({
        data: {
          action: CONTEXT_HISTORY_ACTIONS.Get,
          request: { ...request, baseUrl: "file:///private" },
        },
      }),
    ).resolves.toEqual({ success: false })
    const saved = await handler({
      data: {
        action: CONTEXT_HISTORY_ACTIONS.Save,
        request,
        result: {
          lowerBoundTokens: 4096,
          reason: CONTEXT_CAPACITY_REASONS.TestLimit,
          attempts: [
            { targetTokens: 4096, outcome: CONTEXT_ATTEMPT_OUTCOMES.Accepted },
          ],
          counter: { encoding: "o200k_base", estimated: true },
        },
      },
    })
    expect(saved).toMatchObject({
      success: true,
      summary: { lowerBoundTokens: 4096 },
    })
    expect(JSON.stringify(saved)).not.toContain(request.apiKey)
    expect(JSON.stringify(saved)).not.toContain(request.baseUrl)
    await expect(
      handler({ data: { action: CONTEXT_HISTORY_ACTIONS.Get, request } }),
    ).resolves.toMatchObject({
      success: true,
      summary: { lowerBoundTokens: 4096 },
    })
    await expect(
      handler({
        data: {
          action: CONTEXT_HISTORY_ACTIONS.Get,
          request: { ...request, apiKey: "different-key" },
        },
      }),
    ).resolves.toEqual({ success: true, summary: null })
  })
  it("returns compact context progress to the source frame and stops when its tab navigates", async () => {
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const capacity = await import(
      "~/services/verification/modelQuality/contextCapacityRun"
    )
    const messaging = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )
    const progress = {
      lowerBoundTokens: 1024,
      reason: CONTEXT_CAPACITY_REASONS.TestLimit,
      attempts: [],
    }
    const send = vi
      .spyOn(messaging, "sendWebAiApiCheckMessage")
      .mockResolvedValue(undefined)
    let signal: AbortSignal | undefined
    const run = vi
      .spyOn(capacity, "runContextCapacity")
      .mockImplementation(async (params) => {
        signal = params.abortSignal
        params.onProgress?.(progress)
        return new Promise((_, reject) =>
          params.abortSignal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        )
      })
    try {
      background.setupWebAiApiCheckMessagingListeners()
      const pending = webAiApiCheckMessageHandlers.get(
        "webAiApiCheck:runContextCapacity",
      )!({
        data: {
          runId: "frame-capacity",
          apiType: "openai",
          baseUrl: "https://example.invalid",
          apiKey: "sk-test",
          modelId: "test",
          maxInputTokens: 8192,
        },
        sender: { tab: { id: 947 }, frameId: 3 } as any,
      })
      await vi.waitFor(() =>
        expect(send).toHaveBeenCalledWith(
          "webAiApiCheck:contextCapacityProgress",
          { runId: "frame-capacity", result: progress },
          { tabId: 947, frameId: 3 },
        ),
      )
      for (const listener of tabUpdatedListeners)
        listener(946, { status: "loading" })
      expect(signal?.aborted).toBe(false)
      for (const listener of tabUpdatedListeners)
        listener(947, { status: "loading" })
      expect(signal?.aborted).toBe(true)
      await expect(pending).resolves.toMatchObject({ success: false })
    } finally {
      run.mockRestore()
      send.mockRestore()
    }
  })

  it.each([
    { maxInputTokens: 8388609 },
    { maxInputTokens: 0 },
    { mode: "invalid" },
    { requestProfile: "invalid" },
    { baseUrl: "file:///tmp" },
    { runId: "" },
  ])(
    "rejects invalid context configuration %j before dispatch",
    async (override) => {
      const background = await import(
        "~/services/verification/webAiApiCheck/background"
      )
      const capacity = await import(
        "~/services/verification/modelQuality/contextCapacityRun"
      )
      const run = vi.spyOn(capacity, "runContextCapacity")
      try {
        background.setupWebAiApiCheckMessagingListeners()
        await expect(
          webAiApiCheckMessageHandlers.get("webAiApiCheck:runContextCapacity")!(
            {
              data: {
                runId: "invalid-capacity",
                apiType: "openai",
                baseUrl: "https://example.invalid",
                apiKey: "sk-test",
                modelId: "test",
                maxInputTokens: 8192,
                ...override,
              },
            },
          ),
        ).resolves.toMatchObject({ success: false })
        expect(run).not.toHaveBeenCalled()
      } finally {
        run.mockRestore()
      }
    },
  )
  it("runs bounded context measurement in background and cancels it with the owning run", async () => {
    const resumeFrom = {
      lowerBoundTokens: 4096,
      upperBoundTokens: 8192,
      reason: CONTEXT_CAPACITY_REASONS.Budget,
      attempts: [
        { targetTokens: 8192, outcome: CONTEXT_ATTEMPT_OUTCOMES.ContextLimit },
        { targetTokens: 4096, outcome: CONTEXT_ATTEMPT_OUTCOMES.Accepted },
      ],
      inputLimit: 8192,
      counter: { encoding: "o200k_base", estimated: true },
    }
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const capacity = await import(
      "~/services/verification/modelQuality/contextCapacityRun"
    )
    const { WebAiApiCheckMessageTypes } = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )
    let signal: AbortSignal | undefined
    const spy = vi
      .spyOn(capacity, "runContextCapacity")
      .mockImplementation(async (params) => {
        signal = params.abortSignal
        return new Promise((_, reject) =>
          params.abortSignal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        )
      })
    try {
      background.setupWebAiApiCheckMessagingListeners()
      const handler = webAiApiCheckMessageHandlers.get(
        "webAiApiCheck:runContextCapacity",
      )
      expect(handler).toBeTypeOf("function")
      const pending = handler!({
        data: {
          runId: "capacity-run",
          resumeFrom,
          apiType: "openai",
          baseUrl: "https://example.invalid",
          apiKey: "sk-test",
          modelId: "test",
          mode: "non-streaming",
          requestProfile: "codex",
          requestProfileEnhanced: true,
        },
        sender: { tab: { id: 47 } },
      })
      await vi.waitFor(() =>
        expect(spy).toHaveBeenCalledWith(
          expect.objectContaining({
            maxInputTokens: undefined,
            resumeFrom,
            mode: "non-streaming",
            requestProfile: "codex",
            requestProfileEnhanced: true,
          }),
        ),
      )
      await webAiApiCheckMessageHandlers.get(
        WebAiApiCheckMessageTypes.CancelRunProbe,
      )!({ data: { runId: "capacity-run" } })
      expect(signal?.aborted).toBe(true)
      await expect(pending).resolves.toMatchObject({ success: false })
    } finally {
      spy.mockRestore()
    }
  })
  it("returns a completed drawing result through the background message boundary", async () => {
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const pelican = await import("~/services/verification/modelQuality/pelican")
    const drawing = {
      runAt: 1,
      latencyMs: 2,
      text: "No SVG",
      svg: null,
      analysis: pelican.analyzePelicanSvg(null),
    }
    const spy = vi.spyOn(pelican, "runPelicanTest").mockResolvedValue(drawing)
    try {
      const { WebAiApiCheckMessageTypes } = await import(
        "~/services/verification/webAiApiCheck/messaging"
      )
      background.setupWebAiApiCheckMessagingListeners()
      const handler = webAiApiCheckMessageHandlers.get(
        WebAiApiCheckMessageTypes.RunPelican,
      )!
      await expect(
        handler({
          data: {
            runId: "completed-drawing",
            apiType: "openai",
            baseUrl: "https://example.invalid",
            apiKey: "sk-test",
            modelId: "test",
          },
        }),
      ).resolves.toEqual({ success: true, result: drawing })
    } finally {
      spy.mockRestore()
    }
  })

  it("forwards agent mode and client identity and cancels the actual background drawing run", async () => {
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const pelican = await import("~/services/verification/modelQuality/pelican")
    const { WebAiApiCheckMessageTypes } = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )
    let runSignal: AbortSignal | undefined
    const spy = vi
      .spyOn(pelican, "runPelicanTest")
      .mockImplementation(async (params) => {
        runSignal = params.abortSignal
        return new Promise((_, reject) =>
          params.abortSignal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        )
      })
    try {
      background.setupWebAiApiCheckMessagingListeners()
      const pending = webAiApiCheckMessageHandlers.get(
        WebAiApiCheckMessageTypes.RunPelican,
      )!({
        data: {
          runId: "agent-run",
          apiType: "openai",
          baseUrl: "https://example.invalid",
          apiKey: "sk-test",
          modelId: "test",
          executionMode: PELICAN_EXECUTION_MODES.Agent,
          requestProfile: "codex",
          requestProfileEnhanced: true,
        },
      })
      expect(spy).toHaveBeenCalledWith(
        expect.objectContaining({
          executionMode: PELICAN_EXECUTION_MODES.Agent,
          requestProfile: "codex",
          requestProfileEnhanced: true,
          abortSignal: expect.any(AbortSignal),
        }),
      )
      expect(
        await background.resolveWebAiApiCheckCancelRunProbeMessage({
          runId: "agent-run",
        }),
      ).toEqual({ success: true, cancelled: true })
      expect(runSignal?.aborted).toBe(true)
      await expect(pending).resolves.toMatchObject({ success: false })
    } finally {
      spy.mockRestore()
    }
  })

  it("cancels a drawing run when its sender tab is torn down", async () => {
    vi.resetModules()
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const pelican = await import("~/services/verification/modelQuality/pelican")
    const { WebAiApiCheckMessageTypes } = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )
    const runSignals = new Map<string, AbortSignal | undefined>()
    const spy = vi
      .spyOn(pelican, "runPelicanTest")
      .mockImplementation(async (params) => {
        runSignals.set(params.modelId, params.abortSignal)
        return new Promise((_, reject) =>
          params.abortSignal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          ),
        )
      })
    try {
      background.setupWebAiApiCheckMessagingListeners()
      const handler = webAiApiCheckMessageHandlers.get(
        WebAiApiCheckMessageTypes.RunPelican,
      )!
      const startRun = (runId: string, tabId: number, modelId: string) =>
        handler({
          data: {
            runId,
            apiType: "openai",
            baseUrl: "https://example.invalid",
            apiKey: "sk-test",
            modelId,
            executionMode: PELICAN_EXECUTION_MODES.Agent,
          },
          sender: { tab: { id: tabId } },
        })

      const closingTabRun = startRun("closing-tab-run", 42, "closing-model")
      const otherTabRun = startRun("other-tab-run", 7, "other-model")

      tabRemovedListeners.forEach((listener) => listener(42))
      expect(runSignals.get("closing-model")?.aborted).toBe(true)
      expect(runSignals.get("other-model")?.aborted).toBe(false)
      await expect(closingTabRun).resolves.toMatchObject({ success: false })

      tabUpdatedListeners.forEach((listener) =>
        listener(7, { status: "loading" }),
      )
      expect(runSignals.get("other-model")?.aborted).toBe(true)
      await expect(otherTabRun).resolves.toMatchObject({ success: false })
    } finally {
      spy.mockRestore()
    }
  })

  it("rejects a drawing run whose execution mode or client identity is invalid", async () => {
    vi.resetModules()
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const { WebAiApiCheckMessageTypes } = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )
    background.setupWebAiApiCheckMessagingListeners()
    const handler = webAiApiCheckMessageHandlers.get(
      WebAiApiCheckMessageTypes.RunPelican,
    )!
    const validRun = {
      runId: "invalid-mode-run",
      apiType: "openai",
      baseUrl: "https://example.invalid",
      apiKey: "sk-test",
      modelId: "test",
    }

    // The content script cannot be trusted to send a known execution mode, and a
    // wrong value must not silently fall back to the reply-only path.
    await expect(
      handler({ data: { ...validRun, executionMode: "turbo" } }),
    ).resolves.toEqual({
      success: false,
      error: "Invalid drawing execution mode",
    })
    await expect(
      handler({ data: { ...validRun, requestProfile: "not-a-profile" } }),
    ).resolves.toEqual({
      success: false,
      error: "Invalid request profile",
    })
    // Every mode but non-streaming takes the streaming branch downstream, so an
    // unknown value would silently change how the request is sent.
    await expect(
      handler({ data: { ...validRun, mode: "not-a-mode" } }),
    ).resolves.toEqual({
      success: false,
      error: "Invalid verification mode",
    })
    await expect(
      handler({ data: { ...validRun, baseUrl: "://" } }),
    ).resolves.toEqual({ success: false, error: "Invalid baseUrl" })
    await expect(
      handler({ data: { ...validRun, modelId: "  " } }),
    ).resolves.toEqual({
      success: false,
      error: "Missing apiType, baseUrl, apiKey, or modelId",
    })
  })

  it("fails closed when reading the saved detection scope fails", async () => {
    vi.resetModules()
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferencesStrict).mockRejectedValueOnce(
      new Error("read failed"),
    )
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    await expect(
      background.resolveWebAiApiCheckShouldPromptMessage({
        pageUrl: "https://example.com",
      }),
    ).resolves.toMatchObject({ success: false })
  })

  it("saves a website choice and returns its actual effective scope", async () => {
    vi.resetModules()
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.setWebAiApiCheckSiteEnabled).mockResolvedValue({
      ok: true,
      preferences: DEFAULT_PREFERENCES,
    })
    vi.mocked(userPreferences.getPreferencesStrict).mockResolvedValue(
      DEFAULT_PREFERENCES,
    )
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const { WebAiApiCheckMessageTypes } = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )
    background.setupWebAiApiCheckMessagingListeners()
    const handler = webAiApiCheckMessageHandlers.get(
      WebAiApiCheckMessageTypes.SetSiteAccess,
    )!
    await expect(
      handler({ data: { pageUrl: "https://example.com/docs", enabled: true } }),
    ).resolves.toMatchObject({ success: true, siteAllowed: true })
    expect(userPreferences.setWebAiApiCheckSiteEnabled).toHaveBeenCalledWith(
      "https://example.com/docs",
      true,
    )
    await expect(
      handler({ data: { pageUrl: "file:///test", enabled: true } }),
    ).resolves.toMatchObject({ success: false })
    vi.mocked(
      userPreferences.setWebAiApiCheckSiteEnabled,
    ).mockRejectedValueOnce(new Error("write failed"))
    await expect(
      handler({
        data: { pageUrl: "https://example.com/docs", enabled: false },
      }),
    ).resolves.toMatchObject({ success: false })
  })

  it("shouldPrompt rejects missing page urls", async () => {
    vi.resetModules()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckShouldPromptMessage({
      pageUrl: "   ",
    })

    expect(response).toEqual({
      success: false,
      error: "Missing pageUrl",
    })
  })

  it("shouldPrompt returns false when auto-detect is disabled", async () => {
    vi.resetModules()
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      webAiApiCheck: {
        enabled: true,
        contextMenu: {
          enabled: true,
        },
        autoDetect: {
          enabled: false,
          enhanced: { enabled: true },
          urlWhitelist: { patterns: ["^https://example\\.com"] },
        },
        keyCleanup: {
          removalPatterns: [],
        },
      },
    })

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckShouldPromptMessage({
      pageUrl: "https://example.com/docs",
    })

    expect(response).toEqual({
      success: true,
      shouldPrompt: false,
      enhancedShouldPrompt: false,
      siteAllowed: true,
      autoDetectEnabled: false,
      apiKeyCleanupPatterns: [],
    })
  })

  it("shouldPrompt returns true when enabled and whitelisted", async () => {
    vi.resetModules()
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      webAiApiCheck: {
        enabled: true,
        contextMenu: {
          enabled: true,
        },
        autoDetect: {
          enabled: true,
          enhanced: { enabled: true },
          urlWhitelist: { patterns: ["^https://example\\.com"] },
        },
        keyCleanup: {
          removalPatterns: ["\\[\\[remove-me\\]\\]"],
        },
      },
    })

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckShouldPromptMessage({
      pageUrl: "https://example.com/docs",
    })

    expect(response).toEqual({
      success: true,
      shouldPrompt: true,
      enhancedShouldPrompt: true,
      siteAllowed: true,
      autoDetectEnabled: true,
      apiKeyCleanupPatterns: ["\\[\\[remove-me\\]\\]"],
    })
  })

  it("shouldPrompt falls back to default web-ai-api-check preferences when the section is missing", async () => {
    vi.resetModules()
    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockResolvedValue({
      ...DEFAULT_PREFERENCES,
      webAiApiCheck: undefined,
    })

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckShouldPromptMessage({
      pageUrl: "https://example.com/docs",
    })

    expect(response).toEqual({
      success: true,
      shouldPrompt: true,
      enhancedShouldPrompt: true,
      siteAllowed: true,
      autoDetectEnabled: true,
      apiKeyCleanupPatterns: [],
    })
  })

  it("fetchModels rejects requests with missing required fields", async () => {
    vi.resetModules()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "openai-compatible",
      baseUrl: " ",
      apiKey: "",
    })

    expect(response).toEqual({
      success: false,
      error: "Missing apiType, baseUrl, or apiKey",
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
    })
  })

  it("fetchModels rejects invalid base urls before calling providers", async () => {
    vi.resetModules()
    const { fetchGoogleModelIds } = await import("~/services/aiApi/google")

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "google",
      baseUrl: "not a url",
      apiKey: "AIza-test-key",
    })

    expect(fetchGoogleModelIds).not.toHaveBeenCalled()
    expect(response).toEqual({
      success: false,
      error: "Invalid baseUrl",
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
    })
  })

  it("fetchModels normalizes baseUrl and returns model ids", async () => {
    vi.resetModules()
    const { fetchOpenAICompatibleModelIds } = await import(
      "~/services/aiApi/openaiCompatible"
    )
    vi.mocked(fetchOpenAICompatibleModelIds).mockResolvedValue(["m1", "m2"])

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1/chat/completions",
      apiKey: "sk-test-background-fixture-12345",
    })

    expect(fetchOpenAICompatibleModelIds).toHaveBeenCalledWith({
      baseUrl: "https://proxy.example.com/api",
      apiKey: "sk-test-background-fixture-12345",
    })
    expect(response).toEqual({
      success: true,
      modelIds: ["m1", "m2"],
    })
  })

  it("fetchModels supports google and strips /v1beta from baseUrl", async () => {
    vi.resetModules()
    const { fetchGoogleModelIds } = await import("~/services/aiApi/google")
    vi.mocked(fetchGoogleModelIds).mockResolvedValue([
      "gemini-1.0",
      "gemini-2.0",
    ])

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "google",
      baseUrl: "https://proxy.example.com/api/v1beta/models",
      apiKey: "AIza-test-key",
    })

    expect(fetchGoogleModelIds).toHaveBeenCalledWith({
      baseUrl: "https://proxy.example.com/api",
      apiKey: "AIza-test-key",
    })
    expect(response).toEqual({
      success: true,
      modelIds: ["gemini-1.0", "gemini-2.0"],
    })
  })

  it("fetchModels supports anthropic and strips /v1 from baseUrl", async () => {
    vi.resetModules()
    const { fetchAnthropicModelIds } = await import(
      "~/services/aiApi/anthropic"
    )
    vi.mocked(fetchAnthropicModelIds).mockResolvedValue([
      "claude-3-7-sonnet-latest",
      "claude-3-5-haiku-latest",
    ])

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "anthropic",
      baseUrl: "https://api.anthropic.com/v1/messages",
      apiKey: "sk-ant-test-key",
    })

    expect(fetchAnthropicModelIds).toHaveBeenCalledWith({
      baseUrl: "https://api.anthropic.com",
      apiKey: "sk-ant-test-key",
    })
    expect(response).toEqual({
      success: true,
      modelIds: ["claude-3-7-sonnet-latest", "claude-3-5-haiku-latest"],
    })
  })

  it("fetchModels sanitizes apiKey in error messages", async () => {
    vi.resetModules()
    const { fetchOpenAICompatibleModelIds } = await import(
      "~/services/aiApi/openaiCompatible"
    )
    vi.mocked(fetchOpenAICompatibleModelIds).mockRejectedValue(
      new Error("Unauthorized: sk-test-secret-fixture"),
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "openai",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test-secret-fixture",
    })

    expect(response).toEqual({
      success: false,
      error: "Unauthorized: [REDACTED]",
    })
  })

  it("fetchModels does not expose message-derived status codes to analytics", async () => {
    vi.resetModules()
    const { fetchOpenAICompatibleModelIds } = await import(
      "~/services/aiApi/openaiCompatible"
    )
    vi.mocked(fetchOpenAICompatibleModelIds).mockRejectedValue(
      new Error("Unauthorized 401: sk-test-secret-fixture"),
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "openai",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test-secret-fixture",
    })

    expect(response).toEqual({
      success: false,
      error: "Unauthorized 401: [REDACTED]",
    })
    expect(response).not.toHaveProperty("errorStatusCode")
  })

  it("fetchModels returns structured status codes for analytics classification", async () => {
    vi.resetModules()
    const { fetchOpenAICompatibleModelIds } = await import(
      "~/services/aiApi/openaiCompatible"
    )
    vi.mocked(fetchOpenAICompatibleModelIds).mockRejectedValue({
      statusCode: 401,
      message: "Unauthorized: sk-test-secret-fixture",
    })

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "openai",
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test-secret-fixture",
    })

    expect(response).toEqual({
      success: false,
      error: "Unauthorized: [REDACTED]",
      errorStatusCode: 401,
    })
  })

  it("fetchModels returns a stable error for unsupported api types after generic normalization", async () => {
    vi.resetModules()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckFetchModelsMessage({
      apiType: "custom-api" as any,
      baseUrl: "proxy.example.com/api",
      apiKey: "sk-test-unsupported",
    })

    expect(response).toEqual({
      success: false,
      error: "Unsupported apiType",
    })
  })

  it("runProbe rejects requests with missing required fields", async () => {
    vi.resetModules()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckRunProbeMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      probeId: "" as any,
    })

    expect(response).toEqual({
      success: false,
      error: "Missing apiType, baseUrl, apiKey, or probeId",
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
    })
  })

  it("attributes a probe run to its sender tab, and accepts a sender-less one", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    let probeSignal: AbortSignal | undefined
    const probeDeferred = createDeferred<ApiVerificationProbeResult>()
    vi.mocked(runApiVerificationProbe).mockImplementation(
      async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        probeSignal = abortSignal
        return await probeDeferred.promise
      },
    )
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const pelican = await import("~/services/verification/modelQuality/pelican")
    const { WebAiApiCheckMessageTypes } = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )
    background.setupWebAiApiCheckMessagingListeners()
    const probeHandler = webAiApiCheckMessageHandlers.get(
      WebAiApiCheckMessageTypes.RunProbe,
    )!
    const pelicanHandler = webAiApiCheckMessageHandlers.get(
      WebAiApiCheckMessageTypes.RunPelican,
    )!

    const probeRun = probeHandler({
      data: {
        runId: "probe-run",
        apiType: "openai",
        baseUrl: "https://example.invalid",
        apiKey: "sk-test",
        probeId: "text-generation",
      },
      sender: { tab: { id: 99 } },
    })
    await vi.waitFor(() => expect(probeSignal).toBeInstanceOf(AbortSignal))

    // The message handler must pass the sender tab through, or a probe still in
    // flight when its page is torn down would never be cancelled.
    tabRemovedListeners.forEach((listener) => listener(99))
    expect(probeSignal?.aborted).toBe(true)

    probeDeferred.resolve({
      id: "text-generation",
      status: "fail",
      latencyMs: 0,
      summary: "Stopped",
    })
    await expect(probeRun).resolves.toMatchObject({ success: true })

    const spy = vi
      .spyOn(pelican, "runPelicanTest")
      .mockImplementation(
        async (params) =>
          new Promise((_, reject) =>
            params.abortSignal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            ),
          ),
      )
    try {
      // A run with no sender tab must still be cancellable by its run id.
      const senderlessRun = pelicanHandler({
        data: {
          runId: "senderless-run",
          apiType: "openai",
          baseUrl: "https://example.invalid",
          apiKey: "sk-test",
          modelId: "test",
        },
      })
      await expect(
        background.resolveWebAiApiCheckCancelRunProbeMessage({
          runId: "senderless-run",
        }),
      ).resolves.toEqual({ success: true, cancelled: true })
      await expect(senderlessRun).resolves.toMatchObject({ success: false })
    } finally {
      spy.mockRestore()
    }
  })

  it("runProbe rejects invalid base urls before dispatching a probe", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckRunProbeMessage({
      apiType: "openai-compatible",
      baseUrl: "not a url",
      apiKey: "sk-test-secret-fixture",
      probeId: "text-generation",
    })

    expect(runApiVerificationProbe).not.toHaveBeenCalled()
    expect(response).toEqual({
      success: false,
      error: "Invalid baseUrl",
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
    })
  })

  it.each([undefined, "streaming", "non-streaming"] as const)(
    "runProbe forwards mode %s and trims blank model ids",
    async (mode) => {
      vi.resetModules()
      const { runApiVerificationProbe } = await import(
        "~/services/verification/aiApiVerification"
      )
      vi.mocked(runApiVerificationProbe).mockResolvedValue({
        id: "text-generation",
        status: "pass",
        latencyMs: 42,
        summary: "ok",
        input: {
          apiType: "openai-compatible",
          baseUrl: "https://proxy.example.com/api",
        },
      } as any)

      const background = await import(
        "~/services/verification/webAiApiCheck/background"
      )

      const response = await background.resolveWebAiApiCheckRunProbeMessage({
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api/v1",
        apiKey: "sk-test-secret-fixture",
        modelId: "   ",
        probeId: "text-generation",
        mode,
      })

      expect(runApiVerificationProbe).toHaveBeenCalledWith({
        apiType: "openai-compatible",
        apiKey: "sk-test-secret-fixture",
        baseUrl: "https://proxy.example.com/api",
        modelId: undefined,
        probeId: "text-generation",
        mode: mode ?? "streaming",
        abortSignal: undefined,
      })
      expect(response).toEqual({
        success: true,
        result: {
          id: "text-generation",
          status: "pass",
          latencyMs: 42,
          summary: "ok",
          input: {
            apiType: "openai-compatible",
            baseUrl: "https://proxy.example.com/api",
          },
        },
      })
    },
  )

  it("runProbe rejects invalid verification modes without dispatching a probe", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockClear()
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckRunProbeMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com",
      apiKey: "sk-test-mode-fixture",
      modelId: "mode-test",
      probeId: "text-generation",
      mode: "automatic" as never,
    })

    expect(response).toMatchObject({
      success: false,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
    })
    expect(runApiVerificationProbe).not.toHaveBeenCalled()
  })

  it("runProbe can be cancelled by run id while the probe is in flight", async () => {
    vi.resetModules()
    let receivedSignal: AbortSignal | undefined
    const probeDeferred = createDeferred<ApiVerificationProbeResult>()

    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockImplementation(
      async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return await probeDeferred.promise
      },
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const probePromise = background.resolveWebAiApiCheckRunProbeMessage({
      runId: "web-ai-api-check-run-1",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      modelId: "gpt-4o-mini",
      probeId: "text-generation",
    })

    await vi.waitFor(() => {
      expect(receivedSignal).toBeInstanceOf(AbortSignal)
    })

    const cancelResponse =
      await background.resolveWebAiApiCheckCancelRunProbeMessage({
        runId: "web-ai-api-check-run-1",
      })

    expect(cancelResponse).toEqual({ success: true, cancelled: true })
    expect(receivedSignal?.aborted).toBe(true)

    probeDeferred.resolve({
      id: "text-generation",
      status: "fail",
      latencyMs: 0,
      summary: "Cancelled by user",
      input: {
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
      },
    })
    await expect(probePromise).resolves.toMatchObject({
      success: true,
      result: {
        id: "text-generation",
        status: "fail",
        summary: "Cancelled by user",
      },
    })

    const secondCancelResponse =
      await background.resolveWebAiApiCheckCancelRunProbeMessage({
        runId: "web-ai-api-check-run-1",
      })
    expect(secondCancelResponse).toEqual({ success: true, cancelled: false })
  })

  it("keeps a replacement run cancellable after an older run with the same id finishes", async () => {
    vi.resetModules()
    const first = createDeferred<ApiVerificationProbeResult>()
    const second = createDeferred<ApiVerificationProbeResult>()
    const signals: (AbortSignal | undefined)[] = []
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe)
      .mockImplementationOnce(async ({ abortSignal }) => {
        signals.push(abortSignal)
        return first.promise
      })
      .mockImplementationOnce(async ({ abortSignal }) => {
        signals.push(abortSignal)
        return second.promise
      })
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const request = {
      runId: "replacement-probe",
      apiType: "openai-compatible" as const,
      baseUrl: "https://proxy.example.com",
      apiKey: "sk-test-secret-fixture",
      probeId: "text-generation" as const,
    }
    const firstRun = background.resolveWebAiApiCheckRunProbeMessage(request)
    const secondRun = background.resolveWebAiApiCheckRunProbeMessage(request)
    await vi.waitFor(() => expect(signals).toHaveLength(2))
    const result: ApiVerificationProbeResult = {
      id: "text-generation",
      status: "pass",
      latencyMs: 0,
      summary: "ok",
      input: { apiType: request.apiType, baseUrl: request.baseUrl },
    }
    first.resolve(result)
    await firstRun
    const cancellation =
      await background.resolveWebAiApiCheckCancelRunProbeMessage({
        runId: request.runId,
      })
    // Settle both requests even if the assertion fails, avoiding a hanging mock.
    second.resolve(result)
    await secondRun
    expect(cancellation).toEqual({ success: true, cancelled: true })
    expect(signals[0]?.aborted).toBe(false)
    expect(signals[1]?.aborted).toBe(true)
  })

  it("cancelRunProbe rejects malformed run ids without throwing", async () => {
    vi.resetModules()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    await expect(
      background.resolveWebAiApiCheckCancelRunProbeMessage({
        runId: undefined,
      } as any),
    ).resolves.toEqual({ success: true, cancelled: false })
  })

  it("cancelRunProbe returns a safe response when abort throws", async () => {
    vi.resetModules()
    let receivedSignal: AbortSignal | undefined
    const probeDeferred = createDeferred<ApiVerificationProbeResult>()

    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockImplementation(
      async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        receivedSignal = abortSignal
        return await probeDeferred.promise
      },
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const probePromise = background.resolveWebAiApiCheckRunProbeMessage({
      runId: "web-ai-api-check-run-throws",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      modelId: "gpt-4o-mini",
      probeId: "text-generation",
    })

    await vi.waitFor(() => {
      expect(receivedSignal).toBeInstanceOf(AbortSignal)
    })

    const abortSpy = vi
      .spyOn(AbortController.prototype, "abort")
      .mockImplementation(() => {
        throw new Error("abort failed")
      })

    await expect(
      background.resolveWebAiApiCheckCancelRunProbeMessage({
        runId: "web-ai-api-check-run-throws",
      }),
    ).resolves.toEqual({ success: true, cancelled: false })

    abortSpy.mockRestore()

    probeDeferred.resolve({
      id: "text-generation",
      status: "fail",
      latencyMs: 0,
      summary: "Cancelled by user",
      input: {
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
      },
    })
    await probePromise
  })

  it.each([
    { probeId: "text-generation", mode: undefined, expectedMode: "streaming" },
    {
      probeId: "text-generation",
      mode: "non-streaming",
      expectedMode: "non-streaming",
    },
    { probeId: "models", mode: "non-streaming", expectedMode: undefined },
  ] as const)(
    "runProbe preserves $probeId mode $mode and redacts thrown errors",
    async ({ probeId, mode, expectedMode }) => {
      vi.resetModules()
      const { runApiVerificationProbe } = await import(
        "~/services/verification/aiApiVerification"
      )
      vi.mocked(runApiVerificationProbe).mockRejectedValue(
        new Error("Forbidden: sk-test-secret-fixture"),
      )

      const background = await import(
        "~/services/verification/webAiApiCheck/background"
      )

      const response = await background.resolveWebAiApiCheckRunProbeMessage({
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api/v1",
        apiKey: "sk-test-secret-fixture",
        modelId: "gpt-4o-mini",
        probeId,
        mode,
      })

      const responsePayload = response as any
      expect(responsePayload?.success).toBe(true)
      expect(responsePayload?.result?.status).toBe("fail")
      expect(responsePayload?.result?.summary).toBe("Forbidden: [REDACTED]")
      expect(responsePayload?.result?.mode).toBe(expectedMode)
    },
  )

  it.each(["unknown", null, 7, {}])(
    "rejects malformed client identity %j before probe dispatch",
    async (requestProfile) => {
      vi.resetModules()
      const { runApiVerificationProbe } = await import(
        "~/services/verification/aiApiVerification"
      )
      vi.mocked(runApiVerificationProbe).mockClear()
      const background = await import(
        "~/services/verification/webAiApiCheck/background"
      )
      const response = await background.resolveWebAiApiCheckRunProbeMessage({
        apiType: "openai",
        baseUrl: "https://example.invalid/v1",
        apiKey: "synthetic-key",
        modelId: "model",
        probeId: "text-generation",
        // Runtime messages can contain values outside their TypeScript contract.
        requestProfile: requestProfile as never,
      })
      expect(response).toEqual({
        success: false,
        error: "Invalid request profile",
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      })
      expect(runApiVerificationProbe).not.toHaveBeenCalled()
    },
  )

  it("retains enhanced client identity when the probe throws", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockRejectedValue(
      new Error("Network failed"),
    )
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const response = await background.resolveWebAiApiCheckRunProbeMessage({
      apiType: "openai",
      baseUrl: "https://example.invalid/v1",
      apiKey: "synthetic-key",
      modelId: "model",
      probeId: "text-generation",
      requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
      requestProfileEnhanced: true,
    })
    expect(response).toMatchObject({
      success: true,
      result: {
        status: "fail",
        requestProfile: API_VERIFICATION_REQUEST_PROFILES.Codex,
        requestProfileEnhanced: true,
      },
    })
  })

  it("runProbe omits analytics HTTP status when status is message-derived", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockRejectedValue(
      new Error("Forbidden 401: sk-test-secret-fixture"),
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckRunProbeMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      modelId: "gpt-4o-mini",
      probeId: "text-generation",
    })

    const responsePayload = response as any
    expect(responsePayload?.success).toBe(true)
    expect(responsePayload?.result?.summaryKey).toBe(
      "verifyDialog.summaries.unauthorized",
    )
    expect(responsePayload?.result?.summaryParams).toEqual({ status: 401 })
    expect(responsePayload?.result?.output).toBeUndefined()
  })

  it("runProbe exposes structured HTTP status for analytics classification", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockRejectedValue({
      response: { status: 401 },
      message: "Forbidden: sk-test-secret-fixture",
    })

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckRunProbeMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      modelId: "gpt-4o-mini",
      probeId: "text-generation",
    })

    const responsePayload = response as any
    expect(responsePayload?.success).toBe(true)
    expect(responsePayload?.result?.output).toEqual({ inferredHttpStatus: 401 })
  })

  it("runProbe omits summary params when the failure has no inferable status code", async () => {
    vi.resetModules()
    const { runApiVerificationProbe } = await import(
      "~/services/verification/aiApiVerification"
    )
    vi.mocked(runApiVerificationProbe).mockRejectedValue(
      new Error("Socket hang up: sk-test-secret-fixture"),
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckRunProbeMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      probeId: "text-generation",
    })

    expect(response).toEqual({
      success: true,
      result: {
        id: "text-generation",
        status: "fail",
        latencyMs: 0,
        summary: "Socket hang up: [REDACTED]",
        mode: "streaming",
        summaryKey: undefined,
        summaryParams: undefined,
        input: {
          apiType: "openai-compatible",
          baseUrl: "https://proxy.example.com/api",
        },
      },
    })
  })

  it("saveProfile normalizes baseUrl and persists a profile without echoing secrets", async () => {
    vi.resetModules()

    const { apiCredentialProfilesStorage } = await import(
      "~/services/apiCredentialProfiles/storage/profiles"
    )

    vi.mocked(apiCredentialProfilesStorage.createProfile).mockResolvedValue({
      id: "p-1",
      name: "proxy.example.com",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api",
      apiKey: "sk-test-secret-fixture",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    } as any)

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckSaveProfileMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1/chat/completions",
      apiKey: "sk-test-secret-fixture",
      pageUrl: "https://example.com/docs",
      tagIds: ["tag-work", " tag-work ", "", "tag-expiring"],
      notes: "  shared by Alice  ",
      expiresAt: 1790812800000,
    })

    expect(apiCredentialProfilesStorage.createProfile).toHaveBeenCalledWith({
      name: "proxy.example.com",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api",
      apiKey: "sk-test-secret-fixture",
      tagIds: ["tag-work", " tag-work ", "", "tag-expiring"],
      notes: "  shared by Alice  ",
      expiresAt: 1790812800000,
    })

    const responsePayload = response as any
    expect(responsePayload?.success).toBe(true)
    expect(responsePayload?.profileId).toBe("p-1")
    expect(responsePayload?.baseUrl).toBe("https://proxy.example.com/api")
    expect(responsePayload?.apiType).toBe("openai-compatible")
    expect(responsePayload?.name).toBe("proxy.example.com")
    expect(responsePayload?.apiKey).toBeUndefined()
  })

  it("saveProfile passes a trimmed HTTP(S) source URL through and drops invalid ones", async () => {
    vi.resetModules()

    const { apiCredentialProfilesStorage } = await import(
      "~/services/apiCredentialProfiles/storage/profiles"
    )

    vi.mocked(apiCredentialProfilesStorage.createProfile).mockResolvedValue({
      id: "p-source",
      name: "proxy.example.com",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api",
      apiKey: "sk-test-secret-fixture",
      tagIds: [],
      notes: "",
      createdAt: 1,
      updatedAt: 1,
    } as any)

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    await background.resolveWebAiApiCheckSaveProfileMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      sourceUrl: "  https://forum.example.com/t/7?p=2  ",
    })

    expect(apiCredentialProfilesStorage.createProfile).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceUrl: "https://forum.example.com/t/7?p=2",
      }),
    )

    vi.mocked(apiCredentialProfilesStorage.createProfile).mockClear()

    await background.resolveWebAiApiCheckSaveProfileMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      sourceUrl: "javascript:alert(1)",
    })

    expect(apiCredentialProfilesStorage.createProfile).toHaveBeenCalledWith(
      expect.not.objectContaining({
        sourceUrl: expect.anything(),
      }),
    )
  })

  it("saveProfile rejects missing required fields", async () => {
    vi.resetModules()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckSaveProfileMessage({
      apiType: "openai-compatible",
      baseUrl: "",
      apiKey: "",
    })

    expect(response).toEqual({
      success: false,
      error: "Missing apiType, baseUrl, or apiKey",
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
    })
  })

  it("saveProfile rejects invalid base urls", async () => {
    vi.resetModules()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckSaveProfileMessage({
      apiType: "openai-compatible",
      baseUrl: "not a url",
      apiKey: "sk-test-valid-enough",
    })

    expect(response).toEqual({
      success: false,
      error: "Invalid baseUrl",
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
    })
  })

  it("saveProfile sanitizes apiKey when profile creation fails", async () => {
    vi.resetModules()

    const { apiCredentialProfilesStorage } = await import(
      "~/services/apiCredentialProfiles/storage/profiles"
    )

    vi.mocked(apiCredentialProfilesStorage.createProfile).mockRejectedValue(
      new Error("duplicate key sk-test-secret-fixture"),
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckSaveProfileMessage({
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api/v1",
      apiKey: "sk-test-secret-fixture",
      name: "  My Profile  ",
    })

    expect(apiCredentialProfilesStorage.createProfile).toHaveBeenCalledWith({
      name: "My Profile",
      apiType: "openai-compatible",
      baseUrl: "https://proxy.example.com/api",
      apiKey: "sk-test-secret-fixture",
    })
    expect(response).toEqual({
      success: false,
      error: "duplicate key [REDACTED]",
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
    })
  })

  it("falls back to a generic error when the top-level handler throws", async () => {
    vi.resetModules()

    const { userPreferences } = await import(
      "~/services/preferences/userPreferences"
    )
    vi.mocked(userPreferences.getPreferences).mockRejectedValue(
      new Error("preferences exploded"),
    )

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response = await background.resolveWebAiApiCheckShouldPromptMessage({
      pageUrl: "https://example.com/docs",
    })

    expect(response).toEqual({
      success: false,
      error: "Failed to handle request",
    })
  })

  it("records Base URL history and returns current suggestions", async () => {
    vi.resetModules()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    const recordUseSpy = vi
      .spyOn(webAiApiCheckBaseUrlHistoryStorage, "recordUse")
      .mockResolvedValue({
        version: 1,
        entries: [],
        lastUpdated: 123,
      })
    vi.spyOn(
      webAiApiCheckBaseUrlHistoryStorage,
      "getSuggestions",
    ).mockResolvedValue([
      {
        baseUrl: "https://canonical.example.com",
        lastUsedAt: 123,
        useCount: 2,
      },
    ])
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response =
      await background.resolveWebAiApiCheckRecordBaseUrlHistoryMessage({
        baseUrl: "https://canonical.example.com/api/v1/models",
        pageUrl: "https://docs.example.invalid/setup",
      })

    expect(recordUseSpy).toHaveBeenCalledWith({
      baseUrl: "https://canonical.example.com/api/v1/models",
      pageUrl: "https://docs.example.invalid/setup",
    })
    expect(response).toEqual({
      success: true,
      suggestions: [
        {
          baseUrl: "https://canonical.example.com",
          lastUsedAt: 123,
          useCount: 2,
        },
      ],
    })
  })

  it("returns Base URL history suggestions through the registered background handler", async () => {
    vi.resetModules()
    onWebAiApiCheckMessageMock.mockClear()
    webAiApiCheckMessageHandlers.clear()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    const getSuggestionsSpy = vi
      .spyOn(webAiApiCheckBaseUrlHistoryStorage, "getSuggestions")
      .mockResolvedValue([
        {
          baseUrl: "https://suggested.example.com",
          lastUsedAt: 123,
          useCount: 2,
          matchedSourceOrigin: "https://docs.example.invalid",
        },
      ])
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const { WebAiApiCheckMessageTypes } = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )

    background.setupWebAiApiCheckMessagingListeners()
    const handler = webAiApiCheckMessageHandlers.get(
      WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions,
    )

    await expect(
      handler?.({
        data: {
          pageUrl: "https://docs.example.invalid/setup",
          limit: 2,
        },
      }),
    ).resolves.toEqual({
      success: true,
      suggestions: [
        {
          baseUrl: "https://suggested.example.com",
          lastUsedAt: 123,
          useCount: 2,
          matchedSourceOrigin: "https://docs.example.invalid",
        },
      ],
    })
    expect(getSuggestionsSpy).toHaveBeenCalledWith({
      pageUrl: "https://docs.example.invalid/setup",
      limit: 2,
    })
  })

  it("returns a safe failure when Base URL history suggestions cannot be read", async () => {
    vi.resetModules()
    onWebAiApiCheckMessageMock.mockClear()
    webAiApiCheckMessageHandlers.clear()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    vi.spyOn(
      webAiApiCheckBaseUrlHistoryStorage,
      "getSuggestions",
    ).mockRejectedValue(new Error("database path leaked"))
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const { WebAiApiCheckMessageTypes } = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )

    background.setupWebAiApiCheckMessagingListeners()
    const handler = webAiApiCheckMessageHandlers.get(
      WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions,
    )

    await expect(
      handler?.({
        data: {
          pageUrl: "https://docs.example.invalid/setup",
          limit: 2,
        },
      }),
    ).resolves.toEqual({
      success: false,
      error: "Failed to read Base URL history",
    })
  })

  it("records no Base URL history for blank input but still returns suggestions", async () => {
    vi.resetModules()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    const recordUseSpy = vi.spyOn(
      webAiApiCheckBaseUrlHistoryStorage,
      "recordUse",
    )
    vi.spyOn(
      webAiApiCheckBaseUrlHistoryStorage,
      "getSuggestions",
    ).mockResolvedValue([])
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response =
      await background.resolveWebAiApiCheckRecordBaseUrlHistoryMessage({
        baseUrl: "   ",
        pageUrl: "https://docs.example.invalid/setup",
      })

    expect(recordUseSpy).not.toHaveBeenCalled()
    expect(response).toEqual({ success: true, suggestions: [] })
  })

  it("keeps record Base URL history best-effort when storage fails", async () => {
    vi.resetModules()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    vi.spyOn(webAiApiCheckBaseUrlHistoryStorage, "recordUse").mockRejectedValue(
      new Error("storage unavailable"),
    )
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response =
      await background.resolveWebAiApiCheckRecordBaseUrlHistoryMessage({
        baseUrl: "https://canonical.example.com/api/v1/models",
        pageUrl: "https://docs.example.invalid/setup",
      })

    expect(response).toEqual({ success: true })
  })

  it("removes a stored Base URL history entry and returns current suggestions", async () => {
    vi.resetModules()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    const removeBaseUrlSpy = vi
      .spyOn(webAiApiCheckBaseUrlHistoryStorage, "removeBaseUrl")
      .mockResolvedValue({
        version: 1,
        entries: [],
        lastUpdated: 123,
      })
    const getSuggestionsSpy = vi
      .spyOn(webAiApiCheckBaseUrlHistoryStorage, "getSuggestions")
      .mockResolvedValue([
        {
          baseUrl: "https://keep.example.com",
          lastUsedAt: 123,
          useCount: 1,
        },
      ])
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response =
      await background.resolveWebAiApiCheckRemoveBaseUrlHistoryMessage({
        baseUrl: "https://remove.example.com/api/v1/models",
        pageUrl: "https://docs.example.invalid/setup",
      })

    expect(removeBaseUrlSpy).toHaveBeenCalledWith({
      baseUrl: "https://remove.example.com/api/v1/models",
    })
    expect(getSuggestionsSpy).toHaveBeenCalledWith({
      pageUrl: "https://docs.example.invalid/setup",
      limit: WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT,
    })
    expect(response).toEqual({
      success: true,
      suggestions: [
        {
          baseUrl: "https://keep.example.com",
          lastUsedAt: 123,
          useCount: 1,
        },
      ],
    })
  })

  it("removes no Base URL history for blank input but still returns suggestions", async () => {
    vi.resetModules()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    const removeBaseUrlSpy = vi.spyOn(
      webAiApiCheckBaseUrlHistoryStorage,
      "removeBaseUrl",
    )
    vi.spyOn(
      webAiApiCheckBaseUrlHistoryStorage,
      "getSuggestions",
    ).mockResolvedValue([])
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response =
      await background.resolveWebAiApiCheckRemoveBaseUrlHistoryMessage({
        baseUrl: "   ",
        pageUrl: "https://docs.example.invalid/setup",
      })

    expect(removeBaseUrlSpy).not.toHaveBeenCalled()
    expect(response).toEqual({ success: true, suggestions: [] })
  })

  it("keeps remove Base URL history best-effort when storage fails", async () => {
    vi.resetModules()

    const { webAiApiCheckBaseUrlHistoryStorage } = await import(
      "~/services/verification/webAiApiCheck/baseUrlHistory"
    )
    vi.spyOn(
      webAiApiCheckBaseUrlHistoryStorage,
      "removeBaseUrl",
    ).mockRejectedValue(new Error("storage unavailable"))
    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )

    const response =
      await background.resolveWebAiApiCheckRemoveBaseUrlHistoryMessage({
        baseUrl: "https://remove.example.com/api/v1/models",
        pageUrl: "https://docs.example.invalid/setup",
      })

    expect(response).toEqual({ success: true })
  })

  it("registers the cancel-run-probe background message handler", async () => {
    vi.resetModules()
    onWebAiApiCheckMessageMock.mockClear()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const { WebAiApiCheckMessageTypes } = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )
    const { tagStorage } = await import("~/services/tags/tagStorage")

    vi.mocked(tagStorage.listTags).mockResolvedValue([
      { id: "tag-work", name: "Work", createdAt: 1, updatedAt: 1 },
    ])
    vi.mocked(tagStorage.createTag).mockResolvedValue({
      id: "tag-created",
      name: "Created",
      createdAt: 2,
      updatedAt: 2,
    })
    vi.mocked(tagStorage.renameTag).mockResolvedValue({
      id: "tag-work",
      name: "Renamed",
      createdAt: 1,
      updatedAt: 3,
    })
    background.setupWebAiApiCheckMessagingListeners()
    background.setupWebAiApiCheckMessagingListeners()

    expect(
      onWebAiApiCheckMessageMock.mock.calls.map((call) => call[0]),
    ).toEqual([
      WebAiApiCheckMessageTypes.ShouldPrompt,
      WebAiApiCheckMessageTypes.SetSiteAccess,
      WebAiApiCheckMessageTypes.FetchModels,
      WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions,
      WebAiApiCheckMessageTypes.RecordBaseUrlHistory,
      WebAiApiCheckMessageTypes.RemoveBaseUrlHistory,
      WebAiApiCheckMessageTypes.ListTags,
      WebAiApiCheckMessageTypes.CreateTag,
      WebAiApiCheckMessageTypes.RenameTag,
      WebAiApiCheckMessageTypes.RunProbe,
      WebAiApiCheckMessageTypes.RunPelican,
      WebAiApiCheckMessageTypes.ContextCounter,
      WebAiApiCheckMessageTypes.NeedleHistory,
      WebAiApiCheckMessageTypes.RunNeedle,
      WebAiApiCheckMessageTypes.StopNeedleSelection,
      WebAiApiCheckMessageTypes.DiscardNeedleCheckpoints,
      WebAiApiCheckMessageTypes.RunContextCapacity,
      WebAiApiCheckMessageTypes.ContextHistory,
      WebAiApiCheckMessageTypes.DiscardContextCheckpoints,
      WebAiApiCheckMessageTypes.CancelRunProbe,
      WebAiApiCheckMessageTypes.SaveProfile,
    ])

    const cancelHandler = webAiApiCheckMessageHandlers.get(
      WebAiApiCheckMessageTypes.CancelRunProbe,
    )
    expect(cancelHandler).toEqual(expect.any(Function))
    await expect(
      cancelHandler?.({ data: { runId: "missing-run" } }),
    ).resolves.toEqual({ success: true, cancelled: false })

    await expect(
      webAiApiCheckMessageHandlers.get(WebAiApiCheckMessageTypes.ListTags)?.({
        data: {},
      }),
    ).resolves.toEqual({
      success: true,
      tags: [{ id: "tag-work", name: "Work", createdAt: 1, updatedAt: 1 }],
    })
    await expect(
      webAiApiCheckMessageHandlers.get(WebAiApiCheckMessageTypes.CreateTag)?.({
        data: { name: "Created" },
      }),
    ).resolves.toEqual({
      success: true,
      tag: { id: "tag-created", name: "Created", createdAt: 2, updatedAt: 2 },
    })
    await expect(
      webAiApiCheckMessageHandlers.get(WebAiApiCheckMessageTypes.RenameTag)?.({
        data: { tagId: "tag-work", name: "Renamed" },
      }),
    ).resolves.toEqual({
      success: true,
      tag: { id: "tag-work", name: "Renamed", createdAt: 1, updatedAt: 3 },
    })
    expect(tagStorage.createTag).toHaveBeenCalledWith("Created")
    expect(tagStorage.renameTag).toHaveBeenCalledWith("tag-work", "Renamed")
  })

  it("tag message handlers return sanitized errors when tag storage rejects", async () => {
    vi.resetModules()
    onWebAiApiCheckMessageMock.mockClear()

    const background = await import(
      "~/services/verification/webAiApiCheck/background"
    )
    const { WebAiApiCheckMessageTypes } = await import(
      "~/services/verification/webAiApiCheck/messaging"
    )
    const { tagStorage } = await import("~/services/tags/tagStorage")

    vi.mocked(tagStorage.listTags).mockRejectedValue(new Error("list failed"))
    vi.mocked(tagStorage.createTag).mockRejectedValue(
      new Error("create failed"),
    )
    vi.mocked(tagStorage.renameTag).mockRejectedValue(
      new Error("rename failed"),
    )

    background.setupWebAiApiCheckMessagingListeners()

    await expect(
      webAiApiCheckMessageHandlers.get(WebAiApiCheckMessageTypes.ListTags)?.({
        data: {},
      }),
    ).resolves.toEqual({
      success: false,
      error: "Failed to list tags",
    })
    await expect(
      webAiApiCheckMessageHandlers.get(WebAiApiCheckMessageTypes.CreateTag)?.({
        data: { name: "Created" },
      }),
    ).resolves.toEqual({
      success: false,
      error: "create failed",
    })
    await expect(
      webAiApiCheckMessageHandlers.get(WebAiApiCheckMessageTypes.RenameTag)?.({
        data: { tagId: "tag-work", name: "Renamed" },
      }),
    ).resolves.toEqual({
      success: false,
      error: "rename failed",
    })
  })
})
