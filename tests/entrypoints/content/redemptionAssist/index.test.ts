import { waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { REDEMPTION_PROMPT_ACTIONS } from "~/features/RedemptionAssist/contracts"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import {
  REDEMPTION_ACCOUNT_SUPPORT_STATUSES,
  REDEMPTION_ASSIST_RESULT_CODES,
} from "~/services/redemption/contracts"

const {
  RedemptionAssistMessageTypes,
  mockCheckPermissionViaMessage,
  mockSendRedemptionAssistMessage,
  mockSendRuntimeMessage,
  mockDismissToast,
  mockShowAccountSelectToast,
  mockShowRedeemBatchResultToast,
  mockShowRedeemLoadingToast,
  mockShowRedeemResultToast,
  mockShowRedemptionPromptToast,
  mockTrackProductAnalyticsActionCompleted,
  logger,
} = vi.hoisted(() => {
  const RedemptionAssistMessageTypes = {
    ShouldPrompt: "redemptionAssist:shouldPrompt",
    AutoRedeem: "redemptionAssist:autoRedeem",
    AutoRedeemByUrl: "redemptionAssist:autoRedeemByUrl",
  } as const

  return {
    RedemptionAssistMessageTypes,
    mockCheckPermissionViaMessage: vi.fn(),
    mockSendRedemptionAssistMessage: vi.fn(),
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
  }
})

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: (...args: unknown[]) =>
    mockTrackProductAnalyticsActionCompleted(...args),
}))

vi.mock("~/utils/browser/permissions", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/permissions")>()

  return { ...actual, checkPermissionViaMessage: mockCheckPermissionViaMessage }
})
vi.mock("~/utils/browser/runtimeMessages", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/runtimeMessages")>()

  return { ...actual, sendRuntimeMessage: mockSendRuntimeMessage }
})

vi.mock("~/services/redemption/redemptionAssistMessaging", () => ({
  RedemptionAssistMessageTypes,
  sendRedemptionAssistMessage: mockSendRedemptionAssistMessage,
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: vi.fn(() => logger),
}))

vi.mock("~/utils/i18n/core", () => ({
  t: vi.fn((key: string) => key),
}))

vi.mock("~/features/RedemptionAssist/redemptionToasts", () => ({
  dismissToast: mockDismissToast,
  showAccountSelectToast: mockShowAccountSelectToast,
  showRedeemBatchResultToast: mockShowRedeemBatchResultToast,
  showRedeemLoadingToast: mockShowRedeemLoadingToast,
  showRedeemResultToast: mockShowRedeemResultToast,
  showRedemptionPromptToast: mockShowRedemptionPromptToast,
}))

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
  it("preserves short manual-code previews while masking long codes", async () => {
    const { maskCode } =
      await import("~/features/RedemptionAssist/redemptionBatch")
    expect(maskCode("  ABC123  ")).toBe("ABC123")
    expect(maskCode(codeA)).toBe("a1b2****c5d6")
  })
  it("cancels a multi-code context-menu prompt without dispatching redemption", async () => {
    const { handleContextMenuRedemption } =
      await import("~/features/RedemptionAssist/contentFlow")
    mockShowRedemptionPromptToast.mockResolvedValue({
      action: REDEMPTION_PROMPT_ACTIONS.Cancel,
    })
    await handleContextMenuRedemption(
      `${codeA}\n${codeB}`,
      "https://source.test",
    )
    expect(mockSendRedemptionAssistMessage).not.toHaveBeenCalled()
    expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()
  })
  it("distinguishes a lost generic redemption reply from reset-card preparation failure", async () => {
    const { runRedemptionBatch } =
      await import("~/features/RedemptionAssist/redemptionBatch")
    mockSendRedemptionAssistMessage.mockRejectedValue(new Error("port closed"))
    await runRedemptionBatch({
      url: "https://source.test",
      codes: [codeA, "PMRC-ABCD-EFGH-JKMN-PQRS"],
      confirmedPrompt: false,
    })
    expect(mockShowRedeemBatchResultToast.mock.calls[0]![0]).toEqual([
      expect.objectContaining({
        code: codeA,
        success: false,
        retryable: false,
        outcomeUncertain: true,
      }),
      {
        code: "PMRC-ABCD-EFGH-JKMN-PQRS",
        preview: "PMRC****PQRS",
        success: false,
        message: "redemptionAssist:messages.redeemFailed",
      },
    ])
    expect(mockShowAccountSelectToast).not.toHaveBeenCalled()
  })
  it.each([undefined, { success: false }, { success: true }])(
    "does not prompt when eligibility is absent or rejected: %j",
    async (reply) => {
      const { scanForRedemptionCodes } =
        await import("~/features/RedemptionAssist/contentFlow")
      mockSendRedemptionAssistMessage.mockResolvedValue(reply)
      await scanForRedemptionCodes(codeA)
      expect(mockShowRedemptionPromptToast).not.toHaveBeenCalled()
      expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()
    },
  )
  it("ignores empty and non-code scans, and non-HTTP origins", async () => {
    const { scanForRedemptionCodes, handleContextMenuRedemption } =
      await import("~/features/RedemptionAssist/contentFlow")
    await scanForRedemptionCodes()
    await scanForRedemptionCodes("plain text")
    await handleContextMenuRedemption(" ", "https://example.com")
    const { isHttpUrl } = await import("~/utils/core/urlParsing")
    const parsing = await import("~/utils/core/urlParsing")
    expect(isHttpUrl("file:///card.txt")).toBe(false)
    vi.spyOn(parsing, "isHttpUrl").mockReturnValue(false)
    await scanForRedemptionCodes(codeA)
    expect(mockSendRedemptionAssistMessage).not.toHaveBeenCalled()
  })
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
      action: REDEMPTION_PROMPT_ACTIONS.Auto,
      selectedCodes: [codeA],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it.each([true, false])(
    "reports installed detection listeners (%s) without dispatching redemption",
    async (enableDetection) => {
      const { setupRedemptionAssistContent } =
        await import("~/entrypoints/content/redemptionAssist")
      const cleanup = setupRedemptionAssistContent({
        enableDetection,
        enableContextMenu: true,
      })
      const listener = vi.mocked(
        globalThis.browser.runtime.onMessage.addListener,
      ).mock.calls[0]![0]
      const respond = vi.fn()
      listener(
        { action: RuntimeActionIds.RedemptionAssistGetStatus },
        {},
        respond,
      )
      expect(respond).toHaveBeenCalledWith({
        ready: true,
        detectionEnabled: enableDetection,
      })
      expect(mockSendRedemptionAssistMessage).not.toHaveBeenCalled()
      cleanup()
    },
  )

  it("acknowledges valid context-menu admission and rejects empty selections", async () => {
    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")
    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })
    const listener = vi.mocked(globalThis.browser.runtime.onMessage.addListener)
      .mock.calls[0]![0]
    const respond = vi.fn()
    listener(
      {
        action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
        selectionText: " ",
      },
      {},
      respond,
    )
    expect(respond).toHaveBeenLastCalledWith({ accepted: false })
    expect(mockSendRedemptionAssistMessage).not.toHaveBeenCalled()
    listener(
      {
        action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
        selectionText: codeA,
      },
      {},
      respond,
    )
    expect(respond).toHaveBeenLastCalledWith({ accepted: true })
    await new Promise((resolve) => setTimeout(resolve, 0))
    cleanup()
  })

  it("ignores unrelated runtime messages in the context-menu listener", async () => {
    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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

    expect(mockSendRedemptionAssistMessage).not.toHaveBeenCalled()
    expect(mockShowRedeemResultToast).not.toHaveBeenCalled()

    cleanup()

    expect(removeListener).toHaveBeenCalledWith(listener)
  })

  it("propagates context-menu listener removal failures through the shared adapter", async () => {
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

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })

    expect(() => cleanup()).toThrow(removeListenerError)
  })

  it("deduplicates repeated clipboard scans and auto-redeems a single selected code", async () => {
    mockSendRedemptionAssistMessage.mockImplementation(async (type) => {
      if (type === RedemptionAssistMessageTypes.ShouldPrompt) {
        return {
          success: true,
          promptableCodes: [codeA],
        }
      }

      if (type === RedemptionAssistMessageTypes.AutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: "redeemed",
          },
        }
      }

      return { success: false }
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    document.dispatchEvent(makeClipboardEvent("copy", codeA))
    document.dispatchEvent(makeClipboardEvent("copy", codeA))

    await waitFor(() => {
      expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
        RedemptionAssistMessageTypes.ShouldPrompt,
        {
          url: window.location.href,
          codes: [codeA],
        },
      )
    })

    expect(
      mockSendRedemptionAssistMessage.mock.calls.filter(
        ([type]) => type === RedemptionAssistMessageTypes.ShouldPrompt,
      ),
    ).toHaveLength(1)
    expect(
      mockSendRedemptionAssistMessage.mock.calls.filter(
        ([type]) => type === RedemptionAssistMessageTypes.AutoRedeemByUrl,
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

  it("auto-redeems selected text on pointerup and stops after cleanup", async () => {
    const getSelectionSpy = vi.spyOn(window, "getSelection").mockReturnValue({
      toString: () => codeA,
    } as any)

    mockSendRedemptionAssistMessage.mockImplementation(async (type) => {
      if (type === RedemptionAssistMessageTypes.ShouldPrompt) {
        return {
          success: true,
          promptableCodes: [codeA],
        }
      }

      if (type === RedemptionAssistMessageTypes.AutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: "redeemed-from-pointerup",
          },
        }
      }

      return { success: false }
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    document.dispatchEvent(new Event("pointerup", { bubbles: true }))

    await waitFor(() => {
      expect(mockShowRedeemResultToast).toHaveBeenCalledWith(
        true,
        "redeemed-from-pointerup",
      )
    })

    expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
      RedemptionAssistMessageTypes.ShouldPrompt,
      {
        url: window.location.href,
        codes: [codeA],
      },
    )
    expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
      RedemptionAssistMessageTypes.AutoRedeemByUrl,
      {
        url: window.location.href,
        code: codeA,
      },
    )

    cleanup()
    mockSendRedemptionAssistMessage.mockClear()
    mockShowRedeemResultToast.mockClear()
    getSelectionSpy.mockReturnValue({
      toString: () => codeB,
    } as any)

    document.dispatchEvent(new Event("pointerup", { bubbles: true }))
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(mockSendRedemptionAssistMessage).not.toHaveBeenCalled()
    expect(mockShowRedeemResultToast).not.toHaveBeenCalled()
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

    mockSendRedemptionAssistMessage.mockImplementation(async (type) => {
      if (type === RedemptionAssistMessageTypes.ShouldPrompt) {
        return {
          success: true,
          promptableCodes: [codeA],
        }
      }

      if (type === RedemptionAssistMessageTypes.AutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: "redeemed-from-selection",
          },
        }
      }

      return { success: false }
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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
    expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
      RedemptionAssistMessageTypes.ShouldPrompt,
      {
        url: window.location.href,
        codes: [codeA],
      },
    )
    expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
      RedemptionAssistMessageTypes.AutoRedeemByUrl,
      {
        url: window.location.href,
        code: codeA,
      },
    )

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
    mockSendRedemptionAssistMessage.mockImplementation(async (type) => {
      if (type === RedemptionAssistMessageTypes.ShouldPrompt) {
        return {
          success: true,
          promptableCodes: [codeA],
        }
      }

      if (type === RedemptionAssistMessageTypes.AutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: "redeemed-from-target-text",
          },
        }
      }

      return { success: false }
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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
        expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
          RedemptionAssistMessageTypes.ShouldPrompt,
          {
            url: window.location.href,
            codes: [codeA],
          },
        )
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
    mockSendRedemptionAssistMessage.mockImplementation(async (type) => {
      if (type === RedemptionAssistMessageTypes.ShouldPrompt) {
        return {
          success: true,
          promptableCodes: [codeA],
        }
      }

      if (type === RedemptionAssistMessageTypes.AutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: "redeemed-after-read-failure",
          },
        }
      }

      return { success: false }
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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
    mockSendRedemptionAssistMessage.mockResolvedValue({
      success: true,
      promptableCodes: [],
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    document.dispatchEvent(makeClipboardEvent("copy", codeA))

    await waitFor(() => {
      expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
        RedemptionAssistMessageTypes.ShouldPrompt,
        {
          url: window.location.href,
          codes: [codeA],
        },
      )
    })

    expect(mockShowRedemptionPromptToast).not.toHaveBeenCalled()
    expect(mockShowRedeemLoadingToast).not.toHaveBeenCalled()
    expect(
      mockSendRedemptionAssistMessage.mock.calls.filter(
        ([type]) => type === RedemptionAssistMessageTypes.AutoRedeemByUrl,
      ),
    ).toHaveLength(0)

    cleanup()
  })

  it("logs an error when detected redemption scanning fails", async () => {
    const backgroundError = new Error("background unavailable")
    mockSendRedemptionAssistMessage.mockRejectedValue(backgroundError)

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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

    // The handler defers via setTimeout(0); flush a macrotask instead of
    // sleeping real time — the early-return path runs no further timers.
    await new Promise((resolve) => setTimeout(resolve, 0))
    await Promise.resolve()

    expect(mockCheckPermissionViaMessage).not.toHaveBeenCalled()
    expect(mockSendRedemptionAssistMessage).not.toHaveBeenCalled()
    expect(mockShowRedemptionPromptToast).not.toHaveBeenCalled()

    cleanup()
  })

  it("logs an error when the context-menu flow throws before redeeming", async () => {
    const flowError = new Error("toast mount failed")
    mockShowRedeemLoadingToast.mockRejectedValueOnce(flowError)

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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

    expect(mockSendRedemptionAssistMessage).not.toHaveBeenCalled()
    expect(mockShowRedeemResultToast).not.toHaveBeenCalled()
    expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()

    cleanup()
  })

  it("stops after the user declines the redemption prompt for detected codes", async () => {
    mockShowRedemptionPromptToast.mockResolvedValueOnce({
      action: "manual",
      selectedCodes: [codeA],
    })
    mockSendRedemptionAssistMessage.mockResolvedValue({
      success: true,
      promptableCodes: [codeA],
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })

    document.dispatchEvent(makeClipboardEvent("copy", codeA))

    await waitFor(() => {
      expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
        RedemptionAssistMessageTypes.ShouldPrompt,
        {
          url: window.location.href,
          codes: [codeA],
        },
      )
    })

    expect(mockShowRedemptionPromptToast).toHaveBeenCalledTimes(1)
    expect(mockShowRedeemLoadingToast).not.toHaveBeenCalled()
    expect(mockTrackProductAnalyticsActionCompleted).not.toHaveBeenCalled()
    expect(
      mockSendRedemptionAssistMessage.mock.calls.filter(
        ([type]) => type === RedemptionAssistMessageTypes.AutoRedeemByUrl,
      ),
    ).toHaveLength(0)

    cleanup()
  })

  it("does not start redeeming when detected-code prompt returns no selected codes", async () => {
    mockShowRedemptionPromptToast.mockResolvedValueOnce({
      action: REDEMPTION_PROMPT_ACTIONS.Auto,
      selectedCodes: [],
    })
    mockSendRedemptionAssistMessage.mockResolvedValue({
      success: true,
      promptableCodes: [codeA, codeB],
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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
      mockSendRedemptionAssistMessage.mock.calls.filter(
        ([type]) => type === RedemptionAssistMessageTypes.AutoRedeemByUrl,
      ),
    ).toHaveLength(0)

    cleanup()
  })

  it("treats context-menu text as a raw code when extraction finds no standard redemption code", async () => {
    const rawSelection = "invite-code: manual redeem this"
    mockSendRedemptionAssistMessage.mockImplementation(async (type) => {
      if (type === RedemptionAssistMessageTypes.AutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: "raw-selection-redeemed",
          },
        }
      }

      return { data: { success: false } }
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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

    expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
      RedemptionAssistMessageTypes.AutoRedeemByUrl,
      {
        url: "https://example.com/redeem",
        code: rawSelection,
      },
    )
    expect(mockShowRedemptionPromptToast).not.toHaveBeenCalled()
    expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()
    expect(mockDismissToast).toHaveBeenCalledWith("loading-toast-id")

    cleanup()
  })

  it("tracks failure completion when detected-code prompt redemption fails", async () => {
    mockShowRedemptionPromptToast.mockResolvedValueOnce({
      action: REDEMPTION_PROMPT_ACTIONS.Auto,
      selectedCodes: [codeA],
    })
    mockSendRedemptionAssistMessage.mockImplementation(async (type) => {
      if (type === RedemptionAssistMessageTypes.ShouldPrompt) {
        return {
          success: true,
          promptableCodes: [codeA],
        }
      }

      if (type === RedemptionAssistMessageTypes.AutoRedeemByUrl) {
        return {
          data: {
            success: false,
            message: "redeem failed",
          },
        }
      }

      return { success: false }
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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
      action: REDEMPTION_PROMPT_ACTIONS.Auto,
      selectedCodes: [],
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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
    expect(mockSendRedemptionAssistMessage).not.toHaveBeenCalled()

    cleanup()
  })

  it("defaults context-menu redemption to the current page url when no pageUrl is provided", async () => {
    mockSendRedemptionAssistMessage.mockImplementation(async (type) => {
      if (type === RedemptionAssistMessageTypes.AutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: "redeemed-with-current-page-url",
          },
        }
      }

      return { data: { success: false } }
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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

    expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
      RedemptionAssistMessageTypes.AutoRedeemByUrl,
      {
        url: window.location.href,
        code: codeA,
      },
    )
    expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()

    cleanup()
  })

  it("opens an explanatory disabled picker when compatible accounts lack automatic redemption", async () => {
    const candidate = {
      id: "manual",
      name: "Manual",
      automaticRedemptionSupport: {
        status: REDEMPTION_ACCOUNT_SUPPORT_STATUSES.Unsupported,
      },
      manualRedemptionUrl: "https://manual.test/redeem",
    }
    mockShowAccountSelectToast.mockResolvedValueOnce(null)
    mockSendRedemptionAssistMessage.mockResolvedValue({
      data: {
        success: false,
        code: REDEMPTION_ASSIST_RESULT_CODES.NoAutomaticRedemption,
        candidates: [candidate],
      },
    })
    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")
    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })
    const listener = vi.mocked(globalThis.browser.runtime.onMessage.addListener)
      .mock.calls[0]![0]
    listener(
      {
        action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
        selectionText: codeA,
        pageUrl: "https://source.test",
      },
      {},
      vi.fn(),
    )
    await waitFor(() =>
      expect(mockShowAccountSelectToast).toHaveBeenCalledWith([candidate], {
        title: "redemptionAssist:accountSelect.titleNoAutomatic",
      }),
    )
    expect(
      mockSendRedemptionAssistMessage.mock.calls.some(
        ([type]) => type === RedemptionAssistMessageTypes.AutoRedeem,
      ),
    ).toBe(false)
    cleanup()
  })

  it("shows a single success toast after the user chooses an account from the multiple-account picker", async () => {
    mockShowAccountSelectToast.mockResolvedValueOnce({
      id: "chosen-account",
      siteName: "Chosen",
    })
    mockSendRedemptionAssistMessage.mockImplementation(async (type) => {
      if (type === RedemptionAssistMessageTypes.AutoRedeemByUrl) {
        return {
          data: {
            success: false,
            code: REDEMPTION_ASSIST_RESULT_CODES.MultipleAccounts,
            candidates: [
              { id: "chosen-account", siteName: "Chosen" },
              { id: "other-account", siteName: "Other" },
            ],
          },
        }
      }

      if (type === RedemptionAssistMessageTypes.AutoRedeem) {
        return {
          data: {
            success: true,
            message: "manual-success-after-picker",
          },
        }
      }

      return { data: { success: false } }
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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
    expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
      RedemptionAssistMessageTypes.AutoRedeem,
      {
        accountId: "chosen-account",
        code: codeA,
      },
    )
    expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()
    expect(mockDismissToast).toHaveBeenCalledWith("loading-toast-id")

    cleanup()
  })

  it("maps unsupported manual redemption to validation prompt analytics", async () => {
    mockShowAccountSelectToast.mockResolvedValueOnce({
      id: "chosen-account",
      siteName: "Chosen",
    })
    mockSendRedemptionAssistMessage.mockImplementation(async (type) => {
      if (type === RedemptionAssistMessageTypes.AutoRedeemByUrl) {
        return {
          data: {
            success: false,
            code: REDEMPTION_ASSIST_RESULT_CODES.MultipleAccounts,
            candidates: [{ id: "chosen-account", siteName: "Chosen" }],
          },
        }
      }

      if (type === RedemptionAssistMessageTypes.AutoRedeem) {
        return {
          data: {
            success: false,
            code: REDEMPTION_ASSIST_RESULT_CODES.UnsupportedSiteType,
            message: "Automatic redemption is unavailable for this site type",
          },
        }
      }

      return { data: { success: false } }
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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
      expect(mockShowRedeemBatchResultToast).toHaveBeenCalledWith(
        [
          {
            code: codeA,
            preview: "a1b2****c5d6",
            success: false,
            message: "Automatic redemption is unavailable for this site type",
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
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      insights: {
        itemCount: 1,
        selectedCount: 1,
        successCount: 0,
        failureCount: 1,
      },
    })

    const analyticsPayloads = JSON.stringify(
      mockTrackProductAnalyticsActionCompleted.mock.calls,
    )
    expect(analyticsPayloads).not.toContain(codeA)
    expect(analyticsPayloads).not.toContain("chosen-account")
    expect(analyticsPayloads).not.toContain("Automatic redemption")

    cleanup()
  })

  it("explains that detected PMRC codes claim a card without using it", async () => {
    const resetCode = "PMRC-ABCD-EFGH-JKMN-PQRS"
    mockSendRedemptionAssistMessage.mockResolvedValue({
      success: true,
      promptableCodes: [resetCode],
    })
    mockShowRedemptionPromptToast.mockResolvedValueOnce({
      action: REDEMPTION_PROMPT_ACTIONS.Cancel,
      selectedCodes: [],
    })
    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")
    const cleanup = setupRedemptionAssistContent({
      enableDetection: true,
      enableContextMenu: false,
    })
    document.dispatchEvent(makeClipboardEvent("copy", resetCode.toLowerCase()))
    await waitFor(() =>
      expect(mockShowRedemptionPromptToast).toHaveBeenCalledWith(
        "redemptionAssist:messages.pmplanPromptConfirm",
        [{ code: resetCode, preview: "PMRC****PQRS" }],
      ),
    )
    cleanup()
  })

  it("confirms reset-card targets and keeps mixed batch account selections separate", async () => {
    const resetCode = "PMRC-ABCD-EFGH-JKMN-PQRS"
    const otherResetCode = "PMRC-2345-6789-ABCD-EFGH"
    mockShowRedemptionPromptToast.mockResolvedValueOnce({
      action: REDEMPTION_PROMPT_ACTIONS.Auto,
      selectedCodes: [codeA, resetCode, otherResetCode, codeB],
    })
    mockShowAccountSelectToast
      .mockResolvedValueOnce({ id: "generic" })
      .mockResolvedValueOnce({ id: "plan" })
      .mockResolvedValueOnce({ id: "other-plan" })
    mockSendRedemptionAssistMessage.mockImplementation(async (type, data) => {
      if (type === RedemptionAssistMessageTypes.AutoRedeemByUrl)
        return {
          data: {
            success: false,
            code: data.code.startsWith("PMRC-")
              ? REDEMPTION_ASSIST_RESULT_CODES.SelectAccount
              : REDEMPTION_ASSIST_RESULT_CODES.MultipleAccounts,
            candidates: [
              { id: data.code.startsWith("PMRC-") ? "plan" : "generic" },
            ],
            message: "Confirm the card's deployment; claiming does not use it",
          },
        }
      if (type === RedemptionAssistMessageTypes.AutoRedeem)
        return {
          data: {
            success: data.code !== resetCode,
            message: "outcome",
            ...(data.code === resetCode
              ? {
                  retryable: false,
                  code: REDEMPTION_ASSIST_RESULT_CODES.OutcomeUncertain,
                }
              : {}),
          },
        }
      return { success: false }
    })
    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")
    const cleanup = setupRedemptionAssistContent({
      enableDetection: false,
      enableContextMenu: true,
    })
    const listener = vi.mocked(globalThis.browser.runtime.onMessage.addListener)
      .mock.calls[0]![0]
    listener(
      {
        action: RuntimeActionIds.RedemptionAssistContextMenuTrigger,
        selectionText: `${codeA}\n${resetCode}\n${otherResetCode}\n${codeB}`,
        pageUrl: "https://source.test",
      },
      {},
      vi.fn(),
    )
    await waitFor(() =>
      expect(mockShowRedeemBatchResultToast).toHaveBeenCalledTimes(1),
    )
    expect(
      mockSendRedemptionAssistMessage.mock.calls
        .filter(([type]) => type === RedemptionAssistMessageTypes.AutoRedeem)
        .map(([, data]) => [data.accountId, data.code]),
    ).toEqual([
      ["generic", codeA],
      ["plan", resetCode],
      ["other-plan", otherResetCode],
      ["generic", codeB],
    ])
    expect(mockShowAccountSelectToast).toHaveBeenCalledTimes(3)
    expect(mockShowAccountSelectToast).toHaveBeenLastCalledWith(
      [{ id: "plan" }],
      {
        title: "redemptionAssist:accountSelect.titlePmplan",
        message: "Confirm the card's deployment; claiming does not use it",
      },
    )
    expect(mockShowRedeemBatchResultToast.mock.calls[0]![0][1]).toMatchObject({
      success: false,
      retryable: false,
      outcomeUncertain: true,
    })
    await mockShowRedeemBatchResultToast.mock.calls[0]![1](otherResetCode)
    expect(mockSendRedemptionAssistMessage).toHaveBeenLastCalledWith(
      RedemptionAssistMessageTypes.AutoRedeem,
      { accountId: "other-plan", code: otherResetCode },
    )
    expect(mockShowAccountSelectToast).toHaveBeenCalledTimes(3)
    cleanup()
  })

  it.each(["reject", "empty"])(
    "keeps completed rows and suppresses replay after a %s claim reply",
    async (reply) => {
      const resetCode = "PMRC-ABCD-EFGH-JKMN-PQRS"
      const { runRedemptionBatch } =
        await import("~/features/RedemptionAssist/redemptionBatch")
      mockShowAccountSelectToast.mockResolvedValueOnce({ id: "plan" })
      mockSendRedemptionAssistMessage.mockImplementation(async (type, data) => {
        if (type === RedemptionAssistMessageTypes.AutoRedeem) {
          if (reply === "reject") throw new Error("port closed")
          return undefined
        }
        return {
          data:
            data.code === resetCode
              ? {
                  success: false,
                  code: REDEMPTION_ASSIST_RESULT_CODES.SelectAccount,
                  candidates: [{ id: "plan" }],
                }
              : { success: true, message: "Redeemed" },
        }
      })
      await runRedemptionBatch({
        url: "https://source.test",
        codes: [codeA, resetCode, codeB],
        confirmedPrompt: true,
      })
      const [rows, retry] = mockShowRedeemBatchResultToast.mock.calls[0]!
      expect(rows).toEqual([
        expect.objectContaining({ code: codeA, success: true }),
        expect.objectContaining({
          code: resetCode,
          success: false,
          retryable: false,
          outcomeUncertain: true,
          message: "redemptionAssist:messages.pmplanClaimUncertain",
        }),
        expect.objectContaining({ code: codeB, success: true }),
      ])
      await expect(retry(resetCode)).resolves.toMatchObject({
        retryable: false,
        outcomeUncertain: true,
      })
    },
  )

  it("keeps completed rows when a later account picker fails and continues remaining codes", async () => {
    const { runRedemptionBatch } =
      await import("~/features/RedemptionAssist/redemptionBatch")
    mockShowAccountSelectToast.mockRejectedValueOnce(new Error("picker failed"))
    mockSendRedemptionAssistMessage.mockImplementation(async (_type, data) => ({
      data:
        data.code === codeB
          ? {
              success: false,
              code: REDEMPTION_ASSIST_RESULT_CODES.MultipleAccounts,
              candidates: [{ id: "generic" }],
            }
          : { success: true, message: "Redeemed" },
    }))
    await runRedemptionBatch({
      url: "https://source.test",
      codes: [codeA, codeB, "cccccccccccccccccccccccccccccccc"],
      confirmedPrompt: true,
    })
    expect(mockShowRedeemBatchResultToast.mock.calls[0]![0]).toEqual([
      expect.objectContaining({ code: codeA, success: true }),
      expect.objectContaining({ code: codeB, success: false }),
      expect.objectContaining({
        code: "cccccccccccccccccccccccccccccccc",
        success: true,
      }),
    ])
  })

  it("reuses the user-selected fallback account for later context-menu batch redemptions", async () => {
    mockShowRedemptionPromptToast.mockResolvedValueOnce({
      action: REDEMPTION_PROMPT_ACTIONS.Auto,
      selectedCodes: [codeA, codeB],
    })
    mockShowAccountSelectToast.mockResolvedValueOnce({
      id: "selected-account",
      siteName: "Example",
    })

    mockSendRedemptionAssistMessage.mockImplementation(async (type, data) => {
      if (
        type === RedemptionAssistMessageTypes.AutoRedeemByUrl &&
        data?.code === codeA
      ) {
        return {
          data: {
            success: false,
            code: REDEMPTION_ASSIST_RESULT_CODES.NoAccounts,
            allAccounts: [
              { id: "selected-account", siteName: "Example" },
              { id: "other-account", siteName: "Other" },
            ],
          },
        }
      }

      if (type === RedemptionAssistMessageTypes.AutoRedeem) {
        return {
          data: {
            success: true,
            message: `manual-${data?.code}`,
          },
        }
      }

      return { data: { success: false } }
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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
    expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
      RedemptionAssistMessageTypes.AutoRedeem,
      {
        accountId: "selected-account",
        code: codeA,
      },
    )
    expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
      RedemptionAssistMessageTypes.AutoRedeem,
      {
        accountId: "selected-account",
        code: codeB,
      },
    )
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
      action: REDEMPTION_PROMPT_ACTIONS.Auto,
      selectedCodes: [codeB],
    })
    mockSendRedemptionAssistMessage.mockImplementation(async (type, data) => {
      if (type === RedemptionAssistMessageTypes.ShouldPrompt) {
        return {
          success: true,
          promptableCodes: [codeA, codeB],
        }
      }

      if (type === RedemptionAssistMessageTypes.AutoRedeemByUrl) {
        return {
          data: {
            success: true,
            message: `redeemed-${data?.code}`,
          },
        }
      }

      return { success: false }
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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
    expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
      RedemptionAssistMessageTypes.AutoRedeemByUrl,
      {
        url: window.location.href,
        code: codeB,
      },
    )
    expect(
      mockSendRedemptionAssistMessage.mock.calls.filter(
        ([type]) => type === RedemptionAssistMessageTypes.AutoRedeemByUrl,
      ),
    ).toHaveLength(1)
    expect(mockShowRedeemBatchResultToast).not.toHaveBeenCalled()
    expect(mockDismissToast).toHaveBeenCalledWith("loading-toast-id")

    cleanup()
  })

  it("prefers the runtime error message when auto redeem fails in the context-menu flow", async () => {
    mockSendRedemptionAssistMessage.mockImplementation(async (type) => {
      if (type === RedemptionAssistMessageTypes.AutoRedeemByUrl) {
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

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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

    mockSendRedemptionAssistMessage.mockImplementation(async (type) => {
      if (type === RedemptionAssistMessageTypes.AutoRedeemByUrl) {
        return {
          data: {
            success: false,
            code: REDEMPTION_ASSIST_RESULT_CODES.NoAccounts,
            allAccounts: [{ id: "selected-account", siteName: "Example" }],
          },
        }
      }

      if (type === RedemptionAssistMessageTypes.AutoRedeem) {
        return {
          data: {
            success: false,
          },
        }
      }

      return { data: { success: false } }
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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

    expect(mockSendRedemptionAssistMessage).toHaveBeenCalledWith(
      RedemptionAssistMessageTypes.AutoRedeem,
      {
        accountId: "selected-account",
        code: codeA,
      },
    )
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
      action: REDEMPTION_PROMPT_ACTIONS.Auto,
      selectedCodes: [codeA],
    })
    mockShowAccountSelectToast.mockResolvedValueOnce(null)
    mockSendRedemptionAssistMessage.mockResolvedValue({
      data: {
        success: false,
        code: REDEMPTION_ASSIST_RESULT_CODES.MultipleAccounts,
        candidates: [
          { id: "acc-a", siteName: "A" },
          { id: "acc-b", siteName: "B" },
        ],
      },
    })

    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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
      mockSendRedemptionAssistMessage.mock.calls.filter(
        ([type]) => type === RedemptionAssistMessageTypes.AutoRedeem,
      ),
    ).toHaveLength(0)
    expect(mockTrackProductAnalyticsActionCompleted).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.ConfirmRedemptionPrompt,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionPromptToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
      result: PRODUCT_ANALYTICS_RESULTS.Failure,
      errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      insights: {
        itemCount: 1,
        selectedCount: 1,
        successCount: 0,
        failureCount: 1,
      },
    })

    cleanup()
  })

  it("ignores empty context-menu selections and unregisters the listener on cleanup", async () => {
    const { setupRedemptionAssistContent } =
      await import("~/entrypoints/content/redemptionAssist")

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
    expect(mockSendRedemptionAssistMessage).not.toHaveBeenCalled()

    cleanup()

    expect(removeListener).toHaveBeenCalledWith(listener)
  })
})
