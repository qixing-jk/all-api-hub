import {
  CONTEXT_ATTEMPT_OUTCOMES,
  CONTEXT_CAPACITY_REASONS,
} from "~/services/verification/modelQuality/contextCapacityConstants"

import "./apiCheckModalHostMocks"

import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useApiCheckModalViewModel } from "~/features/WebAiApiCheck/content/modal/useApiCheckModalViewModel"
import { sendWebAiApiCheckMessage } from "~/services/verification/webAiApiCheck/messaging"
import * as messaging from "~/services/verification/webAiApiCheck/messaging"
import { createDeferred } from "~~/tests/test-utils/deferred"

import { setupApiCheckModalHostTest } from "./apiCheckModalHostTestSupport"

describe("web context capacity entry", () => {
  setupApiCheckModalHostTest()

  it("forwards a budget continuation to background and clears it after a model change", async () => {
    const paused = {
      lowerBoundTokens: 4096,
      upperBoundTokens: 8192,
      reason: CONTEXT_CAPACITY_REASONS.Budget,
      inputLimit: 8192,
      attempts: [
        { targetTokens: 8192, outcome: CONTEXT_ATTEMPT_OUTCOMES.ContextLimit },
        { targetTokens: 4096, outcome: CONTEXT_ATTEMPT_OUTCOMES.Accepted },
      ],
      counter: { encoding: "o200k_base", estimated: true },
    }
    const previous = vi
      .mocked(sendWebAiApiCheckMessage)
      .getMockImplementation()!
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, data: any) =>
        type === "webAiApiCheck:runContextCapacity"
          ? { success: true, result: paused }
          : previous(type, data),
    )
    const { result } = renderHook(() => useApiCheckModalViewModel())
    act(() => {
      result.current.actions.updateBaseUrl("https://context.example.com")
      result.current.actions.setApiKey("context-secret")
      result.current.actions.setModelId("first")
    })
    act(() => result.current.view.verificationTools.contextCapacity!.run())
    await waitFor(() =>
      expect(
        result.current.view.verificationTools.contextCapacity!.result,
      ).toEqual(paused),
    )
    act(() => result.current.view.verificationTools.contextCapacity!.run())
    await waitFor(() =>
      expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
        "webAiApiCheck:runContextCapacity",
        expect.objectContaining({ resumeFrom: paused }),
      ),
    )
    await waitFor(() =>
      expect(
        result.current.view.verificationTools.contextCapacity!.running,
      ).toBe(false),
    )
    act(() => result.current.actions.setModelId("second"))
    act(() => result.current.view.verificationTools.contextCapacity!.run())
    await waitFor(() =>
      expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
        "webAiApiCheck:runContextCapacity",
        expect.objectContaining({ modelId: "second", resumeFrom: undefined }),
      ),
    )
  })

  it("does not offer a context probe for embedding models", async () => {
    const { result } = renderHook(() => useApiCheckModalViewModel())
    await act(async () => {
      result.current.actions.updateBaseUrl("https://context.example.com")
      result.current.actions.setApiKey("context-secret")
      result.current.actions.setModelId("text-embedding-3-small")
    })
    expect(result.current.view.verificationTools.contextCapacity!.enabled).toBe(
      false,
    )
    expect(result.current.view.verificationTools.contextCapacity!.canRun).toBe(
      false,
    )
  })

  it("keeps context visible but cannot start without credentials and a model", async () => {
    const { result } = renderHook(() => useApiCheckModalViewModel())
    expect(result.current.view.verificationTools.contextCapacity!.enabled).toBe(
      true,
    )
    expect(result.current.view.verificationTools.contextCapacity!.canRun).toBe(
      false,
    )
    await act(async () => {
      result.current.actions.updateBaseUrl("https://context.example.com")
      result.current.actions.setApiKey("context-secret")
    })
    expect(result.current.view.verificationTools.contextCapacity!.canRun).toBe(
      false,
    )
  })

  it.each(["stop", "model", "key", "unmount"])(
    "rejects stale progress and completion after %s",
    async (change) => {
      const pending = createDeferred<any>()
      let progress!: (event: any) => void
      const remove = vi.fn()
      const listener = vi
        .spyOn(messaging, "onWebAiApiCheckMessage")
        .mockImplementation((_type, callback: any) => {
          progress = callback
          return remove
        })
      const previous = vi
        .mocked(sendWebAiApiCheckMessage)
        .getMockImplementation()!
      vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
        async (type: any, data: any) => {
          if (type === "webAiApiCheck:runContextCapacity")
            return pending.promise
          return previous(type, data)
        },
      )
      const { result, unmount } = renderHook(() => useApiCheckModalViewModel())
      try {
        act(() => {
          result.current.actions.updateBaseUrl("https://context.example.com")
          result.current.actions.setApiKey("context-secret")
          result.current.actions.setModelId("gpt-test")
        })
        act(() => result.current.view.verificationTools.contextCapacity!.run())
        await waitFor(() =>
          expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
            "webAiApiCheck:runContextCapacity",
            expect.anything(),
          ),
        )
        const calls = vi.mocked(sendWebAiApiCheckMessage).mock.calls
        const request = calls
          .filter(([type]) => type === "webAiApiCheck:runContextCapacity")
          .at(-1)![1] as { runId: string }
        const measurement = {
          lowerBoundTokens: 1024,
          reason: CONTEXT_CAPACITY_REASONS.TestLimit,
          attempts: [],
        }
        act(() =>
          progress({ data: { runId: "unrelated", result: measurement } }),
        )
        expect(
          result.current.view.verificationTools.contextCapacity!.progress,
        ).toBeNull()
        act(() =>
          progress({ data: { runId: request.runId, result: measurement } }),
        )
        expect(
          result.current.view.verificationTools.contextCapacity!.progress,
        ).toEqual(measurement)
        act(() => {
          if (change === "stop")
            result.current.view.verificationTools.contextCapacity!.stop()
          if (change === "model")
            result.current.actions.setModelId("replacement")
          if (change === "key") result.current.actions.setApiKey("replacement")
          if (change === "unmount") unmount()
        })
        expect(remove).toHaveBeenCalledTimes(1)
        await act(async () => {
          progress({
            data: {
              runId: request.runId,
              result: { ...measurement, lowerBoundTokens: 9999 },
            },
          })
          pending.resolve({ success: true, result: measurement })
        })
        if (change !== "unmount")
          expect(
            result.current.view.verificationTools.contextCapacity!.result,
          ).toBeNull()
        expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
          "webAiApiCheck:cancelRunProbe",
          { runId: request.runId },
        )
      } finally {
        unmount()
        listener.mockRestore()
      }
    },
  )

  it("redacts background errors and allows retry", async () => {
    const previous = vi
      .mocked(sendWebAiApiCheckMessage)
      .getMockImplementation()!
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, data: any) => {
        if (type === "webAiApiCheck:runContextCapacity")
          return { success: false, error: "Unavailable context-secret" }
        return previous(type, data)
      },
    )
    const { result } = renderHook(() => useApiCheckModalViewModel())
    act(() => {
      result.current.actions.updateBaseUrl("https://context.example.com")
      result.current.actions.setApiKey("context-secret")
      result.current.actions.setModelId("gpt-test")
    })
    act(() => result.current.view.verificationTools.contextCapacity!.run())
    await waitFor(() =>
      expect(
        result.current.view.verificationTools.contextCapacity!.error,
      ).toContain("Unavailable"),
    )
    expect(
      result.current.view.verificationTools.contextCapacity!.error,
    ).not.toContain("context-secret")
    expect(result.current.view.verificationTools.contextCapacity!.canRun).toBe(
      true,
    )
  })

  it("allows other tests while measuring and ignores a late result after stopping", async () => {
    const pending = createDeferred<any>()
    const previous = vi
      .mocked(sendWebAiApiCheckMessage)
      .getMockImplementation()!
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, data: any) => {
        if (type === "webAiApiCheck:runContextCapacity") return pending.promise
        if (type === "webAiApiCheck:cancelRunProbe")
          throw new Error("Background unavailable")
        return previous(type, data)
      },
    )
    const { result } = renderHook(() => useApiCheckModalViewModel())
    act(() => {
      result.current.actions.updateBaseUrl("https://context.example.com")
      result.current.actions.setApiKey("context-secret")
      result.current.actions.setModelId("gpt-test")
    })
    act(() => result.current.view.verificationTools.contextCapacity!.run())
    await waitFor(() =>
      expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
        "webAiApiCheck:runContextCapacity",
        expect.anything(),
      ),
    )
    expect(result.current.view.canClose).toBe(false)
    expect(result.current.view.isRunAllActionDisabled).toBe(false)
    expect(result.current.view.verificationTools.canRunPelican).toBe(true)
    act(() => result.current.actions.runProbe("text-generation"))
    await waitFor(() =>
      expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
        "webAiApiCheck:runProbe",
        expect.objectContaining({ probeId: "text-generation" }),
      ),
    )
    act(() => result.current.view.verificationTools.contextCapacity!.stop())
    await act(async () =>
      pending.resolve({ success: true, result: { lowerBoundTokens: 9999 } }),
    )
    expect(
      result.current.view.verificationTools.contextCapacity!.result,
    ).toBeNull()
    expect(result.current.view.verificationTools.contextCapacity!.stopped).toBe(
      true,
    )
  })

  it("runs the selected model through background and publishes its capacity result", async () => {
    const capacity = {
      lowerBoundTokens: 1024,
      reason: CONTEXT_CAPACITY_REASONS.TestLimit,
      attempts: [],
      counter: { encoding: "estimate", estimated: true },
    }
    const previous = vi
      .mocked(sendWebAiApiCheckMessage)
      .getMockImplementation()!
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, data: any) => {
        if (type === "webAiApiCheck:runContextCapacity")
          return { success: true, result: capacity }
        return previous(type, data)
      },
    )
    const { result } = renderHook(() => useApiCheckModalViewModel())
    act(() => {
      result.current.actions.updateBaseUrl("https://context.example.com")
      result.current.actions.setApiKey("context-secret")
      result.current.actions.setModelId("gpt-test")
    })
    expect(result.current.view.verificationTools.contextCapacity?.enabled).toBe(
      true,
    )
    act(() => result.current.view.verificationTools.contextCapacity!.run())
    await waitFor(() =>
      expect(
        result.current.view.verificationTools.contextCapacity!.result,
      ).toEqual(capacity),
    )
    expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
      "webAiApiCheck:runContextCapacity",
      expect.objectContaining({
        runId: expect.any(String),
        baseUrl: "https://context.example.com",
        apiKey: "context-secret",
        modelId: "gpt-test",
        maxInputTokens: undefined,
      }),
    )
  })
})
