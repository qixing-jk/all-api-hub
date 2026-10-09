import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useApiCheckProbeRunner } from "~/features/WebAiApiCheck/content/probes/useApiCheckProbeRunner"
import {
  API_VERIFICATION_MODES,
  type ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"

vi.mock(
  "~/services/verification/webAiApiCheck/messaging",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/verification/webAiApiCheck/messaging")
    >()),
    sendWebAiApiCheckMessage: vi.fn(),
  }),
)
vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: () => ({ complete: vi.fn() }),
  resolveProductAnalyticsErrorCategoryFromError: () => "unknown",
}))

function renderProbeRunner() {
  return renderHook(() =>
    useApiCheckProbeRunner({
      t: ((key: string) => key) as never,
      apiType: "openai-compatible",
      verificationMode: API_VERIFICATION_MODES.Streaming,
      trigger: "contextMenu",
      baseUrl: "https://proxy.example.com",
      apiKey: "sk-test-key",
      modelId: "test-model",
      setValidationError: vi.fn(),
      recordBaseUrlHistory: vi.fn(),
    }),
  )
}

describe("API check probe session", () => {
  it("does not dispatch cancellation or change results when stopping an idle probe", () => {
    vi.mocked(sendWebAiApiCheckMessage).mockClear()
    const { result } = renderProbeRunner()
    const probes = result.current.probes
    act(() => result.current.stopProbe("text-generation"))
    expect(sendWebAiApiCheckMessage).not.toHaveBeenCalled()
    expect(result.current.probes).toBe(probes)
    expect(result.current.isAnyProbeRunning).toBe(false)
  })
  it("keeps a new probe running when a reset batch finishes late", async () => {
    const pending: ((value: unknown) => void)[] = []
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      (type) =>
        (type === WebAiApiCheckMessageTypes.RunProbe
          ? new Promise((resolve) => pending.push(resolve))
          : Promise.resolve({ success: true, cancelled: true })) as never,
    )
    const { result } = renderProbeRunner()
    act(() => result.current.runAll())
    act(() => result.current.resetProbeState("openai-compatible"))
    let probe!: ReturnType<typeof result.current.runProbe>
    act(() => {
      probe = result.current.runProbe("text-generation")
    })
    await act(async () => {
      pending[0]!({ success: false, error: "old batch" })
    })
    expect(result.current.isAnyProbeRunning).toBe(true)
    await act(async () => {
      pending[1]!({ success: false, error: "new probe" })
      await probe
    })
    expect(result.current.isAnyProbeRunning).toBe(false)
  })
  it("cancels and ignores a pending result when a new modal session resets the probes", async () => {
    let resolve!: (value: {
      success: true
      result: ApiVerificationProbeResult
    }) => void
    const pending = new Promise<{
      success: true
      result: ApiVerificationProbeResult
    }>((done) => {
      resolve = done
    })
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      (type) =>
        (type === WebAiApiCheckMessageTypes.RunProbe
          ? pending
          : Promise.resolve({ success: true, cancelled: true })) as never,
    )
    const { result } = renderProbeRunner()
    act(() => result.current.runProbe("text-generation"))
    await waitFor(() => expect(result.current.isAnyProbeRunning).toBe(true))
    act(() => result.current.resetProbeState("openai-compatible"))
    await act(async () =>
      resolve({
        success: true,
        result: {
          id: "text-generation",
          status: "pass",
          latencyMs: 0,
          summary: "old result",
          input: {
            apiType: "openai-compatible",
            baseUrl: "https://proxy.example.com",
          },
        },
      }),
    )
    expect(result.current.hasAnyResult).toBe(false)
    expect(result.current.getCurrentVerificationResultsSnapshot()).toBeNull()
    expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
      WebAiApiCheckMessageTypes.CancelRunProbe,
      { runId: expect.any(String) },
    )
  })
  it("cancels a superseded single probe and keeps the newer result", async () => {
    const pending: {
      resolve: (value: unknown) => void
      promise: Promise<unknown>
    }[] = []
    for (let i = 0; i < 2; i += 1) {
      let resolve!: (value: unknown) => void
      const promise = new Promise((done) => {
        resolve = done
      })
      pending.push({ resolve, promise })
    }
    let dispatched = 0
    vi.mocked(sendWebAiApiCheckMessage)
      .mockClear()
      .mockImplementation(
        (type) =>
          (type === WebAiApiCheckMessageTypes.RunProbe
            ? pending[dispatched++]!.promise
            : Promise.resolve({ success: true, cancelled: true })) as never,
      )
    const { result } = renderProbeRunner()
    act(() => result.current.runProbe("text-generation"))
    act(() => result.current.runProbe("text-generation"))
    await act(async () => {
      pending.forEach((deferred, index) =>
        deferred.resolve({
          success: true,
          result: {
            id: "text-generation",
            status: "pass",
            latencyMs: 0,
            summary: index === 0 ? "old" : "new",
            input: {
              apiType: "openai-compatible",
              baseUrl: "https://proxy.example.com",
            },
          },
        }),
      )
    })
    expect(
      result.current.probes.find((probe) => probe.id === "text-generation")
        ?.result?.summary,
    ).toBe("new")
    expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
      WebAiApiCheckMessageTypes.CancelRunProbe,
      { runId: expect.any(String) },
    )
  })
})
