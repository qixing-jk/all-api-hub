import "./apiCheckModalHostMocks"

import { act, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
  API_CHECK_MODAL_CLOSE_REASONS,
  API_CHECK_MODAL_CLOSED_EVENT,
} from "~/entrypoints/content/webAiApiCheck/events"
import { WEB_AI_API_CHECK_TEST_IDS } from "~/entrypoints/content/webAiApiCheck/testIds"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { WEB_AI_API_CHECK_BASE_URL_HISTORY_SUGGESTION_LIMIT } from "~/services/verification/webAiApiCheck/constants"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"

import {
  completeProductAnalyticsActionMock,
  startProductAnalyticsActionMock,
} from "./apiCheckModalHostMocks"
import {
  createDeferred,
  expectAnalyticsCallsToExcludeSensitiveValues,
  expectTypedApiCheckMessage,
  getApiCheckMessageCalls,
  openModal,
  pasteIntoField,
  setupApiCheckModalHostTest,
} from "./apiCheckModalHostTestSupport"

describe("ApiCheckModalHost", () => {
  setupApiCheckModalHostTest()

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

    const apiKeyInput = screen.getByPlaceholderText("sk-...")
    await pasteIntoField(user, baseUrlInput, "https://fresh.example.com/api")
    await pasteIntoField(user, apiKeyInput, "sk-test-fixture")

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
    await user.hover(historyButton)
    expect(await screen.findByRole("tooltip")).toHaveTextContent(
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

  it("preserves active credentials when edited source text has no extraction result", async () => {
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
      expect(baseUrlInput.value).toBe("https://proxy.example.com/api")
      expect(apiKeyInput.value).toBe("sk-test-source-clear-fixture")
    })
    expect(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.actions.saveToProfiles",
      }),
    ).toBeEnabled()
  })

  it("preserves the other credential when edited source text only extracts one value", async () => {
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
        "Base URL: https://proxy.example.com/api\nAPI Key: sk-test-partial-fixture",
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
    expect(apiKeyInput.value).toBe("sk-test-partial-fixture")

    await user.clear(sourceTextInput)
    await user.type(sourceTextInput, "Base URL: https://next.example.com/api")

    await waitFor(() => {
      expect(baseUrlInput.value).toBe("https://next.example.com/api")
      expect(apiKeyInput.value).toBe("sk-test-partial-fixture")
    })
    expect(
      screen.getByRole("button", {
        name: "webAiApiCheck:modal.actions.saveToProfiles",
      }),
    ).toBeEnabled()
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
})
