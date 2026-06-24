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
  API_CHECK_MODAL_CLOSE_REASONS,
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
import type { ApiVerificationProbeId } from "~/services/verification/aiApiVerification"
import { WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT } from "~/services/verification/webAiApiCheck/constants"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import type { ApiCheckRunProbeResponse } from "~/services/verification/webAiApiCheck/types"
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

function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

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

vi.mock(
  "~/services/verification/webAiApiCheck/messaging",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/verification/webAiApiCheck/messaging")
      >()
    return {
      ...actual,
      sendWebAiApiCheckMessage: vi.fn(),
    }
  },
)

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

  const getApiCheckMessageCalls = (
    type: (typeof WebAiApiCheckMessageTypes)[keyof typeof WebAiApiCheckMessageTypes],
  ) =>
    vi
      .mocked(sendWebAiApiCheckMessage)
      .mock.calls.filter((call) => call[0] === type)

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

  const startManualProbeSuite = async (
    user: ReturnType<typeof userEvent.setup>,
    options?: { waitForModelId?: string },
  ) => {
    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")

    await user.click(baseUrlInput)
    await user.paste("https://proxy.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-secret-fixture")
    if (options?.waitForModelId) {
      const expectedModelId = options.waitForModelId
      await waitFor(() => {
        expect(
          screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
        ).toHaveTextContent(expectedModelId)
      })
    }
    await user.click(
      await screen.findByText("webAiApiCheck:modal.actions.test"),
    )
  }

  const waitForSelectedModelId = async (modelId: string) => {
    await waitFor(() => {
      expect(
        screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
      ).toHaveTextContent(modelId)
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
    expect(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.history.trigger",
      }),
    ).toBeDisabled()
  })

  it("associates visible field labels with modal controls", async () => {
    await openModal()

    expect(
      await screen.findByLabelText("webAiApiCheck:modal.sourceText.label"),
    ).toBeVisible()
    expect(
      screen.getByLabelText("webAiApiCheck:modal.fields.baseUrl"),
    ).toBeVisible()
    expect(
      screen.getByLabelText("webAiApiCheck:modal.fields.apiKey"),
    ).toBeVisible()
    expect(
      screen.getByLabelText("webAiApiCheck:modal.fields.apiType"),
    ).toBeVisible()
    expect(
      screen.getByLabelText("webAiApiCheck:modal.fields.modelId"),
    ).toBeVisible()
  })

  it("prefills the base URL from current-source history and lets users choose another history entry", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions) {
          return {
            success: true,
            suggestions: [
              {
                baseUrl: "https://source-match.example.com/api",
                lastUsedAt: 2,
                useCount: 3,
                matchedSourceOrigin: "https://github.com",
              },
              {
                baseUrl: "https://global-recent.example.com/api",
                lastUsedAt: 3,
                useCount: 1,
              },
            ],
          }
        }
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        return { success: false }
      },
    )

    await openModal({
      sourceText: "API Key: sk-test-history-prefill-fixture",
      pageUrl: "https://github.com/qixing-jk/all-api-hub/issues/1025",
    })

    const baseUrlInput = (await screen.findByPlaceholderText(
      "https://example.com/api",
    )) as HTMLInputElement
    const apiKeyInput = screen.getByPlaceholderText(
      "sk-...",
    ) as HTMLInputElement

    await waitFor(() => {
      expect(baseUrlInput.value).toBe("https://source-match.example.com/api")
    })
    expect(apiKeyInput.value).toBe("sk-test-history-prefill-fixture")
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
      actionId:
        PRODUCT_ANALYTICS_ACTION_IDS.PrefillApiCredentialBaseUrlFromHistory,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      {
        insights: {
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.History,
          apiType: "openai-compatible",
        },
      },
    )
    expect(
      screen.queryByRole("button", {
        name: "https://global-recent.example.com/api",
      }),
    ).not.toBeInTheDocument()

    await user.click(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.history.trigger",
      }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: "https://global-recent.example.com/api",
      }),
    )

    expect(baseUrlInput.value).toBe("https://global-recent.example.com/api")
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectApiCredentialBaseUrlHistory,
    })
    expectTypedApiCheckMessage(
      WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions,
      {
        pageUrl: "https://github.com/qixing-jk/all-api-hub/issues/1025",
        limit: WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT,
      },
    )
  })

  it("does not let delayed history suggestions overwrite a user-entered base URL", async () => {
    const user = userEvent.setup()
    const historyDeferred = createDeferred<{
      success: true
      suggestions: Array<{
        baseUrl: string
        lastUsedAt: number
        useCount: number
        matchedSourceOrigin?: string
      }>
    }>()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions) {
          return historyDeferred.promise
        }
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["typed-model"] }
        }
        return { success: false }
      },
    )

    await openModal({
      sourceText: "API Key: sk-test-delayed-history-fixture",
      pageUrl: "https://github.com/qixing-jk/all-api-hub/issues/1025",
    })

    const baseUrlInput = (await screen.findByPlaceholderText(
      "https://example.com/api",
    )) as HTMLInputElement

    await user.type(baseUrlInput, "https://typed.example.com/api")

    await act(async () => {
      historyDeferred.resolve({
        success: true,
        suggestions: [
          {
            baseUrl: "https://history.example.com/api",
            lastUsedAt: 2,
            useCount: 3,
            matchedSourceOrigin: "https://github.com",
          },
        ],
      })
    })

    await waitFor(() => {
      expect(
        screen.getByRole("button", {
          name: "webAiApiCheck:modal.history.trigger",
        }),
      ).toBeEnabled()
    })
    expect(baseUrlInput.value).toBe("https://typed.example.com/api")
    expect(
      getApiCheckMessageCalls(WebAiApiCheckMessageTypes.FetchModels).some(
        (call) =>
          (
            call[1] as {
              baseUrl?: string
            }
          ).baseUrl === "https://history.example.com/api",
      ),
    ).toBe(false)
    expect(
      startProductAnalyticsActionMock.mock.calls.some(
        ([input]) =>
          input.actionId ===
          PRODUCT_ANALYTICS_ACTION_IDS.PrefillApiCredentialBaseUrlFromHistory,
      ),
    ).toBe(false)
  })

  it("waits for explicit confirmation before auto-fetching models from a history-prefilled base URL", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions) {
          return {
            success: true,
            suggestions: [
              {
                baseUrl: "https://source-match.example.com/api",
                lastUsedAt: 2,
                useCount: 3,
                matchedSourceOrigin: "https://github.com",
              },
            ],
          }
        }
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["m1"] }
        }
        return { success: false }
      },
    )

    await openModal({
      sourceText: "API Key: sk-test-history-confirm-fixture",
      pageUrl: "https://github.com/qixing-jk/all-api-hub/issues/1025",
    })

    const baseUrlInput = (await screen.findByPlaceholderText(
      "https://example.com/api",
    )) as HTMLInputElement

    await waitFor(() => {
      expect(baseUrlInput.value).toBe("https://source-match.example.com/api")
    })
    expect(
      getApiCheckMessageCalls(WebAiApiCheckMessageTypes.FetchModels),
    ).toHaveLength(0)

    await user.click(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.history.trigger",
      }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: "https://source-match.example.com/api",
      }),
    )

    await waitFor(() => {
      expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.FetchModels, {
        apiType: "openai-compatible",
        baseUrl: "https://source-match.example.com/api",
        apiKey: "sk-test-history-confirm-fixture",
      })
    })
  })

  it("reconciles the current history picker with the record response", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions) {
          return { success: true, suggestions: [] }
        }
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        if (type === WebAiApiCheckMessageTypes.RecordBaseUrlHistory) {
          return {
            success: true,
            suggestions: [],
          }
        }
        return { success: false }
      },
    )

    await openModal()

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const historyButton = screen.getByRole("button", {
      name: "webAiApiCheck:modal.history.trigger",
    })
    expect(historyButton).toBeDisabled()

    await user.type(baseUrlInput, "https://fresh.example.com/api")
    await user.type(screen.getByPlaceholderText("sk-..."), "sk-test-fixture")

    await waitFor(() => {
      expectTypedApiCheckMessage(
        WebAiApiCheckMessageTypes.RecordBaseUrlHistory,
        {
          baseUrl: "https://fresh.example.com/api",
          pageUrl: "https://example.com",
        },
      )
    })
    expect(baseUrlInput).toHaveValue("https://fresh.example.com/api")
    await waitFor(() => {
      expect(historyButton).toBeDisabled()
    })
    expect(historyButton).toHaveAttribute(
      "title",
      "webAiApiCheck:modal.history.empty",
    )
  })

  it("removes a base URL from the current history picker", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions) {
          return {
            success: true,
            suggestions: [
              {
                baseUrl: "https://remove.example.com/api",
                lastUsedAt: 3,
                useCount: 2,
              },
              {
                baseUrl: "https://keep.example.com/api",
                lastUsedAt: 2,
                useCount: 1,
              },
            ],
          }
        }
        if (type === WebAiApiCheckMessageTypes.RemoveBaseUrlHistory) {
          return {
            success: true,
            suggestions: [
              {
                baseUrl: "https://canonical.example.com/api",
                lastUsedAt: 4,
                useCount: 3,
              },
            ],
          }
        }
        return { success: false }
      },
    )

    await openModal({
      sourceText: "API Key: sk-test-history-remove-fixture",
      pageUrl: "https://github.com/qixing-jk/all-api-hub/issues/1025",
    })

    const baseUrlInput = (await screen.findByPlaceholderText(
      "https://example.com/api",
    )) as HTMLInputElement

    await waitFor(() => {
      expect(baseUrlInput.value).toBe("https://remove.example.com/api")
    })
    await user.click(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.history.trigger",
      }),
    )
    const historyList = await screen.findByRole("list", {
      name: "webAiApiCheck:modal.history.label",
    })
    expect(within(historyList).getAllByRole("listitem")).toHaveLength(2)

    const removeItem = await screen.findByRole("button", {
      name: "https://remove.example.com/api",
    })
    await user.click(
      within(removeItem.parentElement as HTMLElement).getByRole("button", {
        name: "webAiApiCheck:modal.history.remove: https://remove.example.com/api",
      }),
    )

    expect(
      screen.queryByRole("button", {
        name: "https://remove.example.com/api",
      }),
    ).not.toBeInTheDocument()
    expect(
      await screen.findByRole("button", {
        name: "https://canonical.example.com/api",
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: "https://keep.example.com/api",
      }),
    ).not.toBeInTheDocument()
    expect(baseUrlInput.value).toBe("https://remove.example.com/api")
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RemoveApiCredentialBaseUrlHistory,
    })
    expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.RemoveBaseUrlHistory, {
      baseUrl: "https://remove.example.com/api",
      pageUrl: "https://github.com/qixing-jk/all-api-hub/issues/1025",
    })
  })

  it("does not let stale history loads overwrite a recorded suggestion", async () => {
    const user = userEvent.setup()
    const historyDeferred = createDeferred<{
      success: true
      suggestions: Array<{
        baseUrl: string
        lastUsedAt: number
        useCount: number
      }>
    }>()

    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.GetBaseUrlHistorySuggestions) {
          return historyDeferred.promise
        }
        if (type === WebAiApiCheckMessageTypes.RecordBaseUrlHistory) {
          return {
            success: true,
            suggestions: [
              {
                baseUrl: message.baseUrl,
                lastUsedAt: 2,
                useCount: 1,
              },
            ],
          }
        }
        if (type === WebAiApiCheckMessageTypes.SaveProfile) {
          return { success: true, name: "Saved profile" }
        }
        return { success: false }
      },
    )

    await openModal({
      sourceText: "API Key: sk-test-history-stale-fixture",
      pageUrl: "https://github.com/qixing-jk/all-api-hub/issues/1025",
    })

    const baseUrlInput = await screen.findByLabelText(
      "webAiApiCheck:modal.fields.baseUrl",
    )
    const apiKeyInput = screen.getByLabelText(
      "webAiApiCheck:modal.fields.apiKey",
    )

    await user.type(baseUrlInput, "https://new.example.com/api")
    await user.click(apiKeyInput)
    await user.paste("sk-test-history-record-fixture")
    await user.click(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.actions.saveToProfiles",
      }),
    )

    await waitFor(() => {
      expect(
        getApiCheckMessageCalls(WebAiApiCheckMessageTypes.RecordBaseUrlHistory),
      ).toHaveLength(1)
    })

    await act(async () => {
      historyDeferred.resolve({
        success: true,
        suggestions: [
          {
            baseUrl: "https://stale.example.com/api",
            lastUsedAt: 3,
            useCount: 2,
          },
        ],
      })
    })

    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.history.trigger",
      }),
    )
    expect(
      await screen.findByRole("button", {
        name: "https://new.example.com/api",
      }),
    ).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: "https://stale.example.com/api",
      }),
    ).not.toBeInTheDocument()
  })

  it("shows the extracted API key by default", async () => {
    await openModal({
      sourceText:
        "Base URL: https://proxy.example.com/api\nAPI Key: sk-test-visible-fixture",
    })

    const apiKeyInput = (await screen.findByPlaceholderText(
      "sk-...",
    )) as HTMLInputElement

    expect(apiKeyInput.value).toBe("sk-test-visible-fixture")
    expect(apiKeyInput).toHaveAttribute("type", "text")
    expect(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.actions.hideKey",
      }),
    ).toBeInTheDocument()
  })

  it("clears active credentials when edited source text no longer contains credentials", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["gpt-4o-mini"] }
        }
        return { success: false }
      },
    )

    await openModal({
      sourceText:
        "Base URL: https://proxy.example.com/api\nAPI Key: sk-test-source-clear-fixture",
    })

    const baseUrlInput = (await screen.findByLabelText(
      "webAiApiCheck:modal.fields.baseUrl",
    )) as HTMLInputElement
    const apiKeyInput = screen.getByLabelText(
      "webAiApiCheck:modal.fields.apiKey",
    ) as HTMLInputElement
    const sourceTextInput = screen.getByLabelText(
      "webAiApiCheck:modal.sourceText.label",
    )

    expect(baseUrlInput.value).toBe("https://proxy.example.com/api")
    expect(apiKeyInput.value).toBe("sk-test-source-clear-fixture")

    await user.clear(sourceTextInput)
    await user.type(sourceTextInput, "No credentials here")

    await waitFor(() => {
      expect(baseUrlInput.value).toBe("")
      expect(apiKeyInput.value).toBe("")
    })
    expect(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.actions.saveToProfiles",
      }),
    ).toBeDisabled()
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
      reason: API_CHECK_MODAL_CLOSE_REASONS.Dismissed,
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

  it("records Base URL history after a successful automatic model fetch", async () => {
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["m1"] }
        }
        if (type === WebAiApiCheckMessageTypes.RecordBaseUrlHistory) {
          return { success: true }
        }
        return { success: false }
      },
    )

    await openModal({
      sourceText:
        "Base URL: https://proxy.example.com/api\nAPI Key: sk-test-auto-history-success-fixture",
      pageUrl: "https://docs.example.invalid/setup",
      trigger: "autoDetect",
    })

    await waitFor(() => {
      expectTypedApiCheckMessage(
        WebAiApiCheckMessageTypes.RecordBaseUrlHistory,
        {
          baseUrl: "https://proxy.example.com/api",
          pageUrl: "https://docs.example.invalid/setup",
        },
      )
    })
  })

  it("does not record Base URL history after a failed automatic model fetch", async () => {
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: false, error: "Unauthorized" }
        }
        if (type === WebAiApiCheckMessageTypes.RecordBaseUrlHistory) {
          return { success: true }
        }
        return { success: false }
      },
    )

    await openModal({
      sourceText:
        "Base URL: https://proxy.example.com/api\nAPI Key: sk-test-auto-history-failure-fixture",
      pageUrl: "https://docs.example.invalid/setup",
      trigger: "autoDetect",
    })

    await screen.findByText("Unauthorized")
    expect(
      getApiCheckMessageCalls(WebAiApiCheckMessageTypes.RecordBaseUrlHistory),
    ).toHaveLength(0)
  })

  it("records Base URL history for model fetch and full probe suite run", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, data: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["gpt-test-model"] }
        }
        if (type === WebAiApiCheckMessageTypes.RecordBaseUrlHistory) {
          return { success: true }
        }
        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          return {
            success: true,
            result: {
              id: data.probeId,
              status: "pass",
              latencyMs: 1,
              summary: "ok",
              input: {
                apiType: data.apiType,
                baseUrl: data.baseUrl,
              },
            },
          }
        }
        return { success: false }
      },
    )

    await startManualProbeSuite(user, { waitForModelId: "gpt-test-model" })

    await waitFor(() => {
      expect(
        getApiCheckMessageCalls(WebAiApiCheckMessageTypes.RunProbe).length,
      ).toBeGreaterThan(1)
    })
    expect(
      getApiCheckMessageCalls(WebAiApiCheckMessageTypes.RecordBaseUrlHistory),
    ).toHaveLength(2)
    expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.RecordBaseUrlHistory, {
      baseUrl: "https://proxy.example.com/api",
      pageUrl: "https://example.com",
    })
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
      expect(
        getApiCheckMessageCalls(WebAiApiCheckMessageTypes.FetchModels),
      ).toHaveLength(1)
    })

    await act(async () => {
      await new Promise((resolve) => window.setTimeout(resolve, 0))
    })
    expect(
      getApiCheckMessageCalls(WebAiApiCheckMessageTypes.FetchModels),
    ).toHaveLength(1)

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
    expect(
      getApiCheckMessageCalls(WebAiApiCheckMessageTypes.FetchModels),
    ).toHaveLength(1)

    const baseUrlInput = screen.getByPlaceholderText(
      "https://example.com/api",
    ) as HTMLInputElement

    await user.type(baseUrlInput, "  ")

    await waitFor(() => {
      expect(
        getApiCheckMessageCalls(WebAiApiCheckMessageTypes.FetchModels),
      ).toHaveLength(1)
    })

    await user.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )

    await act(async () => {
      dispatchOpenApiCheckModal(detail)
    })

    await waitFor(() => {
      expect(
        getApiCheckMessageCalls(WebAiApiCheckMessageTypes.FetchModels),
      ).toHaveLength(2)
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

  it("clears the selected model when credentials change before the next model list loads", async () => {
    const user = userEvent.setup()
    let secondFetchDeferred:
      | ReturnType<
          typeof createDeferred<{
            success: true
            modelIds: string[]
          }>
        >
      | undefined

    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          if (message.apiKey === "sk-test-first-fixture") {
            return { success: true, modelIds: ["first-model"] }
          }
          secondFetchDeferred = createDeferred<{
            success: true
            modelIds: string[]
          }>()
          return secondFetchDeferred.promise
        }

        return { success: false }
      },
    )

    await openModal({
      sourceText:
        "Base URL: https://proxy.example.com/api\nAPI Key: sk-test-first-fixture",
    })

    await waitFor(() => {
      expect(
        screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
      ).toHaveTextContent("first-model")
    })

    const apiKeyInput = screen.getByLabelText(
      "webAiApiCheck:modal.fields.apiKey",
    )
    await user.clear(apiKeyInput)
    await user.type(apiKeyInput, "sk-test-second-fixture")

    await waitFor(() => {
      expect(secondFetchDeferred).toBeDefined()
    })
    expect(
      screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
    ).toHaveTextContent("webAiApiCheck:modal.actions.fetchingModels")
    expect(
      screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
    ).not.toHaveTextContent("first-model")

    await act(async () => {
      secondFetchDeferred?.resolve({
        success: true,
        modelIds: ["second-model"],
      })
    })

    await waitFor(() => {
      expect(
        screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
      ).toHaveTextContent("second-model")
    })
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
          return { success: true, modelIds: ["gpt-test-model"] }
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
    await waitForSelectedModelId("gpt-test-model")

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

  it("stops an individual running API probe and ignores its late result", async () => {
    const user = userEvent.setup()
    const probeDeferred = createDeferred<ApiCheckRunProbeResponse>()
    const runProbeMessages: Array<Record<string, unknown>> = []

    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["gpt-test-model"] }
        }

        if (type === WebAiApiCheckMessageTypes.CancelRunProbe) {
          return { success: true, cancelled: true }
        }

        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          runProbeMessages.push(message)
          return await probeDeferred.promise
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
    await waitForSelectedModelId("gpt-test-model")

    const probeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )

    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )

    const activeRunId = await waitFor(() => {
      expect(runProbeMessages).toEqual([
        expect.objectContaining({
          probeId: "text-generation",
          runId: expect.any(String),
        }),
      ])
      return runProbeMessages[0].runId as string
    })

    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.stopTest",
      }),
    )

    expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
      WebAiApiCheckMessageTypes.CancelRunProbe,
      { runId: activeRunId },
    )
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.WebAiApiCheck,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RunApiCredentialProbe,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentApiCheckModal,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Cancelled,
      {
        insights: {
          sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
          apiType: "openai-compatible",
          mode: PRODUCT_ANALYTICS_MODE_IDS.Single,
          failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.CancelledByUser,
        },
      },
    )

    await act(async () => {
      probeDeferred.resolve({
        success: true,
        result: {
          id: "text-generation",
          status: "fail",
          latencyMs: 0,
          summary: "Cancelled by user",
        },
      })
    })

    expect(
      within(probeCard).queryByText("Cancelled by user"),
    ).not.toBeInTheDocument()
    expect(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.retry",
      }),
    ).toBeInTheDocument()
  })

  it("keeps a retried probe running when the stopped run resolves late", async () => {
    const user = userEvent.setup()
    const firstProbeDeferred = createDeferred<ApiCheckRunProbeResponse>()
    const secondProbeDeferred = createDeferred<ApiCheckRunProbeResponse>()
    const runProbeMessages: Array<Record<string, unknown>> = []

    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["gpt-test-model"] }
        }

        if (type === WebAiApiCheckMessageTypes.CancelRunProbe) {
          return { success: true, cancelled: true }
        }

        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          runProbeMessages.push(message)
          return runProbeMessages.length === 1
            ? await firstProbeDeferred.promise
            : await secondProbeDeferred.promise
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
    await waitForSelectedModelId("gpt-test-model")

    const probeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )

    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )

    await waitFor(() => {
      expect(runProbeMessages).toHaveLength(1)
    })

    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.stopTest",
      }),
    )
    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.retry",
      }),
    )

    await waitFor(() => {
      expect(runProbeMessages).toHaveLength(2)
      expect(
        within(probeCard).getByRole("button", {
          name: "webAiApiCheck:modal.actions.stopTest",
        }),
      ).toBeInTheDocument()
    })

    await act(async () => {
      firstProbeDeferred.resolve({
        success: true,
        result: {
          id: "text-generation",
          status: "fail",
          latencyMs: 0,
          summary: "Cancelled first run",
        },
      })
    })

    expect(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.stopTest",
      }),
    ).toBeInTheDocument()
    expect(
      within(probeCard).queryByText("Cancelled first run"),
    ).not.toBeInTheDocument()

    await act(async () => {
      secondProbeDeferred.resolve({
        success: true,
        result: {
          id: "text-generation",
          status: "pass",
          latencyMs: 1,
          summary: "Retry OK",
        },
      })
    })

    expect(await within(probeCard).findByText("Retry OK")).toBeInTheDocument()
  })

  it("ignores a stopped probe failure response and cancel transport errors", async () => {
    const user = userEvent.setup()
    const probeDeferred = createDeferred<ApiCheckRunProbeResponse>()

    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["gpt-test-model"] }
        }

        if (type === WebAiApiCheckMessageTypes.CancelRunProbe) {
          throw new Error("cancel transport failed")
        }

        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          return await probeDeferred.promise
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
    await waitForSelectedModelId("gpt-test-model")

    const probeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )

    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )
    await user.click(
      await within(probeCard).findByRole("button", {
        name: "webAiApiCheck:modal.actions.stopTest",
      }),
    )

    await act(async () => {
      probeDeferred.resolve({
        success: false,
        error: "Should not show",
      })
    })

    expect(
      within(probeCard).queryByText("Should not show"),
    ).not.toBeInTheDocument()
    expect(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.retry",
      }),
    ).toBeInTheDocument()
  })

  it("ignores a stopped probe rejected request", async () => {
    const user = userEvent.setup()
    const probeDeferred = createDeferred<ApiCheckRunProbeResponse>()

    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["gpt-test-model"] }
        }

        if (type === WebAiApiCheckMessageTypes.CancelRunProbe) {
          return { success: true, cancelled: true }
        }

        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          return await probeDeferred.promise
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
    await waitForSelectedModelId("gpt-test-model")

    const probeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )

    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )
    await user.click(
      await within(probeCard).findByRole("button", {
        name: "webAiApiCheck:modal.actions.stopTest",
      }),
    )

    await act(async () => {
      probeDeferred.reject(new Error("probe transport failed"))
    })

    expect(
      within(probeCard).queryByText(
        "webAiApiCheck:modal.errors.runProbeFailed",
      ),
    ).not.toBeInTheDocument()
    expect(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.retry",
      }),
    ).toBeInTheDocument()
  })

  it("maps structured probe HTTP status to an auth analytics failure", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["gpt-test-model"] }
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
    await waitForSelectedModelId("gpt-test-model")

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
          return { success: true, modelIds: ["gpt-test-model"] }
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
    await waitForSelectedModelId("gpt-test-model")

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

  it("stops the running API probe suite, cancels the active background run, and keeps queued probes idle", async () => {
    const user = userEvent.setup()
    const firstProbeDeferred = createDeferred<ApiCheckRunProbeResponse>()
    const runProbeMessages: Array<Record<string, unknown>> = []

    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["gpt-test-model"] }
        }

        if (type === WebAiApiCheckMessageTypes.CancelRunProbe) {
          return { success: true, cancelled: true }
        }

        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          runProbeMessages.push(message)
          const probeId = message.probeId as ApiVerificationProbeId
          if (message.probeId === "text-generation") {
            return await firstProbeDeferred.promise
          }

          return {
            success: true,
            result: {
              id: probeId,
              status: "pass",
              latencyMs: 1,
              summary: "Should not run",
            },
          }
        }

        return { success: false }
      },
    )

    await startManualProbeSuite(user, { waitForModelId: "gpt-test-model" })

    const activeRunId = await waitFor(() => {
      const activeProbeMessage = runProbeMessages.find(
        (message) => message.probeId === "text-generation",
      )
      expect(activeProbeMessage).toEqual(
        expect.objectContaining({
          probeId: "text-generation",
          runId: expect.any(String),
        }),
      )
      return activeProbeMessage!.runId as string
    })

    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.actions.stopTest",
      }),
    )

    expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
      WebAiApiCheckMessageTypes.CancelRunProbe,
      { runId: activeRunId },
    )
    firstProbeDeferred.resolve({
      success: true,
      result: {
        id: "text-generation",
        status: "fail",
        latencyMs: 0,
        summary: "Cancelled by user",
      },
    })

    expect(
      await screen.findByText("webAiApiCheck:modal.messages.testStopped"),
    ).toBeInTheDocument()

    await waitFor(() => {
      expect(runProbeMessages).toHaveLength(2)
    })
    expect(
      await screen.findByText("webAiApiCheck:modal.actions.test"),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Cancelled,
        {
          insights: {
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            apiType: "openai-compatible",
            mode: PRODUCT_ANALYTICS_MODE_IDS.All,
            itemCount: 5,
            successCount: 1,
            failureCount: 0,
            skippedCount: 4,
            failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.CancelledByUser,
          },
        },
      )
    })
  })

  it("counts completed unsupported probes as skipped when the API probe suite is stopped", async () => {
    const user = userEvent.setup()
    const secondProbeDeferred = createDeferred<ApiCheckRunProbeResponse>()
    const runProbeMessages: Array<Record<string, unknown>> = []

    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["gpt-test-model"] }
        }

        if (type === WebAiApiCheckMessageTypes.CancelRunProbe) {
          return { success: true, cancelled: true }
        }

        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          runProbeMessages.push(message)
          if (message.probeId === "models") {
            return {
              success: true,
              result: {
                id: "models",
                status: "unsupported",
                latencyMs: 1,
                summary: "Models are unsupported",
              },
            }
          }
          if (message.probeId === "text-generation") {
            return await secondProbeDeferred.promise
          }

          return {
            success: true,
            result: {
              id: message.probeId as ApiVerificationProbeId,
              status: "pass",
              latencyMs: 1,
              summary: "Should not run",
            },
          }
        }

        return { success: false }
      },
    )

    await startManualProbeSuite(user, { waitForModelId: "gpt-test-model" })

    await waitFor(() => {
      expect(runProbeMessages.map((message) => message.probeId)).toEqual([
        "models",
        "text-generation",
      ])
    })

    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.actions.stopTest",
      }),
    )

    await act(async () => {
      secondProbeDeferred.resolve({
        success: true,
        result: {
          id: "text-generation",
          status: "fail",
          latencyMs: 0,
          summary: "Cancelled by user",
        },
      })
    })

    expect(
      await screen.findByText("webAiApiCheck:modal.messages.testStopped"),
    ).toBeInTheDocument()
    await waitFor(() => {
      expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Cancelled,
        {
          insights: {
            sourceKind: PRODUCT_ANALYTICS_SOURCE_KINDS.Manual,
            apiType: "openai-compatible",
            mode: PRODUCT_ANALYTICS_MODE_IDS.All,
            itemCount: 5,
            successCount: 0,
            failureCount: 0,
            skippedCount: 5,
            failureReason: PRODUCT_ANALYTICS_FAILURE_REASONS.CancelledByUser,
          },
        },
      )
    })
  })

  it("keeps the modal open when the backdrop is clicked while the API probe suite is running", async () => {
    const user = userEvent.setup()
    const firstProbeDeferred = createDeferred<ApiCheckRunProbeResponse>()

    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["gpt-test-model"] }
        }

        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          if (message.probeId === "text-generation") {
            return await firstProbeDeferred.promise
          }

          return {
            success: true,
            result: {
              id: message.probeId as ApiVerificationProbeId,
              status: "pass",
              latencyMs: 1,
              summary: "Probe OK",
            },
          }
        }

        return { success: false }
      },
    )

    await startManualProbeSuite(user, { waitForModelId: "gpt-test-model" })
    await screen.findByRole("button", {
      name: "webAiApiCheck:modal.actions.stopTest",
    })

    fireEvent.click(screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.backdrop))

    expect(
      screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modal),
    ).toBeInTheDocument()
    expect(sendWebAiApiCheckMessage).not.toHaveBeenCalledWith(
      WebAiApiCheckMessageTypes.CancelRunProbe,
      expect.anything(),
    )

    await act(async () => {
      firstProbeDeferred.resolve({
        success: true,
        result: {
          id: "text-generation",
          status: "pass",
          latencyMs: 1,
          summary: "Probe OK",
        },
      })
    })

    await waitFor(() => {
      expect(
        screen.getByText("webAiApiCheck:modal.actions.test"),
      ).toBeInTheDocument()
    })
  })

  it("closes the modal when the backdrop is clicked while probes are idle", async () => {
    await openModal()

    fireEvent.click(
      await screen.findByTestId(WEB_AI_API_CHECK_TEST_IDS.backdrop),
    )

    expect(
      screen.queryByTestId(WEB_AI_API_CHECK_TEST_IDS.modal),
    ).not.toBeInTheDocument()
  })

  it("falls back to the local probe error when the background probe call throws", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["gpt-test-model"] }
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
    await waitForSelectedModelId("gpt-test-model")

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
          return { success: true, modelIds: ["gpt-test-model"] }
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
    await waitForSelectedModelId("gpt-test-model")

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
          return { success: true, modelIds: ["gpt-test-model"] }
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
          return { success: true, modelIds: ["gpt-test-model"] }
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
          return { success: true, modelIds: ["gpt-test-model"] }
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
          return { success: true, modelIds: ["gpt-test-model"] }
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
    await waitForSelectedModelId("gpt-test-model")

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
    expect(
      getApiCheckMessageCalls(WebAiApiCheckMessageTypes.FetchModels),
    ).toHaveLength(0)
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
    expect(
      getApiCheckMessageCalls(WebAiApiCheckMessageTypes.RunProbe),
    ).toHaveLength(0)
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

  it("shows validation error instead of running a model-required probe without a model", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        return { success: false }
      },
    )

    await openModal()

    await user.type(
      await screen.findByLabelText("webAiApiCheck:modal.fields.baseUrl"),
      "https://proxy.example.com/api",
    )
    await user.type(
      screen.getByLabelText("webAiApiCheck:modal.fields.apiKey"),
      "sk-test-missing-model-fixture",
    )

    const probeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )

    await user.click(
      within(probeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )

    expect(
      await screen.findAllByText(
        "aiApiVerification:verifyDialog.requiresModelId",
      ),
    ).toHaveLength(2)
    expect(
      getApiCheckMessageCalls(WebAiApiCheckMessageTypes.RunProbe),
    ).toHaveLength(0)
  })

  it("skips model-required probes during run-all until a model is selected", async () => {
    const user = userEvent.setup()
    const runProbeMessages: Array<Record<string, unknown>> = []
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        if (type === WebAiApiCheckMessageTypes.RunProbe) {
          runProbeMessages.push(message)
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

    await openModal()

    await user.type(
      await screen.findByLabelText("webAiApiCheck:modal.fields.baseUrl"),
      "https://proxy.example.com/api",
    )
    await user.type(
      screen.getByLabelText("webAiApiCheck:modal.fields.apiKey"),
      "sk-test-run-all-missing-model-fixture",
    )
    await user.click(
      await screen.findByText("webAiApiCheck:modal.actions.test"),
    )

    await waitFor(() => {
      expect(runProbeMessages).toEqual([
        expect.objectContaining({ probeId: "models" }),
      ])
    })
    await waitFor(() => {
      expect(
        screen.getAllByText("aiApiVerification:verifyDialog.requiresModelId")
          .length,
      ).toBeGreaterThanOrEqual(4)
    })
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

  it("dispatches a completed close event after a probe result succeeds", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: ["gpt-test-model"] }
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
    await waitFor(() => {
      expect(
        screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
      ).toHaveTextContent("gpt-test-model")
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

    await user.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )

    await expect(closedDetailPromise).resolves.toEqual({
      pageUrl: "https://example.com",
      trigger: "contextMenu",
      reason: API_CHECK_MODAL_CLOSE_REASONS.Completed,
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
      reason: API_CHECK_MODAL_CLOSE_REASONS.Completed,
    })
  })
})
