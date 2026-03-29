import { waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { ensureRedemptionToastUi } from "~/entrypoints/content/shared/uiRoot"
import { setupWebAiApiCheckContent } from "~/entrypoints/content/webAiApiCheck"
import {
  API_CHECK_MODAL_CLOSED_EVENT,
  dispatchOpenApiCheckModal,
  waitForApiCheckModalHostReady,
} from "~/entrypoints/content/webAiApiCheck/events"
import { showApiCheckConfirmToast } from "~/entrypoints/content/webAiApiCheck/utils/apiCheckToasts"
import {
  checkPermissionViaMessage,
  sendRuntimeMessage,
} from "~/utils/browser/browserApi"
import {
  buildApiCheckClipboardText,
  buildApiKey,
} from "~~/tests/test-utils/factories"

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: vi.fn(),
    checkPermissionViaMessage: vi.fn(),
  }
})

vi.mock("~/entrypoints/content/webAiApiCheck/utils/apiCheckToasts", () => ({
  showApiCheckConfirmToast: vi.fn(),
}))

vi.mock("~/entrypoints/content/shared/uiRoot", () => ({
  ensureRedemptionToastUi: vi.fn(),
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

describe("setupWebAiApiCheckContent", () => {
  beforeEach(() => {
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

  it("opens modal from auto-detect on copy when whitelisted + confirmed", async () => {
    const apiKey = buildApiKey()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckShouldPrompt) {
        return { success: true, shouldPrompt: true }
      }
      return { success: false }
    })
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

  it("does not open modal when background vetoes shouldPrompt", async () => {
    const apiKey = buildApiKey()
    vi.mocked(sendRuntimeMessage).mockResolvedValue({
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

    await waitFor(() => expect(sendRuntimeMessage).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(showApiCheckConfirmToast).not.toHaveBeenCalled()
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })

  it("reads clipboard on click for copy-like targets and opens modal", async () => {
    const apiKey = buildApiKey()
    vi.mocked(sendRuntimeMessage).mockResolvedValue({
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

  it("ignores events originating from the content UI host element", async () => {
    const apiKey = buildApiKey()
    vi.mocked(sendRuntimeMessage).mockResolvedValue({
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

    expect(sendRuntimeMessage).not.toHaveBeenCalled()
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

  it("does not read clipboard when clipboard permission is denied", async () => {
    vi.useFakeTimers()

    const apiKey = buildApiKey()
    const readText = vi.fn().mockResolvedValue(
      buildApiCheckClipboardText({
        baseUrl: "https://proxy.example.com/api",
        apiKey,
      }),
    )

    vi.mocked(sendRuntimeMessage).mockResolvedValue({
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

  it("suppresses repeat auto-detect prompts during modal-close cooldown", async () => {
    const nowSpy = vi.spyOn(Date, "now")
    const apiKey = buildApiKey()
    vi.mocked(sendRuntimeMessage).mockResolvedValue({
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
          reason: "dismissed",
        },
      }),
    )

    vi.mocked(sendRuntimeMessage).mockResolvedValue({
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

    expect(sendRuntimeMessage).toHaveBeenCalledTimes(1)
    expect(showApiCheckConfirmToast).toHaveBeenCalledTimes(1)
    expect(dispatchOpenApiCheckModal).toHaveBeenCalledTimes(1)

    cleanup()
  })
})
