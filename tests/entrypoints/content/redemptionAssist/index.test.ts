import { waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

const {
  mockCheckPermissionViaMessage,
  mockSendRuntimeMessage,
  mockDismissToast,
  mockShowAccountSelectToast,
  mockShowRedeemBatchResultToast,
  mockShowRedeemLoadingToast,
  mockShowRedeemResultToast,
  mockShowRedemptionPromptToast,
  mockTrackProductAnalyticsActionCompleted,
  logger,
} = vi.hoisted(() => ({
  mockCheckPermissionViaMessage: vi.fn(),
  mockSendRuntimeMessage: vi.fn(),
  mockDismissToast: vi.fn(),
  mockShowAccountSelectToast: vi.fn(),
  mockShowRedeemBatchResultToast: vi.fn(),
  mockShowRedeemLoadingToast: vi.fn(),
  mockShowRedeemResultToast: vi.fn(),
  mockShowRedemptionPromptToast: vi.fn(),
  mockTrackProductAnalyticsActionCompleted: vi.fn(),
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: (...args: unknown[]) =>
    mockTrackProductAnalyticsActionCompleted(...args),
}))

vi.mock("~/utils/browser/browserApi", () => ({
  checkPermissionViaMessage: mockCheckPermissionViaMessage,
  sendRuntimeMessage: mockSendRuntimeMessage,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => logger),
}))

vi.mock("~/utils/i18n/core", () => ({
  t: vi.fn((key: string) => key),
}))

vi.mock(
  "~/entrypoints/content/redemptionAssist/utils/redemptionToasts",
  () => ({
    dismissToast: mockDismissToast,
    showAccountSelectToast: mockShowAccountSelectToast,
    showRedeemBatchResultToast: mockShowRedeemBatchResultToast,
    showRedeemLoadingToast: mockShowRedeemLoadingToast,
    showRedeemResultToast: mockShowRedeemResultToast,
    showRedemptionPromptToast: mockShowRedemptionPromptToast,
  }),
)

function makeClipboardEvent(type: "copy" | "cut", clipboardText: string) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as any
  event.clipboardData = {
    getData: (format: string) => (format === "text" ? clipboardText : ""),
  }
  return event as ClipboardEvent
}

const codeA = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
const codeB = "b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6"

describe("setupRedemptionAssistContent", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    document.body.innerHTML = ""

    window.history.replaceState({}, "", "/redeem")
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

    mockShowRedeemLoadingToast.mockResolvedValue("loading-toast-id")
    mockShowRedeemResultToast.mockResolvedValue(undefined)
    mockShowRedeemBatchResultToast.mockResolvedValue("batch-toast-id")
    mockShowRedemptionPromptToast.mockResolvedValue({
      action: "auto",
      selectedCodes: [codeA],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it("ignores unrelated runtime messages in the context-menu listener", async () => {
    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })

    const addListener = globalThis.browser.runtime.onMessage
      .addListener as ReturnType<typeof vi.fn>
    const removeListener = globalThis.browser.runtime.onMessage
      .removeListener as ReturnType<typeof vi.fn>
    const listener = addListener.mock.calls[0]?.[0]

    await listener({
      action: "unrelated-action",
      selectionText: codeA,
      pageUrl: "https://example.com/redeem",
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
    expect(mockShowRedeemResultToast).not.toHaveBeenCalled()

    cleanup()

    expect(removeListener).toHaveBeenCalledWith(listener)
  })

  it("logs debug when removing the context-menu listener fails", async () => {
    const removeListenerError = new Error("remove failed")
    ;(globalThis as any).browser = {
      runtime: {
        onMessage: {
          addListener: vi.fn(),
          removeListener: vi.fn(() => {
            throw removeListenerError
          }),
        },
      },
    }

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })

    expect(() => cleanup()).not.toThrow()
    expect(logger.debug).toHaveBeenCalledWith(
      "Failed to remove redemption context menu listener",
      removeListenerError,
    )
  })

  it("deduplicates repeated clipboard scans and auto-redeems a single selected code", async () => {
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.RedemptionAssistShouldPrompt) {
        return {
          success: true,
          promptableCodes: [codeA],
        }
      }

      if (message.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: "redeemed",
          },
        }
      }

      return { success: false }
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    document.dispatchEvent(makeClipboardEvent("copy", codeA))
    document.dispatchEvent(makeClipboardEvent("copy", codeA))

    await waitFor(() => {
      expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.RedemptionAssistShouldPrompt,
        url: window.location.href,
        codes: [codeA],
      })
    })

    expect(
      mockSendRuntimeMessage.mock.calls.filter(
        ([message]) =>
          message?.action === RuntimeActionIds.RedemptionAssistShouldPrompt,
      ),
    ).toHaveLength(1)
    expect(
      mockSendRuntimeMessage.mock.calls.filter(
        ([message]) =>
          message?.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl,
      ),
    ).toHaveLength(1)
    expect(mockShowRedemptionPromptToast).toHaveBeenCalledTimes(1)
    expect(mockShowRedeemLoadingToast).toHaveBeenCalledWith(
      "redemptionAssist:messages.redeemLoading",
    )
    expect(mockShowRedeemResultToast).toHaveBeenCalledWith(true, "redeemed")
    expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()
    expect(mockDismissToast).toHaveBeenCalledWith("loading-toast-id")
    expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ConfirmRedemptionPrompt,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        itemCount: 1,
        selectedCount: 1,
        successCount: 1,
        failureCount: 0,
      },
    })

    cleanup()
  })

  it("prefers selected text over clipboard reads on click", async () => {
    const readText = vi.fn().mockResolvedValue(codeB)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText,
      },
    })

    vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => codeA,
    } as any)

    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.RedemptionAssistShouldPrompt) {
        return {
          success: true,
          promptableCodes: [codeA],
        }
      }

      if (message.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: "redeemed-from-selection",
          },
        }
      }

      return { success: false }
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    const button = document.createElement("button")
    button.textContent = `Copy ${codeB}`
    button.setAttribute("aria-label", "Copy code")
    document.body.appendChild(button)

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    await waitFor(
      () => {
        expect(mockShowRedeemResultToast).toHaveBeenCalledWith(
          true,
          "redeemed-from-selection",
        )
      },
      { timeout: 2500 },
    )

    expect(mockCheckPermissionViaMessage).not.toHaveBeenCalled()
    expect(readText).not.toHaveBeenCalled()
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistShouldPrompt,
      url: window.location.href,
      codes: [codeA],
    })
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistAutoRedeemByUrl,
      url: window.location.href,
      code: codeA,
    })

    cleanup()
  })

  it("falls back to clicked element text when clipboard permission is unavailable", async () => {
    const readText = vi.fn().mockResolvedValue("clipboard should not be read")
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText,
      },
    })

    mockCheckPermissionViaMessage.mockResolvedValue(false)
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.RedemptionAssistShouldPrompt) {
        return {
          success: true,
          promptableCodes: [codeA],
        }
      }

      if (message.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: "redeemed-from-target-text",
          },
        }
      }

      return { success: false }
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    const button = document.createElement("button")
    button.textContent = `Copy ${codeA}`
    button.setAttribute("aria-label", "Copy code")
    document.body.appendChild(button)

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    await waitFor(
      () => {
        expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
          action: RuntimeActionIds.RedemptionAssistShouldPrompt,
          url: window.location.href,
          codes: [codeA],
        })
      },
      { timeout: 2500 },
    )

    expect(mockCheckPermissionViaMessage).toHaveBeenCalledWith({
      permissions: ["clipboardRead"],
    })
    expect(readText).not.toHaveBeenCalled()
    expect(mockShowRedeemResultToast).toHaveBeenCalledWith(
      true,
      "redeemed-from-target-text",
    )

    cleanup()
  })

  it("logs clipboard read failures and falls back to clicked element text", async () => {
    const clipboardError = new Error("clipboard blocked")
    const readText = vi.fn().mockRejectedValue(clipboardError)
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        readText,
      },
    })

    mockCheckPermissionViaMessage.mockResolvedValue(true)
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.RedemptionAssistShouldPrompt) {
        return {
          success: true,
          promptableCodes: [codeA],
        }
      }

      if (message.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: "redeemed-after-read-failure",
          },
        }
      }

      return { success: false }
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    const button = document.createElement("button")
    button.textContent = `Copy ${codeA}`
    button.setAttribute("aria-label", "Copy code")
    document.body.appendChild(button)

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    await waitFor(
      () => {
        expect(logger.warn).toHaveBeenCalledWith(
          "Clipboard read failed",
          clipboardError,
        )
      },
      { timeout: 2500 },
    )

    expect(readText).toHaveBeenCalledTimes(1)
    expect(mockCheckPermissionViaMessage).toHaveBeenCalledWith({
      permissions: ["clipboardRead"],
    })
    expect(mockShowRedeemResultToast).toHaveBeenCalledWith(
      true,
      "redeemed-after-read-failure",
    )

    cleanup()
  })

  it("does not show prompts or redeem when the background vetoes promptable codes", async () => {
    mockSendRuntimeMessage.mockResolvedValue({
      success: true,
      promptableCodes: [],
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    document.dispatchEvent(makeClipboardEvent("copy", codeA))

    await waitFor(() => {
      expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.RedemptionAssistShouldPrompt,
        url: window.location.href,
        codes: [codeA],
      })
    })

    expect(mockShowRedemptionPromptToast).not.toHaveBeenCalled()
    expect(mockShowRedeemLoadingToast).not.toHaveBeenCalled()
    expect(
      mockSendRuntimeMessage.mock.calls.filter(
        ([message]) =>
          message?.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl,
      ),
    ).toHaveLength(0)

    cleanup()
  })

  it("logs an error when detected redemption scanning fails", async () => {
    const backgroundError = new Error("background unavailable")
    mockSendRuntimeMessage.mockRejectedValue(backgroundError)

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    document.dispatchEvent(makeClipboardEvent("copy", codeA))

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        "Redemption scan failed",
        backgroundError,
      )
    })

    expect(mockShowRedemptionPromptToast).not.toHaveBeenCalled()
    expect(mockShowRedeemLoadingToast).not.toHaveBeenCalled()

    cleanup()
  })

  it("ignores clicks that originate from the content UI host to avoid self-triggered scans", async () => {
    mockCheckPermissionViaMessage.mockResolvedValue(true)

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    const host = document.createElement("all-api-hub-redemption-toast")
    const button = document.createElement("button")
    button.textContent = `Copy ${codeA}`
    host.appendChild(button)
    document.body.appendChild(host)

    button.dispatchEvent(new MouseEvent("click", { bubbles: true }))

    await new Promise((resolve) => setTimeout(resolve, 700))

    expect(mockCheckPermissionViaMessage).not.toHaveBeenCalled()
    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
    expect(mockShowRedemptionPromptToast).not.toHaveBeenCalled()

    cleanup()
  })

  it("logs an error when the context-menu flow throws before redeeming", async () => {
    const flowError = new Error("toast mount failed")
    mockShowRedeemLoadingToast.mockRejectedValueOnce(flowError)

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })

    const addListener = globalThis.browser.runtime.onMessage
      .addListener as ReturnType<typeof vi.fn>
    const listener = addListener.mock.calls[0]?.[0]

    listener({
      action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
      selectionText: codeA,
      pageUrl: "https://example.com/redeem",
    })

    await waitFor(() => {
      expect(logger.error).toHaveBeenCalledWith(
        "Context menu flow failed",
        flowError,
      )
    })

    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()
    expect(mockShowRedeemResultToast).not.toHaveBeenCalled()
    expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()

    cleanup()
  })

  it("stops after the user declines the redemption prompt for detected codes", async () => {
    mockShowRedemptionPromptToast.mockResolvedValueOnce({
      action: "manual",
      selectedCodes: [codeA],
    })
    mockSendRuntimeMessage.mockResolvedValue({
      success: true,
      promptableCodes: [codeA],
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    document.dispatchEvent(makeClipboardEvent("copy", codeA))

    await waitFor(() => {
      expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.RedemptionAssistShouldPrompt,
        url: window.location.href,
        codes: [codeA],
      })
    })

    expect(mockShowRedemptionPromptToast).toHaveBeenCalledTimes(1)
    expect(mockShowRedeemLoadingToast).not.toHaveBeenCalled()
    expect(mockTrackProductAnalyticsActionCompleted).not.toHaveBeenCalled()
    expect(
      mockSendRuntimeMessage.mock.calls.filter(
        ([message]) =>
          message?.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl,
      ),
    ).toHaveLength(0)

    cleanup()
  })

  it("does not start redeeming when detected-code prompt returns no selected codes", async () => {
    mockShowRedemptionPromptToast.mockResolvedValueOnce({
      action: "auto",
      selectedCodes: [],
    })
    mockSendRuntimeMessage.mockResolvedValue({
      success: true,
      promptableCodes: [codeA, codeB],
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    document.dispatchEvent(makeClipboardEvent("copy", `${codeA}\n${codeB}`))

    await waitFor(() => {
      expect(mockShowRedemptionPromptToast).toHaveBeenCalledTimes(1)
    })

    expect(mockShowRedeemLoadingToast).not.toHaveBeenCalled()
    expect(mockShowRedeemResultToast).not.toHaveBeenCalled()
    expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()
    expect(mockTrackProductAnalyticsActionCompleted).not.toHaveBeenCalled()
    expect(
      mockSendRuntimeMessage.mock.calls.filter(
        ([message]) =>
          message?.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl,
      ),
    ).toHaveLength(0)

    cleanup()
  })

  it("treats context-menu text as a raw code when extraction finds no standard redemption code", async () => {
    const rawSelection = "invite-code: manual redeem this"
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: "raw-selection-redeemed",
          },
        }
      }

      return { data: { success: false } }
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })

    const addListener = globalThis.browser.runtime.onMessage
      .addListener as ReturnType<typeof vi.fn>
    const listener = addListener.mock.calls[0]?.[0]

    listener({
      action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
      selectionText: `  ${rawSelection}  `,
      pageUrl: "https://example.com/redeem",
    })

    await waitFor(() => {
      expect(mockShowRedeemResultToast).toHaveBeenCalledWith(
        true,
        "raw-selection-redeemed",
      )
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistAutoRedeemByUrl,
      url: "https://example.com/redeem",
      code: rawSelection,
    })
    expect(mockShowRedemptionPromptToast).not.toHaveBeenCalled()
    expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()
    expect(mockDismissToast).toHaveBeenCalledWith("loading-toast-id")

    cleanup()
  })

  it("tracks failure completion when detected-code prompt redemption fails", async () => {
    mockShowRedemptionPromptToast.mockResolvedValueOnce({
      action: "auto",
      selectedCodes: [codeA],
    })
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.RedemptionAssistShouldPrompt) {
        return {
          success: true,
          promptableCodes: [codeA],
        }
      }

      if (message.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl) {
        return {
          data: {
            success: false,
            message: "redeem failed",
          },
        }
      }

      return { success: false }
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    document.dispatchEvent(makeClipboardEvent("copy", codeA))

    await waitFor(() => {
      expect(mockShowRedeemBatchResultToast).toHaveBeenCalledWith(
        [
          {
            code: codeA,
            preview: "a1b2****c5d6",
            success: false,
            message: "redeem failed",
          },
        ],
        expect.any(Function),
      )
    })

    expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ConfirmRedemptionPrompt,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      insights: {
        itemCount: 1,
        selectedCount: 1,
        successCount: 0,
        failureCount: 1,
      },
    })

    cleanup()
  })

  it("stops context-menu batch redemption when the user leaves no codes selected", async () => {
    mockShowRedemptionPromptToast.mockResolvedValueOnce({
      action: "auto",
      selectedCodes: [],
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })

    const addListener = globalThis.browser.runtime.onMessage
      .addListener as ReturnType<typeof vi.fn>
    const listener = addListener.mock.calls[0]?.[0]

    listener({
      action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
      selectionText: `${codeA}\n${codeB}`,
      pageUrl: "https://example.com/redeem",
    })

    await waitFor(() => {
      expect(mockShowRedemptionPromptToast).toHaveBeenCalledTimes(1)
    })

    expect(mockShowRedeemLoadingToast).not.toHaveBeenCalled()
    expect(mockShowRedeemResultToast).not.toHaveBeenCalled()
    expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()
    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()

    cleanup()
  })

  it("defaults context-menu redemption to the current page url when no pageUrl is provided", async () => {
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: "redeemed-with-current-page-url",
          },
        }
      }

      return { data: { success: false } }
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })

    const addListener = globalThis.browser.runtime.onMessage
      .addListener as ReturnType<typeof vi.fn>
    const listener = addListener.mock.calls[0]?.[0]

    listener({
      action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
      selectionText: codeA,
    })

    await waitFor(() => {
      expect(mockShowRedeemResultToast).toHaveBeenCalledWith(
        true,
        "redeemed-with-current-page-url",
      )
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistAutoRedeemByUrl,
      url: window.location.href,
      code: codeA,
    })
    expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()

    cleanup()
  })

  it("shows a single success toast after the user chooses an account from the multiple-account picker", async () => {
    mockShowAccountSelectToast.mockResolvedValueOnce({
      id: "chosen-account",
      siteName: "Chosen",
    })
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl) {
        return {
          data: {
            success: false,
            code: "MULTIPLE_ACCOUNTS",
            candidates: [
              { id: "chosen-account", siteName: "Chosen" },
              { id: "other-account", siteName: "Other" },
            ],
          },
        }
      }

      if (message.action === RuntimeActionIds.RedemptionAssistAutoRedeem) {
        return {
          data: {
            success: true,
            message: "manual-success-after-picker",
          },
        }
      }

      return { data: { success: false } }
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })

    const addListener = globalThis.browser.runtime.onMessage
      .addListener as ReturnType<typeof vi.fn>
    const listener = addListener.mock.calls[0]?.[0]

    listener({
      action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
      selectionText: codeA,
      pageUrl: "https://example.com/redeem",
    })

    await waitFor(() => {
      expect(mockShowRedeemResultToast).toHaveBeenCalledWith(
        true,
        "manual-success-after-picker",
      )
    })

    expect(mockShowAccountSelectToast).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "chosen-account" }),
      ]),
      {
        title: "redemptionAssist:accountSelect.titleMultiple",
      },
    )
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistAutoRedeem,
      accountId: "chosen-account",
      code: codeA,
    })
    expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()
    expect(mockDismissToast).toHaveBeenCalledWith("loading-toast-id")

    cleanup()
  })

  it("reuses the user-selected fallback account for later context-menu batch redemptions", async () => {
    mockShowRedemptionPromptToast.mockResolvedValueOnce({
      action: "auto",
      selectedCodes: [codeA, codeB],
    })
    mockShowAccountSelectToast.mockResolvedValueOnce({
      id: "selected-account",
      siteName: "Example",
    })

    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (
        message.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl &&
        message.code === codeA
      ) {
        return {
          data: {
            success: false,
            code: "NO_ACCOUNTS",
            allAccounts: [
              { id: "selected-account", siteName: "Example" },
              { id: "other-account", siteName: "Other" },
            ],
          },
        }
      }

      if (message.action === RuntimeActionIds.RedemptionAssistAutoRedeem) {
        return {
          data: {
            success: true,
            message: `manual-${message.code}`,
          },
        }
      }

      return { data: { success: false } }
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })

    const addListener = globalThis.browser.runtime.onMessage
      .addListener as ReturnType<typeof vi.fn>
    const listener = addListener.mock.calls[0]?.[0]
    expect(listener).toBeTypeOf("function")

    listener({
      action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
      selectionText: `${codeA}\n${codeB}`,
      pageUrl: "https://example.com/redeem",
    })

    await waitFor(() => {
      expect(mockShowRedeemBatchResultToast).toHaveBeenCalledTimes(1)
    })

    expect(mockShowAccountSelectToast).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ id: "selected-account" }),
      ]),
      {
        title: "redemptionAssist:accountSelect.titleFallback",
      },
    )
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistAutoRedeem,
      accountId: "selected-account",
      code: codeA,
    })
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistAutoRedeem,
      accountId: "selected-account",
      code: codeB,
    })
    expect(mockDismissToast).toHaveBeenCalledWith("loading-toast-id")
    expect(mockShowRedeemBatchResultToast).toHaveBeenCalledWith(
      [
        {
          code: codeA,
          preview: "a1b2****c5d6",
          success: true,
          message: `manual-${codeA}`,
        },
        {
          code: codeB,
          preview: "b1c2****d5e6",
          success: true,
          message: `manual-${codeB}`,
        },
      ],
      expect.any(Function),
    )
    expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ConfirmRedemptionPrompt,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
      result: PRODUCT_ANALYTICS_RESULTS.Success,
      insights: {
        itemCount: 2,
        selectedCount: 2,
        successCount: 2,
        failureCount: 0,
      },
    })

    const analyticsPayloads = JSON.stringify(
      mockTrackProductAnalyticsActionCompleted.mock.calls,
    )
    expect(analyticsPayloads).not.toContain(codeA)
    expect(analyticsPayloads).not.toContain(codeB)
    expect(analyticsPayloads).not.toContain("selected-account")
    expect(analyticsPayloads).not.toContain("https://example.com/redeem")

    cleanup()
  })

  it("only redeems the prompt-selected subset of detected codes and still uses the single-result success path", async () => {
    mockShowRedemptionPromptToast.mockResolvedValueOnce({
      action: "auto",
      selectedCodes: [codeB],
    })
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.RedemptionAssistShouldPrompt) {
        return {
          success: true,
          promptableCodes: [codeA, codeB],
        }
      }

      if (message.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: `redeemed-${message.code}`,
          },
        }
      }

      return { success: false }
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    document.dispatchEvent(makeClipboardEvent("copy", `${codeA}\n${codeB}`))

    await waitFor(() => {
      expect(mockShowRedeemResultToast).toHaveBeenCalledWith(
        true,
        `redeemed-${codeB}`,
      )
    })

    expect(mockShowRedemptionPromptToast).toHaveBeenCalledWith(
      "redemptionAssist:messages.promptConfirmBatch",
      [
        { code: codeA, preview: "a1b2****c5d6" },
        { code: codeB, preview: "b1c2****d5e6" },
      ],
    )
    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistAutoRedeemByUrl,
      url: window.location.href,
      code: codeB,
    })
    expect(
      mockSendRuntimeMessage.mock.calls.filter(
        ([message]) =>
          message?.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl,
      ),
    ).toHaveLength(1)
    expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()
    expect(mockDismissToast).toHaveBeenCalledWith("loading-toast-id")

    cleanup()
  })

  it("prefers the runtime error message when auto redeem fails in the context-menu flow", async () => {
    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl) {
        return {
          error: "background-error",
          data: {
            success: false,
            message: "result-message-should-not-win",
          },
        }
      }

      return { data: { success: false } }
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })

    const addListener = globalThis.browser.runtime.onMessage
      .addListener as ReturnType<typeof vi.fn>
    const listener = addListener.mock.calls[0]?.[0]

    listener({
      action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
      selectionText: codeA,
      pageUrl: "https://example.com/redeem",
    })

    await waitFor(() => {
      expect(mockShowRedeemBatchResultToast).toHaveBeenCalledTimes(1)
    })

    expect(mockShowRedeemBatchResultToast).toHaveBeenCalledWith(
      [
        {
          code: codeA,
          preview: "a1b2****c5d6",
          success: false,
          message: "background-error",
        },
      ],
      expect.any(Function),
    )

    cleanup()
  })

  it("falls back to the generic failure message when forced-account redeem returns no message", async () => {
    mockShowAccountSelectToast.mockResolvedValueOnce({
      id: "selected-account",
      siteName: "Example",
    })

    mockSendRuntimeMessage.mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.RedemptionAssistAutoRedeemByUrl) {
        return {
          data: {
            success: false,
            code: "NO_ACCOUNTS",
            allAccounts: [{ id: "selected-account", siteName: "Example" }],
          },
        }
      }

      if (message.action === RuntimeActionIds.RedemptionAssistAutoRedeem) {
        return {
          data: {
            success: false,
          },
        }
      }

      return { data: { success: false } }
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })

    const addListener = globalThis.browser.runtime.onMessage
      .addListener as ReturnType<typeof vi.fn>
    const listener = addListener.mock.calls[0]?.[0]

    listener({
      action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
      selectionText: codeA,
      pageUrl: "https://example.com/redeem",
    })

    await waitFor(() => {
      expect(mockShowRedeemBatchResultToast).toHaveBeenCalledTimes(1)
    })

    expect(mockSendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.RedemptionAssistAutoRedeem,
      accountId: "selected-account",
      code: codeA,
    })
    expect(mockShowRedeemBatchResultToast).toHaveBeenCalledWith(
      [
        {
          code: codeA,
          preview: "a1b2****c5d6",
          success: false,
          message: "redemptionAssist:messages.redeemFailed",
        },
      ],
      expect.any(Function),
    )

    cleanup()
  })

  it("records a cancelled result when the user dismisses the multiple-account chooser", async () => {
    mockShowRedemptionPromptToast.mockResolvedValueOnce({
      action: "auto",
      selectedCodes: [codeA],
    })
    mockShowAccountSelectToast.mockResolvedValueOnce(null)
    mockSendRuntimeMessage.mockResolvedValue({
      data: {
        success: false,
        code: "MULTIPLE_ACCOUNTS",
        candidates: [
          { id: "acc-a", siteName: "A" },
          { id: "acc-b", siteName: "B" },
        ],
      },
    })

    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })

    const addListener = globalThis.browser.runtime.onMessage
      .addListener as ReturnType<typeof vi.fn>
    const listener = addListener.mock.calls[0]?.[0]

    listener({
      action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
      selectionText: `${codeA}\n${codeB}`,
      pageUrl: "https://example.com/redeem",
    })

    await waitFor(() => {
      expect(mockShowRedeemBatchResultToast).toHaveBeenCalledTimes(1)
    })

    expect(mockShowAccountSelectToast).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: "acc-a" })]),
      {
        title: "redemptionAssist:accountSelect.titleMultiple",
      },
    )
    expect(mockDismissToast).toHaveBeenCalledWith("loading-toast-id")
    expect(mockShowRedeemBatchResultToast).toHaveBeenCalledWith(
      [
        {
          code: codeA,
          preview: "a1b2****c5d6",
          success: false,
          message: "redemptionAssist:messages.cancelled",
        },
      ],
      expect.any(Function),
    )
    expect(
      mockSendRuntimeMessage.mock.calls.filter(
        ([message]) =>
          message?.action === RuntimeActionIds.RedemptionAssistAutoRedeem,
      ),
    ).toHaveLength(0)

    cleanup()
  })

  it("ignores empty context-menu selections and unregisters the listener on cleanup", async () => {
    const { setupRedemptionAssistContent } = await import(
      "~/entrypoints/content/redemptionAssist"
    )

    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })

    const addListener = globalThis.browser.runtime.onMessage
      .addListener as ReturnType<typeof vi.fn>
    const removeListener = globalThis.browser.runtime.onMessage
      .removeListener as ReturnType<typeof vi.fn>
    const listener = addListener.mock.calls[0]?.[0]

    listener({
      action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
      selectionText: "   ",
      pageUrl: "https://example.com/redeem",
    })

    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(logger.warn).toHaveBeenCalledWith(
      "Context menu trigger missing selection",
    )
    expect(mockSendRuntimeMessage).not.toHaveBeenCalled()

    cleanup()

    expect(removeListener).toHaveBeenCalledWith(listener)
  })
})
