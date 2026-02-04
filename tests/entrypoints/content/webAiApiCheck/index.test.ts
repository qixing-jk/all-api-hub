import { waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { ensureRedemptionToastUi } from "~/entrypoints/content/redemptionAssist/uiRoot"
import { setupWebAiApiCheckContent } from "~/entrypoints/content/webAiApiCheck"
import {
  dispatchOpenApiCheckModal,
  waitForApiCheckModalHostReady,
} from "~/entrypoints/content/webAiApiCheck/events"
import { showApiCheckConfirmToast } from "~/entrypoints/content/webAiApiCheck/utils/apiCheckToasts"
import {
  checkPermissionViaMessage,
  sendRuntimeMessage,
} from "~/utils/browserApi"

vi.mock("~/utils/browserApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/utils/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: vi.fn(),
    checkPermissionViaMessage: vi.fn(),
  }
})

vi.mock("~/entrypoints/content/webAiApiCheck/utils/apiCheckToasts", () => ({
  showApiCheckConfirmToast: vi.fn(),
}))

vi.mock("~/entrypoints/content/redemptionAssist/uiRoot", () => ({
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
 *
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
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckShouldPrompt) {
        return { success: true, shouldPrompt: true }
      }
      return { success: false }
    })
    vi.mocked(showApiCheckConfirmToast).mockResolvedValue(true)

    const cleanup = setupWebAiApiCheckContent()

    document.dispatchEvent(
      makeClipboardEvent(
        "copy",
        "Base URL: https://proxy.example.com/api/v1\nAPI Key: sk-abcdef123456",
      ),
    )

    await waitFor(() =>
      expect(dispatchOpenApiCheckModal).toHaveBeenCalledWith(
        expect.objectContaining({ trigger: "autoDetect" }),
      ),
    )

    cleanup()
  })

  it("does not open modal when background vetoes shouldPrompt", async () => {
    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: true,
      shouldPrompt: false,
    })

    const cleanup = setupWebAiApiCheckContent()

    document.dispatchEvent(
      makeClipboardEvent(
        "copy",
        "Base URL: https://proxy.example.com/api\nAPI Key: sk-abcdef123456",
      ),
    )

    await waitFor(() => expect(sendRuntimeMessage).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(showApiCheckConfirmToast).not.toHaveBeenCalled()
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })

  it("reads clipboard on click for copy-like targets and opens modal", async () => {
    vi.mocked(sendRuntimeMessage).mockResolvedValue({
      success: true,
      shouldPrompt: true,
    })
    vi.mocked(checkPermissionViaMessage).mockResolvedValue(true)
    vi.mocked(showApiCheckConfirmToast).mockResolvedValue(true)

    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText: vi
          .fn()
          .mockResolvedValue(
            "Base URL: https://proxy.example.com/api\nAPI Key: sk-abcdef123456",
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
        "Base URL: https://proxy.example.com/api\nAPI Key: sk-abcdef123456",
      ),
    )

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(sendRuntimeMessage).not.toHaveBeenCalled()
    expect(dispatchOpenApiCheckModal).not.toHaveBeenCalled()

    cleanup()
  })
})
