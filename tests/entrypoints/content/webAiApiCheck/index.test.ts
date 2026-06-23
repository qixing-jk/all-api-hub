import { waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { ensureRedemptionToastUi } from "~/entrypoints/content/shared/uiRoot"
import { setupWebAiApiCheckContent } from "~/entrypoints/content/webAiApiCheck"
import {
  API_CHECK_MODAL_CLOSE_REASONS,
  API_CHECK_MODAL_CLOSED_EVENT,
  dispatchOpenApiCheckModal,
  waitForApiCheckModalHostReady,
} from "~/entrypoints/content/webAiApiCheck/events"
import { showApiCheckConfirmToast } from "~/entrypoints/content/webAiApiCheck/utils/apiCheckToasts"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { checkPermissionViaMessage } from "~/utils/browser/browserApi"
import {
  buildApiCheckClipboardText,
  buildApiKey,
} from "~~/tests/test-utils/factories"

const { logger } = vi.hoisted(() => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    checkPermissionViaMessage: vi.fn(),
  }
})

vi.mock("~/services/verification/webAiApiCheck/messaging", () => ({
  WebAiApiCheckMessageTypes: {
    ShouldPrompt: "webAiApiCheck:shouldPrompt",
    FetchModels: "webAiApiCheck:fetchModels",
    RunProbe: "webAiApiCheck:runProbe",
    SaveProfile: "webAiApiCheck:saveProfile",
  },
  sendWebAiApiCheckMessage: vi.fn(),
}))

vi.mock("~/entrypoints/content/webAiApiCheck/utils/apiCheckToasts", () => ({
  showApiCheckConfirmToast: vi.fn(),
}))

vi.mock("~/entrypoints/content/shared/uiRoot", () => ({
  ensureRedemptionToastUi: vi.fn(),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => logger),
}))

vi.mock(
  "~/entrypoints/content/webAiApiCheck/events",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/entrypoints/content/webAiApiCheck/events")
      >()
    return {
      ...actual,
      dispatchOpenApiCheckModal: vi.fn(),
      waitForApiCheckModalHostReady: vi.fn().mockResolvedValue(undefined),
    }
  },
)

/**
 * Creates a clipboard event for tests.
 */
function makeClipboardEvent(type: "copy" | "cut", clipboardText: string) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as any
  event.clipboardData = {
    getData: (format: string) => (format === "text" ? clipboardText : ""),
  }
  return event as ClipboardEvent
}

async function flushMicrotasks(iterations = 4) {
  for (let index = 0; index < iterations; index += 1) {
    await Promise.resolve()
  }
}

describe("setupWebAiApiCheckContent", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    document.body.innerHTML = ""
    ;(globalThis as any).browser = {
      runtime: {
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(),
        },
      },
    }

    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => "",
    } as any)

    vi.mocked(ensureRedemptionToastUi).mockResolvedValue(undefined)
    vi.mocked(waitForApiCheckModalHostReady).mockResolvedValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("ignores unrelated runtime messages in the context-menu listener", async () => {
    const addListener = vi.fn()
    const removeListener = vi.fn()
    ;(globalThis as any).browser = {
      runtime: {
        onMessage: {
          addListener,
          removeListener,
        },
      },
    }

    const cleanup = setupWebAiApiCheckContent({ enableDetection: false })

    const listener = addListener.mock.calls[0]?.[0]
    expect(listener).toEqual(expect.any(Function))

    await listener({
      action: "unrelated-action",
      selectionText: buildApiCheckClipboardText({ apiKey: buildApiKey() }),
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
    expect(removeListener).toHaveBeenCalledWith(listener)
  })

  it("logs debug when removing the context-menu listener fails", () => {
    const addListener = vi.fn()
    const removeListenerError = new Error("remove failed")
    const removeListener = vi.fn(() => {
      throw removeListenerError
    })
    ;(globalThis as any).browser = {
      runtime: {
        onMessage: {
          addListener,
          removeListener,
        },
      },
    }

    const cleanup = setupWebAiApiCheckContent({ enableDetection: false })

    expect(() => cleanup()).not.toThrow()
    expect(logger.debug).toHaveBeenCalledWith(
      "Failed to remove ApiCheck context menu listener",
      removeListenerError,
    )
  })

  it("opens modal from auto-detect on copy when whitelisted + confirmed", async () => {
    const apiKey = buildApiKey()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.ShouldPrompt) {
          return { success: true, shouldPrompt: true }
        }
        return { success: false }
      },
    )
    vi.mocked(showApiCheckConfirmToast).mockResolvedValue(true)

    const cleanup = setupWebAiApiCheckContent()

    document.dispatchEvent(
      makeClipboardEvent("copy", buildApiCheckClipboardText({ apiKey })),
    )

    await waitFor(() =>
      expect(dispatchOpenApiCheckModal).toHaveBeenCalledWith(
        expect.objectContaining({ trigger: "autoDetect" }),
      ),
    )

    cleanup()
  })

  it("opens auto-detect for enhanced matches when enhanced auto-detect is enabled", async () => {
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.ShouldPrompt) {
          return {
            success: true,
            shouldPrompt: true,
            enhancedShouldPrompt: true,
          }
        }
        return { success: false }
      },
    )
    vi.mocked(showApiCheckConfirmToast).mockResolvedValue(true)

    const cleanup = setupWebAiApiCheckContent()

    document.dispatchEvent(
      makeClipboardEvent(
        "copy",
        [
          "proxy.example.com/api/v1/chat/completions",
          "test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
        ].join("\n"),
      ),
    )

    await waitFor(() =>
      expect(dispatchOpenApiCheckModal).toHaveBeenCalledWith(
        expect.objectContaining({
          trigger: "autoDetect",
          extraction: expect.objectContaining({
            summary: expect.objectContaining({
              usesEnhancedResult: true,
            }),
          }),
        }),
      ),
    )
    expect(showApiCheckConfirmToast).toHaveBeenCalledWith({
      usesEnhancedResult: true,
    })

    cleanup()
  })

  it("opens auto-detect for selected text on pointerup and stops after cleanup", async () => {
    const selectedText = buildApiCheckClipboardText({
      baseUrl: "https://proxy.example.com/api",
      apiKey: buildApiKey(),
    })
    const getSelectionSpy = vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => selectedText,
    } as any)

    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.ShouldPrompt) {
          return {
            success: true,
            shouldPrompt: true,
            enhancedShouldPrompt: false,
          }
        }
        return { success: false }
      },
    )
    vi.mocked(showApiCheckConfirmToast).mockResolvedValue(true)

    const cleanup = setupWebAiApiCheckContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    document.dispatchEvent(new Event("pointerup", { bubbles: true }))

    await waitFor(() =>
      expect(dispatchOpenApiCheckModal).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceText: selectedText,
          trigger: "autoDetect",
        }),
      ),
    )

    expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
      WebAiApiCheckMessageTypes.ShouldPrompt,
      { pageUrl: window.location.href },
    )
    expect(showApiCheckConfirmToast).toHaveBeenCalledWith({
      usesEnhancedResult: false,
    })

    cleanup()
    vi.mocked(sendWebAiApiCheckMessage).mockClear()
    vi.mocked(showApiCheckConfirmToast).mockClear()
    vi.mocked(dispatchOpenApiCheckModal).mockClear()
    getSelectionSpy.mockReturnValue({
      toString: () =>
        buildApiCheckClipboardText({
          baseUrl: "https://proxy.example.com/api",
          apiKey: buildApiKey(),
        }),
    } as any)

    document.dispatchEvent(new Event("pointerup", { bubbles: true }))
    await flushMicrotasks()

    expect(sendWebAiApiCheckMessage).not.toHaveBeenCalled()
    expect(showApiCheckConfirmToast).not.toHaveBeenCalled()
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()
  })

  it("does not prompt for enhanced-only matches when enhanced auto-detect is disabled", async () => {
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.ShouldPrompt) {
          return {
            success: true,
            shouldPrompt: true,
            enhancedShouldPrompt: false,
          }
        }
        return { success: false }
      },
    )

    const cleanup = setupWebAiApiCheckContent()

    document.dispatchEvent(
      makeClipboardEvent(
        "copy",
        [
          "proxy.example.com/api/v1/chat/completions",
          "test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
        ].join("\n"),
      ),
    )

    await waitFor(() => expect(sendWebAiApiCheckMessage).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(showApiCheckConfirmToast).not.toHaveBeenCalled()
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })

  it("does not auto-prompt for manual-only unseparated long keys", async () => {
    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      shouldPrompt: true,
      enhancedShouldPrompt: true,
    })

    const cleanup = setupWebAiApiCheckContent()

    document.dispatchEvent(
      makeClipboardEvent(
        "copy",
        [
          "https://proxy.example.com/api",
          "TESTKEYAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
        ].join("\n"),
      ),
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(showApiCheckConfirmToast).not.toHaveBeenCalled()
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })

  it("does not open modal when the auto-detect confirmation toast is dismissed", async () => {
    const apiKey = buildApiKey()
    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      shouldPrompt: true,
    })
    vi.mocked(showApiCheckConfirmToast).mockResolvedValue(false)

    const cleanup = setupWebAiApiCheckContent()

    document.dispatchEvent(
      makeClipboardEvent("copy", buildApiCheckClipboardText({ apiKey })),
    )

    await waitFor(() => expect(showApiCheckConfirmToast).toHaveBeenCalled())

    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })

  it("does not open modal when background vetoes shouldPrompt", async () => {
    const apiKey = buildApiKey()
    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      shouldPrompt: false,
    })

    const cleanup = setupWebAiApiCheckContent()

    document.dispatchEvent(
      makeClipboardEvent(
        "copy",
        buildApiCheckClipboardText({
          baseUrl: "https://proxy.example.com/api",
          apiKey,
        }),
      ),
    )

    await waitFor(() => expect(sendWebAiApiCheckMessage).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(showApiCheckConfirmToast).not.toHaveBeenCalled()
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })

  it("logs warn and skips auto-detect when shouldPrompt lookup fails", async () => {
    const lookupError = new Error("storage unavailable")
    vi.mocked(sendWebAiApiCheckMessage).mockRejectedValue(lookupError)

    const cleanup = setupWebAiApiCheckContent()

    document.dispatchEvent(
      makeClipboardEvent(
        "copy",
        buildApiCheckClipboardText({
          baseUrl: "https://proxy.example.com/api",
          apiKey: buildApiKey(),
        }),
      ),
    )

    await waitFor(() =>
      expect(logger.warn).toHaveBeenCalledWith(
        "Failed to read ApiCheck shouldPrompt state",
        lookupError,
      ),
    )

    expect(showApiCheckConfirmToast).not.toHaveBeenCalled()
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })

  it("reads clipboard on click for copy-like targets and opens modal", async () => {
    const apiKey = buildApiKey()
    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      shouldPrompt: true,
    })
    vi.mocked(checkPermissionViaMessage).mockResolvedValue(true)
    vi.mocked(showApiCheckConfirmToast).mockResolvedValue(true)

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: vi.fn().mockResolvedValue(
          buildApiCheckClipboardText({
            baseUrl: "https://proxy.example.com/api",
            apiKey,
          }),
        ),
      },
    })

    const button = document.createElement("button")
    button.textContent = "Copy"
    document.body.appendChild(button)

    const cleanup = setupWebAiApiCheckContent()

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    await waitFor(
      () =>
        expect(dispatchOpenApiCheckModal).toHaveBeenCalledWith(
          expect.objectContaining({ trigger: "autoDetect" }),
        ),
      { timeout: 2500 },
    )

    cleanup()
  })

  it("prefers selected text over clipboard reads on click", async () => {
    vi.useFakeTimers()

    const selectedText = buildApiCheckClipboardText({
      baseUrl: "https://proxy.example.com/api",
      apiKey: buildApiKey(),
    })
    const readText = vi.fn().mockResolvedValue("should not be used")

    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => selectedText,
    } as any)
    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      shouldPrompt: true,
    })
    vi.mocked(showApiCheckConfirmToast).mockResolvedValue(true)

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText,
      },
    })

    const button = document.createElement("button")
    button.textContent = "Copy"
    document.body.appendChild(button)

    const cleanup = setupWebAiApiCheckContent()

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    await vi.advanceTimersByTimeAsync(500)
    await flushMicrotasks()

    expect(dispatchOpenApiCheckModal).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceText: selectedText,
        trigger: "autoDetect",
      }),
    )

    expect(checkPermissionViaMessage).not.toHaveBeenCalled()
    expect(readText).not.toHaveBeenCalled()

    cleanup()
  })

  it("ignores events originating from the content UI host element", async () => {
    const apiKey = buildApiKey()
    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      shouldPrompt: true,
    })

    const cleanup = setupWebAiApiCheckContent()

    const host = document.createElement("all-api-hub-redemption-toast")
    const innerButton = document.createElement("button")
    innerButton.textContent = "Copy"
    host.appendChild(innerButton)
    document.body.appendChild(host)

    innerButton.dispatchEvent(
      makeClipboardEvent(
        "copy",
        buildApiCheckClipboardText({
          baseUrl: "https://proxy.example.com/api",
          apiKey,
        }),
      ),
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(sendWebAiApiCheckMessage).not.toHaveBeenCalled()
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })

  it("ignores clicks originating from the content UI host element", async () => {
    vi.useFakeTimers()

    const readText = vi.fn().mockResolvedValue(
      buildApiCheckClipboardText({
        baseUrl: "https://proxy.example.com/api",
        apiKey: buildApiKey(),
      }),
    )

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText,
      },
    })

    const host = document.createElement("all-api-hub-redemption-toast")
    const innerButton = document.createElement("button")
    innerButton.textContent = "Copy"
    host.appendChild(innerButton)
    document.body.appendChild(host)

    const cleanup = setupWebAiApiCheckContent()

    innerButton.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    await vi.advanceTimersByTimeAsync(500)
    await flushMicrotasks()

    expect(sendWebAiApiCheckMessage).not.toHaveBeenCalled()
    expect(checkPermissionViaMessage).not.toHaveBeenCalled()
    expect(readText).not.toHaveBeenCalled()
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })

  it("ignores clicks that cannot read clipboard text", async () => {
    vi.useFakeTimers()

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    })

    const button = document.createElement("button")
    button.textContent = "Copy"
    document.body.appendChild(button)

    const cleanup = setupWebAiApiCheckContent()

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    await vi.advanceTimersByTimeAsync(500)
    await flushMicrotasks()

    expect(sendWebAiApiCheckMessage).not.toHaveBeenCalled()
    expect(checkPermissionViaMessage).not.toHaveBeenCalled()
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })

  it("does not request clipboard permission when click prompt state is vetoed", async () => {
    vi.useFakeTimers()

    const readText = vi.fn()
    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      shouldPrompt: false,
      enhancedShouldPrompt: false,
    })

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText,
      },
    })

    const button = document.createElement("button")
    button.textContent = "Copy"
    document.body.appendChild(button)

    const cleanup = setupWebAiApiCheckContent()

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    await vi.advanceTimersByTimeAsync(500)
    await flushMicrotasks()

    expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
      WebAiApiCheckMessageTypes.ShouldPrompt,
      { pageUrl: window.location.href },
    )
    expect(checkPermissionViaMessage).not.toHaveBeenCalled()
    expect(readText).not.toHaveBeenCalled()
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })

  it("opens modal from context-menu listener and removes listener on cleanup", async () => {
    const addListener = vi.fn()
    const removeListener = vi.fn()
    ;(globalThis as any).browser = {
      runtime: {
        onMessage: {
          addListener,
          removeListener,
        },
      },
    }

    const cleanup = setupWebAiApiCheckContent({ enableDetection: false })

    const listener = addListener.mock.calls[0]?.[0]
    expect(listener).toEqual(expect.any(Function))

    await listener({
      action: RuntimeActionIds.ApiCheckContextMenuTrigger,
      selectionText: "",
    })

    await waitFor(() =>
      expect(dispatchOpenApiCheckModal).toHaveBeenCalledWith({
        sourceText: "",
        pageUrl: window.location.href,
        trigger: "contextMenu",
      }),
    )

    cleanup()

    expect(removeListener).toHaveBeenCalledWith(listener)
  })

  it("logs warn and does not open modal when clipboard reads fail", async () => {
    vi.useFakeTimers()

    const clipboardError = new Error("clipboard read blocked")
    const readText = vi.fn().mockRejectedValue(clipboardError)

    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      shouldPrompt: true,
    })
    vi.mocked(checkPermissionViaMessage).mockResolvedValue(true)

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText,
      },
    })

    const button = document.createElement("button")
    button.textContent = "Copy"
    document.body.appendChild(button)

    const cleanup = setupWebAiApiCheckContent()

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    await vi.advanceTimersByTimeAsync(500)
    await flushMicrotasks()

    expect(logger.warn).toHaveBeenCalledWith(
      "Clipboard read failed",
      clipboardError,
    )

    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })

  it("does not read clipboard when clipboard permission is denied", async () => {
    vi.useFakeTimers()

    const apiKey = buildApiKey()
    const readText = vi.fn().mockResolvedValue(
      buildApiCheckClipboardText({
        baseUrl: "https://proxy.example.com/api",
        apiKey,
      }),
    )

    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      shouldPrompt: true,
    })
    vi.mocked(checkPermissionViaMessage).mockResolvedValue(false)

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText,
      },
    })

    const button = document.createElement("button")
    button.textContent = "Copy"
    document.body.appendChild(button)

    const cleanup = setupWebAiApiCheckContent()

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    await vi.advanceTimersByTimeAsync(500)

    expect(checkPermissionViaMessage).toHaveBeenCalledWith({
      permissions: ["clipboardRead"],
    })
    expect(readText).not.toHaveBeenCalled()
    expect(showApiCheckConfirmToast).not.toHaveBeenCalled()
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })

  it("deduplicates repeated identical clipboard scans within the scan interval", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"))

    const clipboardText = buildApiCheckClipboardText({
      baseUrl: "https://proxy.example.com/api",
      apiKey: buildApiKey(),
    })

    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      shouldPrompt: false,
    })

    const cleanup = setupWebAiApiCheckContent()

    document.dispatchEvent(makeClipboardEvent("copy", clipboardText))
    await flushMicrotasks()
    expect(sendWebAiApiCheckMessage).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date("2025-01-01T00:00:00.500Z"))
    document.dispatchEvent(makeClipboardEvent("copy", clipboardText))
    await flushMicrotasks()
    expect(sendWebAiApiCheckMessage).toHaveBeenCalledTimes(1)

    expect(showApiCheckConfirmToast).not.toHaveBeenCalled()
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })

  it("allows retrying after a modal-open failure once cooldown has passed", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2025-01-01T00:00:00.000Z"))

    const openError = new Error("host mount failed")

    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      shouldPrompt: true,
    })
    vi.mocked(showApiCheckConfirmToast).mockResolvedValue(true)
    vi.mocked(ensureRedemptionToastUi).mockRejectedValueOnce(openError)

    const cleanup = setupWebAiApiCheckContent()

    document.dispatchEvent(
      makeClipboardEvent(
        "copy",
        buildApiCheckClipboardText({
          baseUrl: "https://proxy.example.com/api",
          apiKey: buildApiKey(),
        }),
      ),
    )

    await flushMicrotasks()
    expect(logger.warn).toHaveBeenCalledWith(
      "Auto-detect flow failed",
      openError,
    )
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    vi.setSystemTime(new Date("2025-01-01T00:00:03.000Z"))
    document.dispatchEvent(
      makeClipboardEvent(
        "copy",
        buildApiCheckClipboardText({
          baseUrl: "https://proxy.example.com/api",
          apiKey: buildApiKey(),
        }),
      ),
    )

    await flushMicrotasks()
    expect(dispatchOpenApiCheckModal).toHaveBeenCalledWith(
      expect.objectContaining({ trigger: "autoDetect" }),
    )

    cleanup()
  })

  it("suppresses repeat auto-detect prompts during modal-close cooldown", async () => {
    const nowSpy = vi.spyOn(Date, "now")
    const apiKey = buildApiKey()
    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      shouldPrompt: true,
    })
    vi.mocked(showApiCheckConfirmToast).mockResolvedValue(true)
    nowSpy.mockReturnValue(10_000)

    const cleanup = setupWebAiApiCheckContent()

    document.dispatchEvent(
      makeClipboardEvent("copy", buildApiCheckClipboardText({ apiKey })),
    )

    await waitFor(() =>
      expect(dispatchOpenApiCheckModal).toHaveBeenCalledTimes(1),
    )

    window.dispatchEvent(
      new CustomEvent(API_CHECK_MODAL_CLOSED_EVENT, {
        detail: {
          pageUrl: window.location.href,
          trigger: "autoDetect",
          reason: API_CHECK_MODAL_CLOSE_REASONS.Dismissed,
        },
      }),
    )

    vi.mocked(sendWebAiApiCheckMessage).mockResolvedValue({
      success: true,
      shouldPrompt: true,
    })
    vi.mocked(showApiCheckConfirmToast).mockResolvedValue(true)
    nowSpy.mockReturnValue(11_500)

    document.dispatchEvent(
      makeClipboardEvent(
        "copy",
        buildApiCheckClipboardText({
          baseUrl: "https://proxy.example.com/api",
          apiKey: buildApiKey(),
        }),
      ),
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(sendWebAiApiCheckMessage).toHaveBeenCalledTimes(1)
    expect(showApiCheckConfirmToast).toHaveBeenCalledTimes(1)
    expect(dispatchOpenApiCheckModal).toHaveBeenCalledTimes(1)

    cleanup()
  })
})
