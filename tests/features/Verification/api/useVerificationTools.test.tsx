import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  useVerificationTools,
  VERIFICATION_TOOL_STATUSES,
  type VerificationToolRequestParams,
} from "~/features/Verification/api/useVerificationTools"
import { API_VERIFICATION_PROBE_IDS } from "~/services/verification/aiApiVerification/types"
import {
  DRAWING_VERIFICATION_OUTCOMES,
  PELICAN_EXECUTION_MODES,
} from "~/services/verification/modelQuality/constants"

const mockRunPelicanTest = vi.fn()
const mockLoadOverrides = vi.fn()
const mockSaveOverrides = vi.fn()
const mockGetDrawing = vi.fn()
const mockSaveDrawing = vi.fn()
vi.mock("~/services/verification/verificationResultHistory", () => ({
  verificationResultHistoryStorage: {
    getDrawingSummary: (...args: unknown[]) => mockGetDrawing(...args),
    upsertDrawingSummary: (...args: unknown[]) => mockSaveDrawing(...args),
  },
  serializeVerificationHistoryTarget: (target: { profileId: string }) =>
    target.profileId,
}))

vi.mock("~/services/verification/modelQuality/pelican", () => ({
  PELICAN_TEST_PROMPT: "draw a pelican",
  runPelicanTest: (...args: unknown[]) => mockRunPelicanTest(...args),
}))

vi.mock("~/services/verification/promptOverrides", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/verification/promptOverrides")
    >()
  return {
    ...actual,
    loadProbePromptOverrides: () => mockLoadOverrides(),
    saveProbePromptOverrides: (...args: unknown[]) =>
      mockSaveOverrides(...args),
  }
})

const buildRequest = (): VerificationToolRequestParams => ({
  baseUrl: "https://tools.example.invalid",
  apiKey: "secret-key",
  apiType: "openai-compatible",
  modelId: "gpt-test",
  mode: "non-streaming",
  requestProfile: "default",
  requestProfileEnhanced: false,
  secrets: ["secret-key"],
})

const buildPelicanResult = () => ({
  runAt: 0,
  latencyMs: 5,
  text: "<svg/>",
  svg: "<svg/>",
  analysis: {
    hasSvg: true,
    safe: true,
    viewBox: null,
    byteSize: 6,
    counts: {
      path: 0,
      circle: 0,
      ellipse: 0,
      rect: 0,
      polygon: 0,
      polyline: 0,
      line: 0,
      text: 0,
      group: 0,
    },
    shapeCount: 0,
    wheelClues: 0,
  },
})

describe("useVerificationTools", () => {
  it("saves and restores the drawing summary without restoring raw artifacts", async () => {
    mockRunPelicanTest.mockResolvedValue(buildPelicanResult())
    mockSaveDrawing.mockImplementation(async (summary) => {
      mockGetDrawing.mockResolvedValue(summary)
    })
    const options = {
      resolveRequest: async () => buildRequest(),
      isSupported: true,
      isBlocked: false,
      historyTarget: {
        kind: "profile-model" as const,
        profileId: "profile",
        modelId: "gpt-test",
      },
      historyApiType: "openai-compatible" as const,
    }
    const first = renderHook(() => useVerificationTools(options))
    act(() => first.result.current.runPelican())
    await waitFor(() =>
      expect(mockSaveDrawing).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: DRAWING_VERIFICATION_OUTCOMES.Generated,
          modelId: "gpt-test",
        }),
      ),
    )
    expect(mockSaveDrawing.mock.calls[0]![0]).not.toHaveProperty("svg")
    first.unmount()
    const restored = renderHook(() => useVerificationTools(options))
    await waitFor(() =>
      expect(restored.result.current.pelicanSummary?.outcome).toBe("generated"),
    )
    expect(restored.result.current.pelican).toBeNull()
  })

  it("does not let a late history read replace a newly completed drawing", async () => {
    let finishRead!: (value: unknown) => void
    mockGetDrawing.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishRead = resolve
        }),
    )
    mockRunPelicanTest.mockResolvedValue(buildPelicanResult())
    const { result } = renderHook(() =>
      useVerificationTools({
        resolveRequest: async () => buildRequest(),
        isSupported: true,
        isBlocked: false,
        historyTarget: {
          kind: "profile-model",
          profileId: "profile",
          modelId: "gpt-test",
        },
        historyApiType: "openai-compatible",
      }),
    )
    act(() => result.current.runPelican())
    await waitFor(() =>
      expect(result.current.pelicanStatus).toBe(
        VERIFICATION_TOOL_STATUSES.Done,
      ),
    )
    await act(async () =>
      finishRead({
        apiType: "openai-compatible",
        outcome: DRAWING_VERIFICATION_OUTCOMES.Error,
        executionMode: PELICAN_EXECUTION_MODES.Agent,
      }),
    )
    expect(result.current.pelicanSummary?.outcome).toBe("generated")
    expect(result.current.pelicanExecutionMode).toBe(
      PELICAN_EXECUTION_MODES.Reply,
    )
  })

  it("opts into the agent runner without changing ordinary drawing requests", async () => {
    mockRunPelicanTest.mockResolvedValue(buildPelicanResult())
    const { result } = renderHook(() =>
      useVerificationTools({
        resolveRequest: async () => buildRequest(),
        isSupported: true,
        isBlocked: false,
      }),
    )
    expect(result.current.pelicanExecutionMode).toBe(
      PELICAN_EXECUTION_MODES.Reply,
    )
    act(() =>
      result.current.setPelicanExecutionMode(PELICAN_EXECUTION_MODES.Agent),
    )
    act(() => result.current.runPelican())
    await waitFor(() =>
      expect(mockRunPelicanTest).toHaveBeenCalledWith(
        expect.objectContaining({
          executionMode: PELICAN_EXECUTION_MODES.Agent,
        }),
      ),
    )
    await waitFor(() =>
      expect(result.current.pelicanStatus).toBe(
        VERIFICATION_TOOL_STATUSES.Done,
      ),
    )
    act(() =>
      result.current.setPelicanExecutionMode(PELICAN_EXECUTION_MODES.Reply),
    )
    expect(result.current.pelican).toBeNull()
  })

  beforeEach(() => {
    mockRunPelicanTest.mockReset()
    mockLoadOverrides.mockReset()
    mockSaveOverrides.mockReset()
    mockGetDrawing.mockReset().mockResolvedValue(null)
    mockSaveDrawing.mockReset().mockResolvedValue(undefined)
    mockLoadOverrides.mockResolvedValue({})
  })

  it("loads the shared prompt overrides on mount", async () => {
    mockLoadOverrides.mockResolvedValue({
      [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Say YES",
    })

    const { result } = renderHook(() =>
      useVerificationTools({
        resolveRequest: async () => buildRequest(),
        isSupported: true,
        isBlocked: false,
      }),
    )

    await waitFor(() =>
      expect(result.current.promptDraft).toEqual({
        [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Say YES",
      }),
    )
    expect(result.current.isPromptsDirty).toBe(false)
  })

  it("refuses to run when unsupported, blocked, or without credentials", async () => {
    for (const options of [
      { isSupported: false, isBlocked: false, request: buildRequest() },
      { isSupported: true, isBlocked: true, request: buildRequest() },
      { isSupported: true, isBlocked: false, request: null },
    ]) {
      mockRunPelicanTest.mockReset()
      const { result } = renderHook(() =>
        useVerificationTools({
          resolveRequest: async () =>
            options.request as VerificationToolRequestParams | null,
          isSupported: options.isSupported,
          isBlocked: options.isBlocked,
        }),
      )

      act(() => result.current.runPelican())

      await waitFor(() =>
        expect(result.current.pelicanStatus).not.toBe(
          VERIFICATION_TOOL_STATUSES.Running,
        ),
      )
      expect(mockRunPelicanTest).not.toHaveBeenCalled()
    }
  })

  it("runs the drawing test and stores the result", async () => {
    mockRunPelicanTest.mockResolvedValue(buildPelicanResult())

    const { result } = renderHook(() =>
      useVerificationTools({
        resolveRequest: async () => buildRequest(),
        isSupported: true,
        isBlocked: false,
      }),
    )

    act(() => result.current.runPelican())

    await waitFor(() =>
      expect(result.current.pelicanStatus).toBe(
        VERIFICATION_TOOL_STATUSES.Done,
      ),
    )
    expect(mockRunPelicanTest).toHaveBeenCalledWith(
      expect.objectContaining({
        modelId: "gpt-test",
        abortSignal: expect.anything(),
      }),
    )
    expect(result.current.pelican?.svg).toBe("<svg/>")
  })

  it("passes a non-blank pelican prompt override", async () => {
    mockRunPelicanTest.mockResolvedValue(buildPelicanResult())

    const { result } = renderHook(() =>
      useVerificationTools({
        resolveRequest: async () => buildRequest(),
        isSupported: true,
        isBlocked: false,
        pelicanPrompt: "  draw a cat  ",
      }),
    )

    act(() => result.current.runPelican())

    await waitFor(() =>
      expect(mockRunPelicanTest).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "draw a cat" }),
      ),
    )
  })

  it("uses the custom pelican prompt draft when running the drawing test", async () => {
    mockRunPelicanTest.mockResolvedValue(buildPelicanResult())

    const { result } = renderHook(() =>
      useVerificationTools({
        resolveRequest: async () => buildRequest(),
        isSupported: true,
        isBlocked: false,
      }),
    )

    act(() => {
      result.current.setPromptDraftValue("pelican", "draw a custom pelican")
    })
    act(() => result.current.runPelican())

    await waitFor(() =>
      expect(mockRunPelicanTest).toHaveBeenCalledWith(
        expect.objectContaining({ prompt: "draw a custom pelican" }),
      ),
    )
  })

  it("binds profile history target to the actual model used during pelican test", async () => {
    mockRunPelicanTest.mockResolvedValue(buildPelicanResult())
    mockSaveDrawing.mockImplementation(async (summary) => {
      mockGetDrawing.mockResolvedValue(summary)
    })
    const options = {
      resolveRequest: async () => ({
        ...buildRequest(),
        modelId: "resolved-model",
      }),
      isSupported: true,
      isBlocked: false,
      historyTarget: {
        kind: "profile" as const,
        profileId: "profile-1",
      },
      historyApiType: "openai-compatible" as const,
    }
    const { result } = renderHook(() => useVerificationTools(options))
    act(() => result.current.runPelican())
    await waitFor(() =>
      expect(mockSaveDrawing).toHaveBeenCalledWith(
        expect.objectContaining({
          outcome: DRAWING_VERIFICATION_OUTCOMES.Generated,
          modelId: "resolved-model",
          target: {
            kind: "profile-model",
            profileId: "profile-1",
            modelId: "resolved-model",
          },
        }),
      ),
    )
  })

  it("delegates to an injected runner so a content script can use it", async () => {
    const runPelicanRequest = vi.fn().mockResolvedValue(buildPelicanResult())

    const { result } = renderHook(() =>
      useVerificationTools({
        resolveRequest: async () => buildRequest(),
        isSupported: true,
        isBlocked: false,
        runPelicanRequest,
      }),
    )

    act(() => result.current.runPelican())

    await waitFor(() => expect(runPelicanRequest).toHaveBeenCalledTimes(1))
    expect(mockRunPelicanTest).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(result.current.pelicanStatus).toBe(
        VERIFICATION_TOOL_STATUSES.Done,
      ),
    )
  })

  it("binds a failed drawing summary to the resolved profile model without storing the error", async () => {
    mockRunPelicanTest.mockRejectedValue(new Error("failed for secret-key"))
    const { result } = renderHook(() =>
      useVerificationTools({
        resolveRequest: async () => buildRequest(),
        isSupported: true,
        isBlocked: false,
        historyTarget: { kind: "profile", profileId: "profile-1" },
      }),
    )

    act(() => result.current.runPelican())
    await waitFor(() => expect(mockSaveDrawing).toHaveBeenCalledTimes(1))
    const summary = mockSaveDrawing.mock.calls[0]![0]
    expect(summary).toMatchObject({
      target: {
        kind: "profile-model",
        profileId: "profile-1",
        modelId: "gpt-test",
      },
      apiType: "openai-compatible",
      modelId: "gpt-test",
      outcome: "error",
      steps: 0,
      calls: 0,
      files: 0,
    })
    expect(JSON.stringify(summary)).not.toContain("secret-key")
    expect(result.current.pelicanStatus).toBe(VERIFICATION_TOOL_STATUSES.Error)
    expect(result.current.pelicanErrorMessage).not.toContain("secret-key")
  })

  it("marks a stopped run without an error message", async () => {
    mockRunPelicanTest.mockImplementation(
      ({ abortSignal }: { abortSignal: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          abortSignal.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError")),
          )
        }),
    )

    const { result } = renderHook(() =>
      useVerificationTools({
        resolveRequest: async () => buildRequest(),
        isSupported: true,
        isBlocked: false,
      }),
    )

    act(() => result.current.runPelican())
    await waitFor(() => expect(result.current.isRunning).toBe(true))
    act(() => result.current.stopPelican())

    await waitFor(() =>
      expect(result.current.pelicanStatus).toBe(
        VERIFICATION_TOOL_STATUSES.Stopped,
      ),
    )
    expect(result.current.pelicanErrorMessage).toBeNull()
  })

  it("sanitizes a failure message", async () => {
    mockRunPelicanTest.mockRejectedValue(
      new Error("unauthorized for secret-key"),
    )

    const { result } = renderHook(() =>
      useVerificationTools({
        resolveRequest: async () => buildRequest(),
        isSupported: true,
        isBlocked: false,
      }),
    )

    act(() => result.current.runPelican())

    await waitFor(() =>
      expect(result.current.pelicanStatus).toBe(
        VERIFICATION_TOOL_STATUSES.Error,
      ),
    )
    expect(result.current.pelicanErrorMessage).not.toContain("secret-key")
  })

  it("automatically saves the latest prompt after editing pauses", async () => {
    const { result } = renderHook(() =>
      useVerificationTools({
        resolveRequest: async () => buildRequest(),
        isSupported: true,
        isBlocked: false,
      }),
    )
    act(() => {
      result.current.setPromptDraftValue(
        API_VERIFICATION_PROBE_IDS.TextGeneration,
        "First draft",
      )
      result.current.setPromptDraftValue(
        API_VERIFICATION_PROBE_IDS.TextGeneration,
        "Latest draft",
      )
    })
    expect(mockSaveOverrides).not.toHaveBeenCalled()
    await waitFor(() =>
      expect(mockSaveOverrides).toHaveBeenCalledWith({
        [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Latest draft",
      }),
    )
    expect(mockSaveOverrides).toHaveBeenCalledTimes(1)
    await waitFor(() => expect(result.current.isPromptsDirty).toBe(false))
  })

  it("tracks dirty state and saves normalized overrides", async () => {
    mockSaveOverrides.mockResolvedValue(undefined)

    const { result } = renderHook(() =>
      useVerificationTools({
        resolveRequest: async () => buildRequest(),
        isSupported: true,
        isBlocked: false,
      }),
    )

    act(() =>
      result.current.setPromptDraftValue(
        API_VERIFICATION_PROBE_IDS.TextGeneration,
        "  Say YES  ",
      ),
    )
    expect(result.current.isPromptsDirty).toBe(true)

    act(() => result.current.savePrompts())

    await waitFor(() => expect(result.current.isSavingPrompts).toBe(false))
    expect(mockSaveOverrides).toHaveBeenCalledWith({
      [API_VERIFICATION_PROBE_IDS.TextGeneration]: "  Say YES  ",
    })
    await waitFor(() =>
      expect(result.current.promptDraft).toEqual({
        [API_VERIFICATION_PROBE_IDS.TextGeneration]: "Say YES",
      }),
    )
    expect(result.current.isPromptsDirty).toBe(false)
  })

  it("reports a save failure and keeps the draft", async () => {
    mockSaveOverrides.mockRejectedValue(new Error("storage locked"))

    const { result } = renderHook(() =>
      useVerificationTools({
        resolveRequest: async () => buildRequest(),
        isSupported: true,
        isBlocked: false,
      }),
    )

    act(() =>
      result.current.setPromptDraftValue(
        API_VERIFICATION_PROBE_IDS.TextGeneration,
        "Say YES",
      ),
    )
    act(() => result.current.savePrompts())

    await waitFor(() => expect(result.current.promptSaveError).toBeTruthy())
    // A failed write keeps the un-normalized draft so nothing is lost.
    expect(
      result.current.promptDraft[API_VERIFICATION_PROBE_IDS.TextGeneration],
    ).toBe("Say YES")
    expect(result.current.isPromptsDirty).toBe(true)
  })

  it("resets one prompt or all of them", async () => {
    const { result } = renderHook(() =>
      useVerificationTools({
        resolveRequest: async () => buildRequest(),
        isSupported: true,
        isBlocked: false,
      }),
    )

    await act(async () => {
      result.current.setPromptDraftValue(
        API_VERIFICATION_PROBE_IDS.TextGeneration,
        "A",
      )
      result.current.setPromptDraftValue(
        API_VERIFICATION_PROBE_IDS.Embedding,
        "B",
      )
    })
    act(() => result.current.resetPrompt(API_VERIFICATION_PROBE_IDS.Embedding))

    expect(result.current.promptDraft).toEqual({
      [API_VERIFICATION_PROBE_IDS.TextGeneration]: "A",
    })

    act(() => result.current.resetAllPrompts())
    expect(result.current.promptDraft).toEqual({})
  })
})
