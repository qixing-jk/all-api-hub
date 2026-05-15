import {
  act,
  render as renderRtl,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
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
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_MODE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { render } from "~~/tests/test-utils/render"

const { startProductAnalyticsActionMock, completeProductAnalyticsActionMock } =
  vi.hoisted(() => ({
    startProductAnalyticsActionMock: vi.fn(),
    completeProductAnalyticsActionMock: vi.fn(),
  }))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startProductAnalyticsActionMock,
}))

vi.mock("~/contexts/UserPreferencesContext", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("~/contexts/UserPreferencesContext")>()
  return {
    ...actual,
    UserPreferencesProvider: ({ children }: { children: ReactNode }) =>
      children,
    useUserPreferencesContext: () => ({
      themeMode: "system",
      updateThemeMode: vi.fn().mockResolvedValue(true),
    }),
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

describe("ApiCheckModalHost", () => {
  beforeEach(() => {
    ;(toast.success as any).mockReset()
    ;(toast.error as any).mockReset()
    ;(toast.dismiss as any).mockReset()
    startProductAnalyticsActionMock.mockReset()
    completeProductAnalyticsActionMock.mockReset()
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }
      return { success: false }
    })
  })

  const renderSubject = () => render(<ApiCheckModalHost />)

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

    const modal = await screen.findByTestId("api-check-modal")
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
      "Base URL: https://proxy.example.com/api\nAPI Key: sk-auto-secret"
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

    const analyticsCalls = JSON.stringify([
      startProductAnalyticsActionMock.mock.calls,
      completeProductAnalyticsActionMock.mock.calls,
    ])
    expect(analyticsCalls).not.toContain(sourceText)
    expect(analyticsCalls).not.toContain("sk-auto-secret")
    expect(analyticsCalls).not.toContain("https://proxy.example.com/api")
    expect(analyticsCalls).not.toContain(pageUrl)
  })

  it("auto-extract fills baseUrl + apiKey from pasted text", async () => {
    const user = userEvent.setup()
    await openModal()

    const textarea = await screen.findByPlaceholderText(
      "webAiApiCheck:modal.sourceText.placeholder",
    )

    await user.click(textarea)
    await user.paste(
      "Base URL: https://proxy.example.com/api/v1\nAPI Key: sk-abcdef1234567890",
    )

    const baseUrlInput = screen.getByPlaceholderText(
      "https://example.com/api",
    ) as HTMLInputElement
    const apiKeyInput = screen.getByPlaceholderText(
      "sk-...",
    ) as HTMLInputElement

    await waitFor(() => {
      expect(baseUrlInput.value).toBe("https://proxy.example.com/api")
      expect(apiKeyInput.value).toBe("sk-abcdef1234567890")
    })
  })

  it("auto-fetches models and preselects the first model id", async () => {
    const user = userEvent.setup()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: ["m1", "m2"] }
      }
      return { success: false }
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-abcdef1234567890")

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ApiCheckFetchModels,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-abcdef1234567890",
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId("api-check-model-id")).toHaveTextContent("m1")
    })

    await user.click(screen.getByTestId("api-check-model-id"))
    await user.click(await screen.findByText("m2"))

    await waitFor(() => {
      expect(screen.getByTestId("api-check-model-id")).toHaveTextContent("m2")
    })
  })

  it("tracks manual model fetch completion with model-count insights", async () => {
    const user = userEvent.setup()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: ["m1", "m2"] }
      }
      return { success: false }
    })

    await openModal()

    await user.type(
      await screen.findByPlaceholderText("https://example.com/api"),
      "https://proxy.example.com/api",
    )
    await user.type(await screen.findByPlaceholderText("sk-..."), "sk-secret")

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
          insights: {
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            modelCount: 2,
          },
        },
      )
    })
  })

  it("does not refetch for unchanged trimmed credentials until the modal is reopened", async () => {
    const user = userEvent.setup()
    const detail: ApiCheckOpenModalDetail = {
      sourceText:
        "Base URL: https://proxy.example.com/api\nAPI Key: sk-secret-xyz",
      pageUrl: "https://example.com",
      trigger: "contextMenu",
    }

    await openModal(detail)

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ApiCheckFetchModels,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-secret-xyz",
      })
    })
    expect(sendRuntimeMessage).toHaveBeenCalledTimes(1)

    const baseUrlInput = screen.getByPlaceholderText(
      "https://example.com/api",
    ) as HTMLInputElement

    await user.type(baseUrlInput, "  ")

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledTimes(1)
    })

    await user.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )

    await act(async () => {
      dispatchOpenApiCheckModal(detail)
    })

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledTimes(2)
    })
  })

  it("switches api types, clears stale probe results, and refetches provider models", async () => {
    const user = userEvent.setup()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return {
          success: true,
          modelIds:
            message.apiType === "anthropic"
              ? ["claude-3-5-sonnet"]
              : ["gpt-4o-mini"],
        }
      }

      if (message.action === RuntimeActionIds.ApiCheckRunProbe) {
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
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-secret-xyz")

    await waitFor(() => {
      expect(screen.getByTestId("api-check-model-id")).toHaveTextContent(
        "gpt-4o-mini",
      )
    })

    const probeCard = await screen.findByTestId(
      "api-check-probe-text-generation",
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
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ApiCheckFetchModels,
        apiType: "anthropic",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-secret-xyz",
      })
    })

    await waitFor(() => {
      expect(screen.getByTestId("api-check-model-id")).toHaveTextContent(
        "claude-3-5-sonnet",
      )
    })
    expect(screen.queryByText("OpenAI result")).not.toBeInTheDocument()
  })

  it("tracks single unsupported probe completion as skipped", async () => {
    const user = userEvent.setup()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }

      if (message.action === RuntimeActionIds.ApiCheckRunProbe) {
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
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-secret-xyz")

    const probeCard = await screen.findByTestId(
      "api-check-probe-text-generation",
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
          mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        },
      },
    )
  })

  it("tracks successful individual probe with fixed source/mode and no credential details", async () => {
    const user = userEvent.setup()
    const sourceText =
      "Base URL: https://proxy.example.com/api\nAPI Key: sk-secret-xyz"
    const pageUrl = "https://console.example.com/settings?token=secret"
    const baseUrl = "https://proxy.example.com/api"
    const apiKey = "sk-secret-xyz"
    const modelId = "gpt-4o-sensitive"

    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [modelId] }
      }

      if (message.action === RuntimeActionIds.ApiCheckRunProbe) {
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
    })

    await openModal({
      sourceText,
      pageUrl,
      trigger: "contextMenu",
    })

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ApiCheckFetchModels,
        apiType: "openai-compatible",
        baseUrl,
        apiKey,
      })
      expect(screen.getByTestId("api-check-model-id")).toHaveTextContent(
        modelId,
      )
    })

    const probeCard = await screen.findByTestId(
      "api-check-probe-text-generation",
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
          mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
        }),
      },
    )

    const analyticsCalls = JSON.stringify([
      startProductAnalyticsActionMock.mock.calls,
      completeProductAnalyticsActionMock.mock.calls,
    ])
    expect(analyticsCalls).not.toContain(sourceText)
    expect(analyticsCalls).not.toContain(apiKey)
    expect(analyticsCalls).not.toContain(baseUrl)
    expect(analyticsCalls).not.toContain(pageUrl)
    expect(analyticsCalls).not.toContain(modelId)
  })

  it("test displays sanitized errors returned from background", async () => {
    const user = userEvent.setup()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }
      if (message.action === RuntimeActionIds.ApiCheckRunProbe) {
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
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-secret-xyz")

    const probeCard = await screen.findByTestId(
      "api-check-probe-text-generation",
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
          mode: PRODUCT_ANALYTICS_MODE_IDS.All,
          itemCount: 5,
          successCount: 0,
          failureCount: 5,
        },
      },
    )
  })

  it("falls back to the local probe error when the background probe call throws", async () => {
    const user = userEvent.setup()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }
      if (message.action === RuntimeActionIds.ApiCheckRunProbe) {
        throw new Error("probe transport failed")
      }
      return { success: false }
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-secret-xyz")

    const probeCard = await screen.findByTestId(
      "api-check-probe-text-generation",
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

  it("saves credentials to API profiles", async () => {
    const user = userEvent.setup()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }
      if (message.action === RuntimeActionIds.ApiCheckRunProbe) {
        return {
          success: true,
          result: {
            id: message.probeId,
            status: "success",
            latencyMs: 1,
            summary: "OK",
          },
        }
      }
      if (message.action === RuntimeActionIds.ApiCheckSaveProfile) {
        return {
          success: true,
          profileId: "p-1",
          name: "proxy.example.com",
          apiType: message.apiType,
          baseUrl: "https://proxy.example.com/api",
        }
      }
      return { success: false }
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-secret-xyz")

    await waitFor(() => {
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ApiCheckFetchModels,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-secret-xyz",
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
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ApiCheckSaveProfile,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-secret-xyz",
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
        },
      },
    )
  })

  it("shows a quick-open button after saving to profiles", async () => {
    const user = userEvent.setup()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }
      if (message.action === RuntimeActionIds.ApiCheckSaveProfile) {
        return {
          success: true,
          profileId: "p-1",
          name: "proxy.example.com",
          apiType: message.apiType,
          baseUrl: "https://proxy.example.com/api",
        }
      }
      if (
        message.action === RuntimeActionIds.OpenSettingsApiCredentialProfiles
      ) {
        return { success: true }
      }
      return { success: false }
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-secret-xyz")

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
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }
      if (message.action === RuntimeActionIds.ApiCheckSaveProfile) {
        return {
          success: true,
          profileId: "p-1",
          name: "proxy.example.com",
          apiType: message.apiType,
          baseUrl: "https://proxy.example.com/api",
        }
      }
      if (
        message.action === RuntimeActionIds.OpenSettingsApiCredentialProfiles
      ) {
        throw new Error("settings page failed")
      }
      return { success: false }
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-secret-xyz")

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
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }
      if (message.action === RuntimeActionIds.ApiCheckSaveProfile) {
        throw new Error("save exploded")
      }
      return { success: false }
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-secret-xyz")

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

    let resolveModelsProbe: ((value: unknown) => void) | null = null

    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }

      if (
        message.action === RuntimeActionIds.ApiCheckRunProbe &&
        message.probeId === "models"
      ) {
        return await new Promise((resolve) => {
          resolveModelsProbe = resolve
        })
      }

      if (message.action === RuntimeActionIds.ApiCheckRunProbe) {
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

      if (message.action === RuntimeActionIds.ApiCheckSaveProfile) {
        return {
          success: true,
          profileId: "p-1",
          name: "proxy.example.com",
          apiType: message.apiType,
          baseUrl: message.baseUrl,
        }
      }

      return { success: false }
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-secret-xyz")

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

    const resolveProbe = resolveModelsProbe as ((value: unknown) => void) | null
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
      expect(sendRuntimeMessage).toHaveBeenCalledWith({
        action: RuntimeActionIds.ApiCheckSaveProfile,
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-secret-xyz",
        pageUrl: "https://example.com",
      })
    })
  })

  it("falls back to the local probe error when background returns no result payload", async () => {
    const user = userEvent.setup()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }
      if (message.action === RuntimeActionIds.ApiCheckRunProbe) {
        return { success: false }
      }
      return { success: false }
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-secret-xyz")

    const probeCard = await screen.findByTestId(
      "api-check-probe-text-generation",
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
    expect(sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("shows validation error instead of running a probe without credentials", async () => {
    const user = userEvent.setup()

    await openModal()

    const probeCard = await screen.findByTestId(
      "api-check-probe-text-generation",
    )

    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )

    expect(
      await screen.findByText("webAiApiCheck:modal.errors.missingBaseUrlOrKey"),
    ).toBeInTheDocument()
    expect(sendRuntimeMessage).not.toHaveBeenCalled()
  })

  it("falls back to local fetch-models error when background returns no message", async () => {
    const user = userEvent.setup()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: false }
      }
      return { success: false }
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-secret-xyz")

    expect(
      await screen.findByText("webAiApiCheck:modal.errors.fetchModelsFailed"),
    ).toBeInTheDocument()
  })

  it("falls back to local save-profile error when background returns no message", async () => {
    const user = userEvent.setup()
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }
      if (message.action === RuntimeActionIds.ApiCheckSaveProfile) {
        return { success: false }
      }
      return { success: false }
    })

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-secret-xyz")

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
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: [] }
      }
      if (message.action === RuntimeActionIds.ApiCheckRunProbe) {
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
    })

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
    await user.paste("sk-secret-xyz")

    const probeCard = await screen.findByTestId(
      "api-check-probe-text-generation",
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
    vi.mocked(sendRuntimeMessage).mockImplementation(async (message: any) => {
      if (message.action === RuntimeActionIds.ApiCheckFetchModels) {
        return { success: true, modelIds: ["gpt-4o-mini"] }
      }
      return { success: false }
    })

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
    await user.paste("sk-secret-xyz")

    await waitFor(() => {
      expect(screen.getByTestId("api-check-model-id")).toHaveTextContent(
        "gpt-4o-mini",
      )
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
