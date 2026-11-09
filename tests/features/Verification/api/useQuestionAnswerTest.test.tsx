import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { fakeBrowser } from "wxt/testing/fake-browser"

import { useQuestionAnswerTest } from "~/features/Verification/api/useQuestionAnswerTest"
import { userPreferences } from "~/services/preferences/userPreferences"
import type {
  QuestionAnswerRequest,
  QuestionAnswerResult,
} from "~/services/verification/modelQuality/questionAnswer"

const request = {
  baseUrl: "https://qa.example.invalid",
  apiKey: "secret-key",
  apiType: "openai-compatible" as const,
  modelId: "test",
  mode: "non-streaming" as const,
  requestProfile: "default" as const,
  requestProfileEnhanced: false,
  secrets: ["secret-key"],
}
const resultValue: QuestionAnswerResult = {
  question: "Old question",
  referenceAnswer: "21",
  text: "FINAL_ANSWER: 21",
  answer: "21",
  outcome: "matched",
  latencyMs: 1,
}
const options = {
  contextKey: "first",
  enabled: true,
  blocked: false,
  resolveRequest: async () => request,
}

describe("question answer workspace", () => {
  afterEach(() => vi.restoreAllMocks())
  it("restores legacy questions without retaining a hidden grading mode", async () => {
    const legacy = {
      question: "Saved question",
      referenceAnswer: "Saved answer",
      grading: "manual" as const,
    }
    await userPreferences.updateQuestionAnswerTest(legacy)
    const runner = vi
      .fn<(request: QuestionAnswerRequest) => Promise<QuestionAnswerResult>>()
      .mockResolvedValue(resultValue)
    const view = renderHook(() => useQuestionAnswerTest({ ...options, runner }))
    await waitFor(() => expect(view.result.current.ready).toBe(true))
    expect(view.result.current.settings).toEqual({
      question: "Saved question",
      referenceAnswer: "Saved answer",
    })
    act(() => view.result.current.run())
    await waitFor(() => expect(runner).toHaveBeenCalledOnce())
    expect(runner.mock.calls[0]?.[0]).not.toHaveProperty("grading")
  })
  it("saves a newer edit after a failed in-flight write and clears the save error", async () => {
    const view = renderHook(() => useQuestionAnswerTest(options))
    await waitFor(() => expect(view.result.current.ready).toBe(true))
    let failWrite!: (cause: Error) => void
    vi.spyOn(fakeBrowser.storage.local, "set").mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          failWrite = reject
        }),
    )
    act(() => view.result.current.updateSettings({ question: "Older edit" }))
    let first!: Promise<void>
    act(() => {
      first = view.result.current.saveSettings()
    })
    await waitFor(() => expect(failWrite).toBeDefined())
    act(() => view.result.current.updateSettings({ question: "Newest edit" }))
    let second!: Promise<void>
    act(() => {
      second = view.result.current.saveSettings()
    })
    await act(async () => {
      failWrite(new Error("storage unavailable"))
      await first
      await second
    })
    expect(
      (await userPreferences.getPreferencesStrict()).questionAnswerTest
        ?.question,
    ).toBe("Newest edit")
    expect(view.result.current.saveError).toBeNull()
    view.unmount()
    expect(
      (await userPreferences.getPreferencesStrict()).questionAnswerTest
        ?.question,
    ).toBe("Newest edit")
  })
  it("keeps an unreadable draft blocked until retry succeeds without writing defaults", async () => {
    const read = vi
      .spyOn(fakeBrowser.storage.local, "get")
      .mockRejectedValueOnce(new Error("read unavailable"))
    const write = vi.spyOn(fakeBrowser.storage.local, "set")
    const view = renderHook(() => useQuestionAnswerTest(options))
    await waitFor(() => expect(view.result.current.saveError).toBe("load"))
    expect(view.result.current.canRun).toBe(false)
    expect(write).not.toHaveBeenCalled()
    read.mockRestore()
    await act(() => view.result.current.loadSettings())
    expect(view.result.current.ready).toBe(true)
  })

  it("flushes the latest edits on unmount and preserves unrelated preference writes", async () => {
    const view = renderHook(() => useQuestionAnswerTest(options))
    await waitFor(() => expect(view.result.current.ready).toBe(true))
    act(() =>
      view.result.current.updateSettings({ question: "Pending question" }),
    )
    await userPreferences.setVerificationProbePrompts({
      "text-generation": "custom baseline",
    })
    view.unmount()
    await waitFor(async () =>
      expect(
        (await userPreferences.getPreferences()).questionAnswerTest?.question,
      ).toBe("Pending question"),
    )
    expect(
      (await userPreferences.getPreferences()).verificationProbePrompts,
    ).toEqual({ "text-generation": "custom baseline" })
  })

  it("stops before credential resolution and never dispatches the question", async () => {
    let resolve!: (value: typeof request) => void
    const runner = vi.fn()
    const view = renderHook(() =>
      useQuestionAnswerTest({
        ...options,
        runner,
        resolveRequest: async () =>
          new Promise((done) => {
            resolve = done
          }),
      }),
    )
    await waitFor(() => expect(view.result.current.ready).toBe(true))
    act(() => view.result.current.run())
    act(() => view.result.current.stop())
    await act(async () => resolve(request))
    expect(runner).not.toHaveBeenCalled()
    expect(view.result.current.status).toBe("stopped")
  })
  it("saves edited fields and restores them when another workspace opens", async () => {
    const first = renderHook(() => useQuestionAnswerTest(options))
    await waitFor(() => expect(first.result.current.ready).toBe(true))
    act(() =>
      first.result.current.updateSettings({
        question: "My question",
        referenceAnswer: "",
      }),
    )
    await act(() => first.result.current.saveSettings())
    first.unmount()
    const second = renderHook(() => useQuestionAnswerTest(options))
    await waitFor(() =>
      expect(second.result.current.settings).toMatchObject({
        question: "My question",
        referenceAnswer: "",
      }),
    )
    expect(
      (await userPreferences.getPreferences()).questionAnswerTest?.question,
    ).toBe("My question")
  })

  it("stops immediately and ignores a late answer after a newer run starts", async () => {
    const completions: Array<(value: QuestionAnswerResult) => void> = []
    const signals: AbortSignal[] = []
    const view = renderHook(() =>
      useQuestionAnswerTest({
        ...options,
        runner: async ({ abortSignal }) => {
          signals.push(abortSignal!)
          return new Promise((resolve) => completions.push(resolve))
        },
      }),
    )
    await waitFor(() => expect(view.result.current.ready).toBe(true))
    act(() => view.result.current.run())
    await waitFor(() => expect(completions).toHaveLength(1))
    act(() => view.result.current.stop())
    expect(signals[0]!.aborted).toBe(true)
    expect(view.result.current.status).toBe("stopped")
    act(() => view.result.current.run())
    await waitFor(() => expect(completions).toHaveLength(2))
    await act(async () => completions[0]!(resultValue))
    expect(view.result.current.status).toBe("running")
    expect(view.result.current.result).toBeNull()
    await act(async () => completions[1]!({ ...resultValue, text: "Newest" }))
    expect(view.result.current.result?.text).toBe("Newest")
  })

  it("invalidates a request when the credential context changes", async () => {
    let complete!: (value: QuestionAnswerResult) => void
    let signal!: AbortSignal
    const runner = async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
      signal = abortSignal!
      return new Promise<QuestionAnswerResult>((resolve) => {
        complete = resolve
      })
    }
    const view = renderHook(
      ({ contextKey }) =>
        useQuestionAnswerTest({ ...options, contextKey, runner }),
      { initialProps: { contextKey: "first" } },
    )
    await waitFor(() => expect(view.result.current.ready).toBe(true))
    act(() => view.result.current.run())
    await waitFor(() => expect(signal).toBeDefined())
    view.rerender({ contextKey: "second" })
    expect(signal.aborted).toBe(true)
    await act(async () => complete(resultValue))
    expect(view.result.current.result).toBeNull()
    expect(view.result.current.status).toBe("idle")
  })
})
