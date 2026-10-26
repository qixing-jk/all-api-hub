import "./apiCheckModalHostMocks"

import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { useApiCheckModalViewModel } from "~/features/WebAiApiCheck/content/modal/useApiCheckModalViewModel"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { createDeferred } from "~~/tests/test-utils/deferred"

import { setupApiCheckModalHostTest } from "./apiCheckModalHostTestSupport"

describe("content drawing message boundary", () => {
  setupApiCheckModalHostTest()

  it("stops locally and ignores a late drawing when the cancel message fails", async () => {
    const pending = createDeferred<any>()
    const previous = vi
      .mocked(sendWebAiApiCheckMessage)
      .getMockImplementation()!
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.RunPelican)
          return pending.promise
        if (type === WebAiApiCheckMessageTypes.CancelRunProbe)
          throw new Error("Background unavailable")
        return previous(type, message)
      },
    )
    const { result } = renderHook(() => useApiCheckModalViewModel())
    act(() => {
      result.current.actions.updateBaseUrl("https://drawing.example.com")
      result.current.actions.setApiKey("drawing-secret")
      result.current.actions.setModelId("gpt-test")
    })
    act(() => result.current.view.verificationTools.runPelican())
    await waitFor(() =>
      expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
        WebAiApiCheckMessageTypes.RunPelican,
        expect.anything(),
      ),
    )
    act(() => result.current.view.verificationTools.stopPelican())
    await act(async () => {
      pending.resolve({ success: true, result: { svg: "late drawing" } })
    })
    expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
      WebAiApiCheckMessageTypes.CancelRunProbe,
      expect.objectContaining({ runId: expect.any(String) }),
    )
    expect(result.current.view.verificationTools.isRunning).toBe(false)
    expect(result.current.view.verificationTools.pelican).toBeNull()
  })

  it.each([true, false])(
    "handles background drawing success=%j",
    async (success) => {
      const drawing = {
        runAt: 1,
        latencyMs: 2,
        text: "No drawing produced",
        svg: null,
      }
      const previous = vi
        .mocked(sendWebAiApiCheckMessage)
        .getMockImplementation()!
      vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
        async (type: any, message: any) => {
          if (type === WebAiApiCheckMessageTypes.RunPelican) {
            return success
              ? { success: true, result: drawing }
              : { success: false, error: "Drawing service unavailable" }
          }
          return previous(type, message)
        },
      )
      const { result } = renderHook(() => useApiCheckModalViewModel())
      act(() => {
        result.current.actions.updateBaseUrl("https://drawing.example.com")
        result.current.actions.setApiKey("drawing-secret")
        result.current.actions.setModelId("gpt-test")
      })
      await waitFor(() =>
        expect(result.current.view.verificationTools.canRunPelican).toBe(true),
      )
      act(() => result.current.view.verificationTools.runPelican())
      await waitFor(() =>
        expect(result.current.view.verificationTools.isRunning).toBe(false),
      )
      expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
        WebAiApiCheckMessageTypes.RunPelican,
        expect.objectContaining({
          baseUrl: "https://drawing.example.com",
          apiKey: "drawing-secret",
          modelId: "gpt-test",
        }),
      )
      if (success) {
        expect(result.current.view.verificationTools.pelican).toEqual(drawing)
      } else {
        expect(
          result.current.view.verificationTools.pelicanErrorMessage,
        ).toContain("Drawing service unavailable")
        expect(result.current.view.verificationTools.pelican).toBeNull()
      }
    },
  )
})
