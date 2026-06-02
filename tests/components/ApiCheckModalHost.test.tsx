import {
  act,
  fireEvent,
  render as renderRtl,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import toast from "react-hot-toast/headless"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { ApiCheckModalHost } from "~/entrypoints/content/webAiApiCheck/components/ApiCheckModalHost"
import {
  API_CHECK_MODAL_CLOSED_EVENT,
  API_CHECK_MODAL_HOST_READY_EVENT,
  dispatchOpenApiCheckModal,
  type ApiCheckOpenModalDetail,
} from "~/entrypoints/content/webAiApiCheck/events"
import {
  getWebAiApiCheckProbeTestId,
  WEB_AI_API_CHECK_TEST_IDS,
} from "~/entrypoints/content/webAiApiCheck/testIds"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FAILURE_REASONS,
  PRODUCT_ANALYTICS_FAILURE_STAGES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { render } from "~~/tests/test-utils/render"

const {
  startProductAnalyticsActionMock,
  completeProductAnalyticsActionMock,
  updateWebAiApiCheckMock,
} = vi.hoisted(() => ({
  startProductAnalyticsActionMock: vi.fn(),
  completeProductAnalyticsActionMock: vi.fn(),
  updateWebAiApiCheckMock: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  resolveProductAnalyticsErrorCategoryFromError: (error: unknown) =>
    error &&
    typeof error === "object" &&
    (error as { statusCode?: unknown }).statusCode === 401
      ? PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth
      : PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
  startProductAnalyticsAction: startProductAnalyticsActionMock,
}))

vi.mock("~/services/preferences/userPreferences", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("~/services/preferences/userPreferences")
    >()
  return {
    ...actual,
    userPreferences: {
      ...actual.userPreferences,
      updateWebAiApiCheck: updateWebAiApiCheckMock,
    },
  }
})

vi.mock("react-hot-toast/headless", () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/utils/browser/browserApi")>()
  return {
    ...actual,
    sendRuntimeMessage: vi.fn(),
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

describe("ApiCheckModalHost", () => {
  const expectAnalyticsCallsToExcludeSensitiveValues = (
    values: readonly string[],
  ) => {
    const analyticsCalls = JSON.stringify([
      startProductAnalyticsActionMock.mock.calls,
      completeProductAnalyticsActionMock.mock.calls,
    ])

    for (const value of values) {
      expect(analyticsCalls).not.toContain(value)
    }
  }

  const expectTypedApiCheckMessage = (
    type: (typeof WebAiApiCheckMessageTypes)[keyof typeof WebAiApiCheckMessageTypes],
    data: Record<string, unknown>,
  ) => {
    expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(type, data)
  }

  beforeEach(() => {
    ;(toast.success as any).mockReset()
    ;(toast.error as any).mockReset()
    ;(toast.dismiss as any).mockReset()
    startProductAnalyticsActionMock.mockReset()
    completeProductAnalyticsActionMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    updateWebAiApiCheckMock.mockReset()
    updateWebAiApiCheckMock.mockResolvedValue(true)
    vi.mocked(sendRuntimeMessage).mockReset()
    vi.mocked(sendRuntimeMessage).mockResolvedValue({ success: false })
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        return { success: false }
      },
    )
  })

  const renderSubject = () =>
    render(<ApiCheckModalHost />, {
      withThemeProvider: false,
      withUserPreferencesProvider: false,
    })

  const openModal = async (
    detailOverrides?: Partial<ApiCheckOpenModalDetail>,
  ) => {
    const defaultDetail: ApiCheckOpenModalDetail = {
      sourceText: "",
      pageUrl: "https://example.com",
      trigger: "contextMenu",
    }

    const hostReady = new Promise<void>((resolve) => {
      window.addEventListener(
        API_CHECK_MODAL_HOST_READY_EVENT,
        () => resolve(),
        { once: true },
      )
    })

    renderSubject()
    await hostReady

    await act(async () => {
      dispatchOpenApiCheckModal({ ...defaultDetail, ...detailOverrides })
    })
  }

  it("opens with empty inputs for manual trigger without selection", async () => {
    await openModal()

    const modal = await screen.findByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
    expect(modal).toBeInTheDocument()

    const baseUrlInput = screen.getByPlaceholderText(
      "https://example.com/api",
    ) as HTMLInputElement
    const apiKeyInput = screen.getByPlaceholderText(
      "sk-...",
    ) as HTMLInputElement

    expect(baseUrlInput.value).toBe("")
    expect(apiKeyInput.value).toBe("")
  })

  it("tracks modal open with safe credential presence insights", async () => {
    const sourceText =
      "Base URL: https://proxy.example.com/api\nAPI Key: sk-test-open-fixture"
    const pageUrl = "https://console.example.com/settings?token=secret"

    await openModal({
      sourceText,
      pageUrl,
      trigger: "contextMenu",
    })

    await screen.findByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.ShowApiCredentialCheckModal,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          insights: {
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.ContextMenu,
            apiType: "openai-compatible",
            readyCount: 1,
            blockedCount: 0,
          },
        },
      )
    })
    expectAnalyticsCallsToExcludeSensitiveValues([
      sourceText,
      "sk-test-open-fixture",
      "https://proxy.example.com/api",
      pageUrl,
    ])
  })

  it("focuses the modal when opened so page shortcuts no longer use the previously focused page element", async () => {
    const pageInput = document.createElement("input")
    pageInput.setAttribute("aria-label", "Host page input")
    document.body.appendChild(pageInput)
    pageInput.focus()

    await openModal()

    const dialog = await screen.findByRole("dialog")

    expect(dialog).toHaveFocus()
    expect(document.activeElement).not.toBe(pageInput)

    pageInput.remove()
  })

  it("contains keyboard and wheel events inside the open modal", async () => {
    await openModal()

    const dialog = await screen.findByRole("dialog")
    const hostPageKeyDown = vi.fn()
    const hostPageKeyUp = vi.fn()
    const hostPageWheel = vi.fn()
    window.addEventListener("keydown", hostPageKeyDown)
    window.addEventListener("keyup", hostPageKeyUp)
    window.addEventListener("wheel", hostPageWheel)

    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "j", bubbles: true }),
    )
    dialog.dispatchEvent(
      new KeyboardEvent("keyup", { key: "j", bubbles: true }),
    )
    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    })
    dialog.dispatchEvent(wheelEvent)

    expect(hostPageKeyDown).not.toHaveBeenCalled()
    expect(hostPageKeyUp).not.toHaveBeenCalled()
    expect(hostPageWheel).not.toHaveBeenCalled()
    expect(wheelEvent.defaultPrevented).toBe(true)

    window.removeEventListener("keydown", hostPageKeyDown)
    window.removeEventListener("keyup", hostPageKeyUp)
    window.removeEventListener("wheel", hostPageWheel)
  })

  it("allows modal fields to receive keyboard input while host page shortcuts are blocked", async () => {
    const user = userEvent.setup()
    await openModal()

    const hostPageKeyDown = vi.fn()
    const hostPageKeyUp = vi.fn()
    window.addEventListener("keydown", hostPageKeyDown)
    window.addEventListener("keyup", hostPageKeyUp)

    const baseUrlInput = screen.getByPlaceholderText(
      "https://example.com/api",
    ) as HTMLInputElement
    await user.type(baseUrlInput, "https://api.example.com")

    expect(baseUrlInput.value).toBe("https://api.example.com")
    expect(hostPageKeyDown).not.toHaveBeenCalled()
    expect(hostPageKeyUp).not.toHaveBeenCalled()

    window.removeEventListener("keydown", hostPageKeyDown)
    window.removeEventListener("keyup", hostPageKeyUp)
  })

  it("blocks host page capture-phase shortcuts while the modal itself is focused", async () => {
    await openModal()

    const dialog = await screen.findByRole("dialog")
    const hostPageCaptureShortcut = vi.fn()
    document.addEventListener("keydown", hostPageCaptureShortcut, true)

    dialog.dispatchEvent(
      new KeyboardEvent("keydown", { key: "k", bubbles: true }),
    )

    expect(hostPageCaptureShortcut).not.toHaveBeenCalled()

    document.removeEventListener("keydown", hostPageCaptureShortcut, true)
  })

  it("allows wheel events inside the scrollable modal body without scrolling the host page", async () => {
    await openModal()

    const sourceTextInput = screen.getByPlaceholderText(
      "webAiApiCheck:modal.sourceText.placeholder",
    )
    const scrollContainer = sourceTextInput.closest(".overflow-y-auto")
    expect(scrollContainer).not.toBeNull()

    const hostPageWheel = vi.fn()
    window.addEventListener("wheel", hostPageWheel)

    const wheelEvent = new WheelEvent("wheel", {
      bubbles: true,
      cancelable: true,
      deltaY: 100,
    })
    scrollContainer?.dispatchEvent(wheelEvent)

    expect(hostPageWheel).not.toHaveBeenCalled()
    expect(wheelEvent.defaultPrevented).toBe(false)

    window.removeEventListener("wheel", hostPageWheel)
  })

  it("locks host page scrolling while open and restores previous overflow styles after close", async () => {
    const user = userEvent.setup()
    const previousHtmlOverflow = document.documentElement.style.overflow
    const previousBodyOverflow = document.body.style.overflow

    document.documentElement.style.overflow = "visible"
    document.body.style.overflow = "auto"

    try {
      await openModal()

      expect(document.documentElement.style.overflow).toBe("hidden")
      expect(document.body.style.overflow).toBe("hidden")

      await user.click(
        screen.getByRole("button", { name: "common:actions.close" }),
      )

      expect(document.documentElement.style.overflow).toBe("visible")
      expect(document.body.style.overflow).toBe("auto")
    } finally {
      document.documentElement.style.overflow = previousHtmlOverflow
      document.body.style.overflow = previousBodyOverflow
    }
  })

  it("dispatches a dismissed close event when closed before any fetch or probe result", async () => {
    const user = userEvent.setup()
    const closedDetailPromise = new Promise<any>((resolve) => {
      window.addEventListener(
        API_CHECK_MODAL_CLOSED_EVENT,
        (event) => resolve((event as CustomEvent).detail),
        { once: true },
      )
    })

    await openModal()

    await user.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )

    await expect(closedDetailPromise).resolves.toEqual({
      pageUrl: "https://example.com",
      trigger: "contextMenu",
      reason: "dismissed",
    })
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DismissDetectedApiCredentialCheck,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      {
        insights: {
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
        },
      },
    )
  })

  it("tracks auto-detected dismiss analytics as auto source without credential details", async () => {
    const user = userEvent.setup()
    const sourceText =
      "Base URL: https://proxy.example.com/api\nAPI Key: sk-test-auto-fixture"
    const pageUrl = "https://console.example.com/settings?token=secret"

    await openModal({
      sourceText,
      pageUrl,
      trigger: "autoDetect",
    })

    await user.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )

    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.DismissDetectedApiCredentialCheck,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      {
        insights: {
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Auto,
        },
      },
    )

    expectAnalyticsCallsToExcludeSensitiveValues([
      sourceText,
      "sk-test-auto-fixture",
      "https://proxy.example.com/api",
      pageUrl,
    ])
  })

  it("auto-extract fills baseUrl + apiKey from pasted text", async () => {
    const user = userEvent.setup()
    await openModal()

    const textarea = await screen.findByPlaceholderText(
      "webAiApiCheck:modal.sourceText.placeholder",
    )

    await user.click(textarea)
    await user.paste(
      "Base URL: https://proxy.example.com/api/v1\nAPI Key: sk-test-modal-input-fixture-12345",
    )

    const baseUrlInput = screen.getByPlaceholderText(
      "https://example.com/api",
    ) as HTMLInputElement
    const apiKeyInput = screen.getByPlaceholderText(
      "sk-...",
    ) as HTMLInputElement

    await waitFor(() => {
      expect(baseUrlInput.value).toBe("https://proxy.example.com/api")
      expect(apiKeyInput.value).toBe("sk-test-modal-input-fixture-12345")
    })
  })

  it("prefills cleaned enhanced values without showing an enhanced disclosure", async () => {
    const cleanedKey = "sk-testAa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1"

    await openModal({
      sourceText:
        "proxy.example.com/api/v1/chat/completions\nsk-testAa1Bb2Cc3Dd4Ee5Ff6Gg【删除这里]7Hh8Ii9Jj0Kk1",
      trigger: "autoDetect",
      extraction: {
        candidates: {
          baseUrls: [
            {
              value: "https://proxy.example.com/api",
              kind: "baseUrl",
              confidence: "enhancedHigh",
              reasons: ["bareDomain", "schemeAdded", "pathNormalized"],
              autoPromptEligible: true,
            },
          ],
          apiKeys: [
            {
              value: cleanedKey,
              kind: "apiKey",
              confidence: "standard",
              reasons: ["knownPrefix", "illegalCharsRemoved"],
              cleanupApplied: true,
              autoPromptEligible: true,
            },
          ],
        },
        summary: {
          hasEnhancedBaseUrl: true,
          hasEnhancedApiKey: false,
          hasCleanup: true,
          usesEnhancedResult: true,
          autoPromptEligible: false,
          enhancedAutoPromptEligible: true,
        },
      },
    } as any)

    await screen.findByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)
    expect(
      screen.queryByText("webAiApiCheck:modal.enhanced.title"),
    ).not.toBeInTheDocument()

    const apiKeyInput = screen.getByPlaceholderText(
      "sk-...",
    ) as HTMLInputElement
    expect(apiKeyInput.value).toBe(cleanedKey)
    expectAnalyticsCallsToExcludeSensitiveValues([cleanedKey])
  })

  it("allows selecting alternate extracted candidates", async () => {
    const user = userEvent.setup()

    await openModal({
      sourceText: "manual source",
      extraction: {
        candidates: {
          baseUrls: [
            {
              value: "https://first.example.com/api",
              kind: "baseUrl",
              confidence: "standard",
              reasons: ["labeled"],
              autoPromptEligible: true,
            },
            {
              value: "https://second.example.com/api",
              kind: "baseUrl",
              confidence: "enhancedHigh",
              reasons: ["bareDomain", "schemeAdded"],
              autoPromptEligible: true,
            },
          ],
          apiKeys: [
            {
              value: "sk-test-first-candidate-fixture",
              kind: "apiKey",
              confidence: "standard",
              reasons: ["knownPrefix"],
              autoPromptEligible: true,
            },
            {
              value: "test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
              kind: "apiKey",
              confidence: "enhancedHigh",
              reasons: ["unknownShortPrefix"],
              autoPromptEligible: true,
            },
          ],
        },
        summary: {
          hasEnhancedBaseUrl: true,
          hasEnhancedApiKey: true,
          hasCleanup: false,
          usesEnhancedResult: false,
          autoPromptEligible: true,
          enhancedAutoPromptEligible: true,
        },
      },
    } as any)

    await user.click(
      await screen.findByRole("button", {
        name: "https://second.example.com/api",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.candidates.apiKey 2",
      }),
    )

    expect(
      (
        screen.getByPlaceholderText(
          "https://example.com/api",
        ) as HTMLInputElement
      ).value,
    ).toBe("https://second.example.com/api")
    expect(
      (screen.getByPlaceholderText("sk-...") as HTMLInputElement).value,
    ).toBe("test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1")
  })

  it("does not expose raw API key candidate values in button attributes", async () => {
    const rawApiKey = "test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1"
    const longBaseUrl =
      "https://very-long-subdomain.example.com/api/compatible/v1"

    await openModal({
      sourceText: "manual source",
      extraction: {
        candidates: {
          baseUrls: [
            {
              value: "https://first.example.com/api",
              kind: "baseUrl",
              confidence: "standard",
              reasons: ["labeled"],
              autoPromptEligible: true,
            },
            {
              value: longBaseUrl,
              kind: "baseUrl",
              confidence: "enhancedHigh",
              reasons: ["bareDomain", "schemeAdded"],
              autoPromptEligible: true,
            },
          ],
          apiKeys: [
            {
              value: "sk-test-first-candidate-fixture",
              kind: "apiKey",
              confidence: "standard",
              reasons: ["knownPrefix"],
              autoPromptEligible: true,
            },
            {
              value: rawApiKey,
              kind: "apiKey",
              confidence: "enhancedHigh",
              reasons: ["unknownShortPrefix"],
              autoPromptEligible: true,
            },
          ],
        },
        summary: {
          hasEnhancedBaseUrl: true,
          hasEnhancedApiKey: true,
          hasCleanup: false,
          usesEnhancedResult: false,
          autoPromptEligible: true,
          enhancedAutoPromptEligible: true,
        },
      },
    } as any)

    const apiKeyCandidate = await screen.findByRole("button", {
      name: "webAiApiCheck:modal.candidates.apiKey 2",
    })
    const baseUrlCandidate = screen.getByRole("button", {
      name: longBaseUrl,
    })

    expect(apiKeyCandidate).not.toHaveTextContent(rawApiKey)
    expect(apiKeyCandidate).toHaveAccessibleName(
      "webAiApiCheck:modal.candidates.apiKey 2",
    )
    expect(apiKeyCandidate).not.toHaveAttribute("title", rawApiKey)
    expect(apiKeyCandidate.getAttribute("data-testid")).not.toContain(rawApiKey)
    expect(baseUrlCandidate).toHaveAttribute("title", longBaseUrl)
  })

  it("does not show enhanced disclosure for unselected enhanced alternates", async () => {
    await openModal({
      sourceText: "manual source",
      extraction: {
        candidates: {
          baseUrls: [
            {
              value: "https://standard.example.com/api",
              kind: "baseUrl",
              confidence: "standard",
              reasons: ["labeled"],
              autoPromptEligible: true,
            },
            {
              value: "https://enhanced.example.com/api",
              kind: "baseUrl",
              confidence: "enhancedHigh",
              reasons: ["bareDomain", "schemeAdded"],
              autoPromptEligible: true,
            },
          ],
          apiKeys: [
            {
              value: "sk-test-standard-fixture",
              kind: "apiKey",
              confidence: "standard",
              reasons: ["knownPrefix"],
              autoPromptEligible: true,
            },
            {
              value: "test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
              kind: "apiKey",
              confidence: "enhancedHigh",
              reasons: ["unknownShortPrefix"],
              autoPromptEligible: true,
            },
          ],
        },
        summary: {
          hasEnhancedBaseUrl: true,
          hasEnhancedApiKey: true,
          hasCleanup: false,
          usesEnhancedResult: false,
          autoPromptEligible: true,
          enhancedAutoPromptEligible: true,
        },
      },
    } as any)

    await screen.findByTestId(WEB_AI_API_CHECK_TEST_IDS.modal)

    expect(
      screen.queryByText("webAiApiCheck:modal.enhanced.title"),
    ).not.toBeInTheDocument()
  })

  it("keeps enhanced disclosure hidden when selecting enhanced alternates", async () => {
    const user = userEvent.setup()

    await openModal({
      sourceText: "manual source",
      extraction: {
        candidates: {
          baseUrls: [
            {
              value: "https://standard.example.com/api",
              kind: "baseUrl",
              confidence: "standard",
              reasons: ["labeled"],
              autoPromptEligible: true,
            },
            {
              value: "https://enhanced.example.com/api",
              kind: "baseUrl",
              confidence: "enhancedHigh",
              reasons: ["bareDomain", "schemeAdded"],
              autoPromptEligible: true,
            },
          ],
          apiKeys: [
            {
              value: "sk-test-standard-fixture",
              kind: "apiKey",
              confidence: "standard",
              reasons: ["knownPrefix"],
              autoPromptEligible: true,
            },
            {
              value: "test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
              kind: "apiKey",
              confidence: "enhancedHigh",
              reasons: ["unknownShortPrefix"],
              autoPromptEligible: true,
            },
          ],
        },
        summary: {
          hasEnhancedBaseUrl: true,
          hasEnhancedApiKey: true,
          hasCleanup: false,
          usesEnhancedResult: false,
          autoPromptEligible: true,
          enhancedAutoPromptEligible: true,
        },
      },
    } as any)

    expect(
      screen.queryByText("webAiApiCheck:modal.enhanced.title"),
    ).not.toBeInTheDocument()

    await user.click(
      await screen.findByRole("button", {
        name: "https://enhanced.example.com/api",
      }),
    )
    await user.click(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.candidates.apiKey 2",
      }),
    )

    expect(
      screen.queryByText("webAiApiCheck:modal.enhanced.title"),
    ).not.toBeInTheDocument()
  })

  it("tracks modal open readiness from extraction metadata selected values", async () => {
    await openModal({
      sourceText: "metadata only",
      trigger: "autoDetect",
      extraction: {
        candidates: {
          baseUrls: [
            {
              value: "https://metadata.example.com/api",
              kind: "baseUrl",
              confidence: "enhancedHigh",
              reasons: ["bareDomain", "schemeAdded"],
              autoPromptEligible: true,
            },
          ],
          apiKeys: [
            {
              value: "test-Aa1Bb2Cc3Dd4Ee5Ff6Gg7Hh8Ii9Jj0Kk1",
              kind: "apiKey",
              confidence: "enhancedHigh",
              reasons: ["unknownShortPrefix"],
              autoPromptEligible: true,
            },
          ],
        },
        summary: {
          hasEnhancedBaseUrl: true,
          hasEnhancedApiKey: true,
          hasCleanup: false,
          usesEnhancedResult: true,
          autoPromptEligible: false,
          enhancedAutoPromptEligible: true,
        },
      },
    } as any)

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        expect.objectContaining({
          insights: expect.objectContaining({
            readyCount: 1,
            blockedCount: 0,
          }),
        }),
      )
    })
  })

  it("auto-fetches models and preselects the first model id", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["m1", "m2"] }
        }
        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-modal-save-fixture-12345")

    await waitFor(() => {
      expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.FetchModels, {
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-test-modal-save-fixture-12345",
      })
    })

    await waitFor(() => {
      expect(
        screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
      ).toHaveTextContent("m1")
    })

    await user.click(screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId))
    await user.click(await screen.findByText("m2"))

    await waitFor(() => {
      expect(
        screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
      ).toHaveTextContent("m2")
    })
  })

  it("tracks automatic model fetch completion with safe api type and model-count insights", async () => {
    const sourceText =
      "Base URL: https://proxy.example.com/api\nAPI Key: sk-test-auto-model-fixture"
    const pageUrl = "https://console.example.com/settings?token=secret"
    const modelId = "gpt-4o-sensitive"

    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [modelId, "gpt-4o-mini"] }
        }
        return { success: false }
      },
    )

    await openModal({
      sourceText,
      pageUrl,
      trigger: "autoDetect",
    })

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.AutoFetchApiCredentialModelList,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          diagnostics: {
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Auto,
              apiType: "openai-compatible",
            },
            outcome: {
              modelCount: 2,
            },
          },
        },
      )
    })
    expectAnalyticsCallsToExcludeSensitiveValues([
      sourceText,
      "sk-test-auto-model-fixture",
      "https://proxy.example.com/api",
      pageUrl,
      modelId,
    ])
  })

  it("tracks manual model fetch completion with model-count insights", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["m1", "m2"] }
        }
        return { success: false }
      },
    )

    await openModal()

    await user.type(
      await screen.findByPlaceholderText("https://example.com/api"),
      "https://proxy.example.com/api",
    )
    await user.type(
      await screen.findByPlaceholderText("sk-..."),
      "sk-test-secret-fixture",
    )

    await user.click(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.actions.fetchModels",
      }),
    )

    await waitFor(() => {
      expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
        featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.FetchApiCredentialModelList,
        surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
        entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
      })
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
        {
          diagnostics: {
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
              apiType: "openai-compatible",
            },
            outcome: {
              modelCount: 2,
            },
          },
        },
      )
    })
  })

  it("does not start an automatic duplicate while a model fetch is in flight", async () => {
    let resolveFetch!: (value: { success: true; modelIds: string[] }) => void
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation((type: any) => {
      if (type === WebAiApiCheckMessageTypes.FetchModels) {
        return new Promise((resolve) => {
          resolveFetch = resolve
        })
      }
      return Promise.resolve({ success: false })
    })

    await openModal({
      sourceText: "",
    })

    fireEvent.change(
      await screen.findByPlaceholderText("https://example.com/api"),
      {
        target: { value: "https://proxy.example.com/api" },
      },
    )
    fireEvent.change(await screen.findByPlaceholderText("sk-..."), {
      target: { value: "sk-test-dedupe-fixture" },
    })
    fireEvent.click(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.actions.fetchModels",
      }),
    )

    await waitFor(() => {
      expect(sendWebAiApiCheckMessage).toHaveBeenCalledTimes(1)
    })

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(sendWebAiApiCheckMessage).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveFetch({ success: true, modelIds: ["m1"] })
    })
  })

  it("does not refetch for unchanged trimmed credentials until the modal is reopened", async () => {
    const user = userEvent.setup()
    const detail: ApiCheckOpenModalDetail = {
      sourceText:
        "Base URL: https://proxy.example.com/api\nAPI Key: sk-test-secret-fixture",
      pageUrl: "https://example.com",
      trigger: "contextMenu",
    }

    await openModal(detail)

    await waitFor(() => {
      expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.FetchModels, {
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-test-secret-fixture",
      })
    })
    expect(sendWebAiApiCheckMessage).toHaveBeenCalledTimes(1)

    const baseUrlInput = screen.getByPlaceholderText(
      "https://example.com/api",
    ) as HTMLInputElement

    await user.type(baseUrlInput, "  ")

    await waitFor(() => {
      expect(sendWebAiApiCheckMessage).toHaveBeenCalledTimes(1)
    })

    await user.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )

    await act(async () => {
      dispatchOpenApiCheckModal(detail)
    })

    await waitFor(() => {
      expect(sendWebAiApiCheckMessage).toHaveBeenCalledTimes(2)
    })
  })

  it("switches api types, clears stale probe results, and refetches provider models", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return {
            success: true,
            modelIds:
              message.apiType === "anthropic"
                ? ["claude-3-5-sonnet"]
                : ["gpt-4o-mini"],
          }
        }

        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          return {
            success: true,
            result: {
              id: message.probeId,
              status: "pass",
              latencyMs: 5,
              summary: "OpenAI result",
            },
          }
        }

        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    await waitFor(() => {
      expect(
        screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
      ).toHaveTextContent("gpt-4o-mini")
    })

    const probeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )
    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )

    expect(await within(probeCard).findByText("OpenAI result")).toBeVisible()

    await user.selectOptions(
      screen.getByDisplayValue("OpenAI-compatible"),
      "anthropic",
    )

    await waitFor(() => {
      expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.FetchModels, {
        apiType: "anthropic",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-test-secret-fixture",
      })
    })

    await waitFor(() => {
      expect(
        screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
      ).toHaveTextContent("claude-3-5-sonnet")
    })
    expect(screen.queryByText("OpenAI result")).not.toBeInTheDocument()
  })

  it("tracks stale model fetch responses as skipped diagnostics", async () => {
    const user = userEvent.setup()
    let resolveFirstFetch!: (value: {
      success: true
      modelIds: string[]
    }) => void
    let resolveSecondFetch!: (value: {
      success: true
      modelIds: string[]
    }) => void
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          if (message.apiType === "openai-compatible" && !resolveFirstFetch) {
            return new Promise((resolve) => {
              resolveFirstFetch = resolve
            })
          }

          return new Promise((resolve) => {
            resolveSecondFetch = resolve
          })
        }

        return Promise.resolve({ success: false })
      },
    )

    await openModal()

    await user.type(
      await screen.findByPlaceholderText("https://example.com/api"),
      "https://proxy.example.com/api",
    )
    await user.type(
      await screen.findByPlaceholderText("sk-..."),
      "sk-test-secret-fixture",
    )

    await waitFor(() => {
      expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
        WebAiApiCheckMessageTypes.FetchModels,
        expect.objectContaining({
          apiType: "openai-compatible",
        }),
      )
    })

    await user.type(await screen.findByPlaceholderText("sk-..."), "-rotated")

    await waitFor(() => {
      expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
        WebAiApiCheckMessageTypes.FetchModels,
        expect.objectContaining({
          apiKey: "sk-test-secret-fixture-rotated",
        }),
      )
    })

    await act(async () => {
      resolveFirstFetch({ success: true, modelIds: ["stale-private-model"] })
    })

    await act(async () => {
      resolveSecondFetch({ success: true, modelIds: ["fresh-private-model"] })
    })

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
        {
          diagnostics: {
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Auto,
              apiType: "openai-compatible",
            },
            execution: {
              staleResponseIgnored: true,
            },
            outcome: {
              modelCount: 0,
              skippedCount: 1,
            },
            failure: {
              category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
              stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
              reason: PRODUCT_ANALYTICS_FAILURE_REASONS.StaleResponseIgnored,
            },
          },
        },
      )
    })
    expectAnalyticsCallsToExcludeSensitiveValues(["stale-private-model"])
  })

  it("clears auto-fetch loading when credentials become incomplete before a stale response resolves", async () => {
    const user = userEvent.setup()
    let resolveFetch!: (value: { success: true; modelIds: string[] }) => void
    let fetchRequestCount = 0
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation((type: any) => {
      if (type === WebAiApiCheckMessageTypes.FetchModels) {
        fetchRequestCount += 1
        return new Promise((resolve) => {
          resolveFetch = resolve
        })
      }

      return Promise.resolve({ success: false })
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.type(baseUrlInput, "https://proxy.example.com/api")
    await user.type(apiKeyInput, "sk-test-secret-fixture")

    await waitFor(() => {
      expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
        WebAiApiCheckMessageTypes.FetchModels,
        expect.any(Object),
      )
    })
    expect(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.actions.fetchingModels",
      }),
    ).toBeDisabled()

    await user.clear(apiKeyInput)

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "webAiApiCheck:modal.actions.fetchModels",
        }),
      ).toBeEnabled()
    })

    const fetchCountAfterClear = fetchRequestCount

    await act(async () => {
      resolveFetch({ success: true, modelIds: ["stale-private-model"] })
    })

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Skipped,
        expect.objectContaining({
          diagnostics: expect.objectContaining({
            execution: { staleResponseIgnored: true },
          }),
        }),
      )
    })
    expect(screen.queryByText("stale-private-model")).not.toBeInTheDocument()

    await user.paste("sk-test-secret-fixture")

    await waitFor(() => {
      expect(fetchRequestCount).toBeGreaterThan(fetchCountAfterClear)
    })
  })

  it("tracks single unsupported probe completion as skipped", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }

        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          return {
            success: true,
            result: {
              id: message.probeId,
              status: "unsupported",
              latencyMs: 0,
              summary: "Streaming is not supported",
            },
          }
        }

        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    const probeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )

    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )

    expect(
      await within(probeCard).findByText("Streaming is not supported"),
    ).toBeInTheDocument()
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunApiCredentialProbe,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      {
        insights: {
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          apiType: "openai-compatible",
          mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        },
      },
    )
  })

  it("maps structured probe HTTP status to an auth analytics failure", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }

        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          return {
            success: true,
            result: {
              id: message.probeId,
              status: "fail",
              latencyMs: 0,
              summary: "Request failed",
              output: { inferredHttpStatus: 401 },
            },
          }
        }

        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    const probeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )

    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        expect.objectContaining({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
        }),
      )
    })
  })

  it("tracks successful individual probe with fixed source/mode and no credential details", async () => {
    const user = userEvent.setup()
    const sourceText =
      "Base URL: https://proxy.example.com/api\nAPI Key: sk-test-secret-fixture"
    const pageUrl = "https://console.example.com/settings?token=secret"
    const baseUrl = "https://proxy.example.com/api"
    const apiKey = "sk-test-secret-fixture"
    const modelId = "gpt-4o-sensitive"

    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [modelId] }
        }

        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          return {
            success: true,
            result: {
              id: message.probeId,
              status: "pass",
              latencyMs: 5,
              summary: "Probe OK",
            },
          }
        }

        return { success: false }
      },
    )

    await openModal({
      sourceText,
      pageUrl,
      trigger: "contextMenu",
    })

    await waitFor(() => {
      expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.FetchModels, {
        apiType: "openai-compatible",
        baseUrl,
        apiKey,
      })
      expect(
        screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
      ).toHaveTextContent(modelId)
    })

    const probeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )

    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )

    expect(await within(probeCard).findByText("Probe OK")).toBeInTheDocument()
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunApiCredentialProbe,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: expect.objectContaining({
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          apiType: "openai-compatible",
          mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        }),
      },
    )

    expectAnalyticsCallsToExcludeSensitiveValues([
      sourceText,
      apiKey,
      baseUrl,
      pageUrl,
      modelId,
    ])
  })

  it("test displays sanitized errors returned from background", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          return {
            success: true,
            result: {
              id: message.probeId,
              status: "fail",
              latencyMs: 0,
              summary: "Unauthorized: [REDACTED]",
            },
          }
        }
        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    const probeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )

    await user.click(
      await screen.findByText("webAiApiCheck:modal.actions.test"),
    )

    expect(
      await within(probeCard).findByText("Unauthorized: [REDACTED]"),
    ).toBeInTheDocument()
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunApiCredentialProbeSuite,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
        insights: {
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          apiType: "openai-compatible",
          mode: PRODUCT_ANALYTICS_MODE_IDS.All,
          itemCount: 5,
          successCount: 0,
          failureCount: 5,
          skippedCount: 0,
        },
      },
    )
  })

  it("falls back to the local probe error when the background probe call throws", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          throw new Error("probe transport failed")
        }
        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    const probeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )

    await user.click(
      await screen.findByText("webAiApiCheck:modal.actions.test"),
    )

    expect(
      await within(probeCard).findByText(
        "webAiApiCheck:modal.errors.runProbeFailed",
      ),
    ).toBeInTheDocument()
  })

  it("uses background validation category for probe-suite analytics", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          return {
            success: false,
            error: "Invalid baseUrl",
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          }
        }
        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    await user.click(
      await screen.findByText("webAiApiCheck:modal.actions.test"),
    )

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        expect.objectContaining({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          insights: expect.objectContaining({
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            apiType: "openai-compatible",
            mode: PRODUCT_ANALYTICS_MODE_IDS.All,
          }),
        }),
      )
    })
  })

  it("saves credentials to API profiles", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          return {
            success: true,
            result: {
              id: message.probeId,
              status: "pass",
              latencyMs: 1,
              summary: "OK",
            },
          }
        }
        if (type === WebAiApiCheckMessageTypes.SaveProfile) {
          return {
            success: true,
            profileId: "p-1",
            name: "proxy.example.com",
            apiType: message.apiType,
            baseUrl: "https://proxy.example.com/api",
          }
        }
        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    await waitFor(() => {
      expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.FetchModels, {
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-test-secret-fixture",
      })
    })

    const saveButton = await screen.findByRole("button", {
      name: "webAiApiCheck:modal.actions.saveToProfiles",
    })

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled()
    })

    await user.click(saveButton)

    await waitFor(() => {
      expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.SaveProfile, {
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-test-secret-fixture",
        pageUrl: "https://example.com",
      })
    })
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CreateApiCredentialProfile,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          apiType: "openai-compatible",
        },
      },
    )
  })

  it("shows a quick-open button after saving to profiles", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        if (type === WebAiApiCheckMessageTypes.SaveProfile) {
          return {
            success: true,
            profileId: "p-1",
            name: "proxy.example.com",
            apiType: message.apiType,
            baseUrl: "https://proxy.example.com/api",
          }
        }
        return { success: false }
      },
    )
    vi.mocked(sendRuntimeMessage).mockResolvedValue({ success: true })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    const saveButton = await screen.findByRole("button", {
      name: "webAiApiCheck:modal.actions.saveToProfiles",
    })

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled()
    })

    await user.click(saveButton)

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled()
    })

    const toastRenderer = (toast.success as any).mock.calls[0]?.[0]
    expect(toastRenderer).toEqual(expect.any(Function))

    const toastInstance = { id: "toast-1" } as any
    const { container: toastContainer } = renderRtl(
      toastRenderer(toastInstance),
    )

    await user.click(
      within(toastContainer).getByRole("button", {
        name: "webAiApiCheck:modal.actions.openApiProfiles",
      }),
    )

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.OpenSettingsApiCredentialProfiles,
    })
    expect(toast.dismiss).toHaveBeenCalledWith("toast-1")
  })

  it("still dismisses the success toast when opening profiles from the toast fails", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        if (type === WebAiApiCheckMessageTypes.SaveProfile) {
          return {
            success: true,
            profileId: "p-1",
            name: "proxy.example.com",
            apiType: message.apiType,
            baseUrl: "https://proxy.example.com/api",
          }
        }
        return { success: false }
      },
    )
    vi.mocked(sendRuntimeMessage).mockRejectedValue(
      new Error("settings page failed"),
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    const saveButton = await screen.findByRole("button", {
      name: "webAiApiCheck:modal.actions.saveToProfiles",
    })

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled()
    })

    await user.click(saveButton)

    await waitFor(() => {
      expect(toast.success).toHaveBeenCalled()
    })

    const toastRenderer = (toast.success as any).mock.calls[0]?.[0]
    expect(toastRenderer).toEqual(expect.any(Function))

    const toastInstance = { id: "toast-open-settings-fail" } as any
    const { container: toastContainer } = renderRtl(
      toastRenderer(toastInstance),
    )

    await user.click(
      within(toastContainer).getByRole("button", {
        name: "webAiApiCheck:modal.actions.openApiProfiles",
      }),
    )

    await act(async () => {
      await Promise.resolve()
    })

    expect(sendRuntimeMessage).toHaveBeenCalledWith({
      action: RuntimeActionIds.OpenSettingsApiCredentialProfiles,
    })
    expect(toast.dismiss).toHaveBeenCalledWith("toast-open-settings-fail")
  })

  it("falls back to the local save-profile error when the background call throws", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        if (type === WebAiApiCheckMessageTypes.SaveProfile) {
          throw new Error("save exploded")
        }
        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    const saveButton = await screen.findByRole("button", {
      name: "webAiApiCheck:modal.actions.saveToProfiles",
    })

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled()
    })

    await user.click(saveButton)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "webAiApiCheck:modal.errors.saveToProfilesFailed",
      )
    })
  })

  it("allows saving credentials while tests are running", async () => {
    const user = userEvent.setup()

    let resolveModelsProbe: ((value: any) => void) | null = null

    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }

        if (
          type === WebAiApiCheckMessageTypes.RunProbe &&
          message.probeId === "models"
        ) {
          return await new Promise<any>((resolve) => {
            resolveModelsProbe = resolve
          })
        }

        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          return {
            success: true,
            result: {
              id: message.probeId,
              status: "pass",
              latencyMs: 1,
              summary: "OK",
            },
          }
        }

        if (type === WebAiApiCheckMessageTypes.SaveProfile) {
          return {
            success: true,
            profileId: "p-1",
            name: "proxy.example.com",
            apiType: message.apiType,
            baseUrl: message.baseUrl,
          }
        }

        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    const saveButton = await screen.findByRole("button", {
      name: "webAiApiCheck:modal.actions.saveToProfiles",
    })

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled()
    })

    await user.click(
      await screen.findByText("webAiApiCheck:modal.actions.test"),
    )

    await waitFor(() => {
      expect(typeof resolveModelsProbe).toBe("function")
      expect(saveButton).not.toBeDisabled()
    })

    const resolveProbe = resolveModelsProbe as ((value: any) => void) | null
    if (!resolveProbe) {
      throw new Error("Expected models probe resolver to be available")
    }

    resolveProbe({
      success: true,
      result: {
        id: "models",
        status: "pass",
        latencyMs: 1,
        summary: "OK",
      },
    })

    await user.click(saveButton)

    await waitFor(() => {
      expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.SaveProfile, {
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-test-secret-fixture",
        pageUrl: "https://example.com",
      })
    })
  })

  it("falls back to the local probe error when background returns no result payload", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          return { success: false }
        }
        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    const probeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )

    await user.click(
      await screen.findByText("webAiApiCheck:modal.actions.test"),
    )

    expect(
      await within(probeCard).findByText(
        "webAiApiCheck:modal.errors.runProbeFailed",
      ),
    ).toBeInTheDocument()
  })

  it("shows validation error instead of fetching models without credentials", async () => {
    const user = userEvent.setup()

    await openModal()

    await user.click(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.actions.fetchModels",
      }),
    )

    expect(
      await screen.findByText("webAiApiCheck:modal.errors.missingBaseUrlOrKey"),
    ).toBeInTheDocument()
    expect(sendWebAiApiCheckMessage).not.toHaveBeenCalled()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      expect.objectContaining({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        diagnostics: expect.objectContaining({
          context: {
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            apiType: "openai-compatible",
          },
          outcome: {
            modelCount: 0,
          },
          failure: {
            category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
            stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Validation,
            reason: PRODUCT_ANALYTICS_FAILURE_REASONS.MissingCredentials,
          },
        }),
      }),
    )
  })

  it("shows validation error instead of running a probe without credentials", async () => {
    const user = userEvent.setup()

    await openModal()

    const probeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )

    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )

    expect(
      await screen.findByText("webAiApiCheck:modal.errors.missingBaseUrlOrKey"),
    ).toBeInTheDocument()
    expect(sendWebAiApiCheckMessage).not.toHaveBeenCalled()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      expect.objectContaining({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        insights: expect.objectContaining({
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          apiType: "openai-compatible",
          mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        }),
      }),
    )
  })

  it("falls back to local fetch-models error when background returns no message", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: false }
        }
        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    expect(
      await screen.findByText("webAiApiCheck:modal.errors.fetchModelsFailed"),
    ).toBeInTheDocument()
  })

  it("shows a local fetch-models error when the background request rejects", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          throw new Error("runtime unavailable")
        }
        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    expect(
      await screen.findByText("webAiApiCheck:modal.errors.fetchModelsFailed"),
    ).toBeInTheDocument()
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
      }),
    )
  })

  it("uses background validation category for model fetch analytics", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return {
            success: false,
            error: "Invalid baseUrl",
            errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          }
        }
        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        expect.objectContaining({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
          diagnostics: expect.objectContaining({
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Auto,
              apiType: "openai-compatible",
            },
            outcome: {
              modelCount: 0,
            },
            failure: {
              category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
              stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
              reason: PRODUCT_ANALYTICS_FAILURE_REASONS.Unknown,
            },
          }),
        }),
      )
    })
  })

  it("classifies sanitized background model-fetch messages locally", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return {
            success: false,
            error: "Session expired for sanitized account",
          }
        }
        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        expect.objectContaining({
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
          diagnostics: expect.objectContaining({
            context: {
              sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Auto,
              apiType: "openai-compatible",
            },
            outcome: {
              modelCount: 0,
            },
            failure: {
              category: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Auth,
              stage: PRODUCT_ANALYTICS_FAILURE_STAGES.Execute,
              reason: PRODUCT_ANALYTICS_FAILURE_REASONS.SessionExpired,
            },
          }),
        }),
      )
    })
    expectAnalyticsCallsToExcludeSensitiveValues([
      "Session expired for sanitized account",
      "sk-test-secret-fixture",
      "https://proxy.example.com/api",
    ])
  })

  it("falls back to local save-profile error when background returns no message", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        if (type === WebAiApiCheckMessageTypes.SaveProfile) {
          return { success: false }
        }
        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    const saveButton = await screen.findByRole("button", {
      name: "webAiApiCheck:modal.actions.saveToProfiles",
    })

    await waitFor(() => {
      expect(saveButton).not.toBeDisabled()
    })

    await user.click(saveButton)

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "webAiApiCheck:modal.errors.saveToProfilesFailed",
      )
    })
  })

  it("dispatches a completed close event after a probe result succeeds without fetched models", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          return {
            success: true,
            result: {
              id: message.probeId,
              status: "pass",
              latencyMs: 5,
              summary: "Probe OK",
            },
          }
        }
        return { success: false }
      },
    )

    const closedDetailPromise = new Promise<any>((resolve) => {
      window.addEventListener(
        API_CHECK_MODAL_CLOSED_EVENT,
        (event) => resolve((event as CustomEvent).detail),
        { once: true },
      )
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    const probeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )

    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )

    expect(await within(probeCard).findByText("Probe OK")).toBeInTheDocument()

    await user.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )

    await expect(closedDetailPromise).resolves.toEqual({
      pageUrl: "https://example.com",
      trigger: "contextMenu",
      reason: "completed",
    })
  })

  it("dispatches a completed close event after model fetch succeeds", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["gpt-4o-mini"] }
        }
        return { success: false }
      },
    )

    const closedDetailPromise = new Promise<any>((resolve) => {
      window.addEventListener(
        API_CHECK_MODAL_CLOSED_EVENT,
        (event) => resolve((event as CustomEvent).detail),
        { once: true },
      )
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")

    await waitFor(() => {
      expect(
        screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
      ).toHaveTextContent("gpt-4o-mini")
    })

    await user.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )

    await expect(closedDetailPromise).resolves.toEqual({
      pageUrl: "https://example.com",
      trigger: "contextMenu",
      reason: "completed",
    })
  })
})
