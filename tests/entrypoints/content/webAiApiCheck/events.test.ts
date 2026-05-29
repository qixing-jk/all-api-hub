// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest"

describe("webAiApiCheck events", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("dispatches the open and closed modal custom events with the provided detail", async () => {
    const {
      API_CHECK_MODAL_CLOSED_EVENT,
      API_CHECK_OPEN_MODAL_EVENT,
      dispatchApiCheckModalClosed,
      dispatchOpenApiCheckModal,
    } = await import("~/entrypoints/content/webAiApiCheck/events")

    const openListener = vi.fn()
    const closedListener = vi.fn()

    window.addEventListener(API_CHECK_OPEN_MODAL_EVENT, openListener as any, {
      once: true,
    })
    window.addEventListener(
      API_CHECK_MODAL_CLOSED_EVENT,
      closedListener as any,
      {
        once: true,
      },
    )

    dispatchOpenApiCheckModal({
      sourceText: "sk-test-abc",
      pageUrl: "https://example.com",
      trigger: "autoDetect",
    })
    dispatchApiCheckModalClosed({
      pageUrl: "https://example.com",
      trigger: "contextMenu",
      reason: "completed",
    })

    expect(openListener).toHaveBeenCalledTimes(1)
    expect((openListener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      sourceText: "sk-test-abc",
      pageUrl: "https://example.com",
      trigger: "autoDetect",
    })

    expect(closedListener).toHaveBeenCalledTimes(1)
    expect((closedListener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      pageUrl: "https://example.com",
      trigger: "contextMenu",
      reason: "completed",
    })
  })

  it("dispatches optional extraction metadata with open modal events", async () => {
    const { API_CHECK_OPEN_MODAL_EVENT, dispatchOpenApiCheckModal } =
      await import("~/entrypoints/content/webAiApiCheck/events")

    const listener = vi.fn()
    window.addEventListener(API_CHECK_OPEN_MODAL_EVENT, listener)

    dispatchOpenApiCheckModal({
      sourceText: "proxy.example.com\ntest-Aa1Bb2Cc3Dd4Ee5Ff6Gg",
      pageUrl: "https://console.example.com",
      trigger: "autoDetect",
      extraction: {
        summary: {
          hasEnhancedBaseUrl: true,
          hasEnhancedApiKey: true,
          hasCleanup: false,
          usesEnhancedResult: true,
          autoPromptEligible: false,
          enhancedAutoPromptEligible: true,
        },
        candidates: {
          baseUrls: [],
          apiKeys: [],
        },
      },
    } as any)

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          extraction: expect.objectContaining({
            summary: expect.objectContaining({ usesEnhancedResult: true }),
          }),
        }),
      }),
    )
  })

  it("resolves host-ready waiters immediately after the host has been marked ready", async () => {
    const { dispatchApiCheckModalHostReady, waitForApiCheckModalHostReady } =
      await import("~/entrypoints/content/webAiApiCheck/events")

    dispatchApiCheckModalHostReady()

    await expect(waitForApiCheckModalHostReady()).resolves.toBeUndefined()
  })

  it("waits for the host-ready event once and also resolves on timeout", async () => {
    vi.useFakeTimers()

    const {
      API_CHECK_MODAL_HOST_READY_EVENT,
      dispatchApiCheckModalHostReady,
      waitForApiCheckModalHostReady,
    } = await import("~/entrypoints/content/webAiApiCheck/events")

    const removeListenerSpy = vi.spyOn(window, "removeEventListener")
    const firstWait = waitForApiCheckModalHostReady({ timeoutMs: 5_000 })

    dispatchApiCheckModalHostReady()

    await expect(firstWait).resolves.toBeUndefined()
    expect(removeListenerSpy).toHaveBeenCalledWith(
      API_CHECK_MODAL_HOST_READY_EVENT,
      expect.any(Function),
    )

    vi.resetModules()

    const freshModule = await import(
      "~/entrypoints/content/webAiApiCheck/events"
    )
    const secondWait = freshModule.waitForApiCheckModalHostReady({
      timeoutMs: 10,
    })

    await vi.advanceTimersByTimeAsync(10)

    await expect(secondWait).resolves.toBeUndefined()

    vi.useRealTimers()
  })
})
