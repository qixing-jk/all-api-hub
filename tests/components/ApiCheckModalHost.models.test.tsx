import "./apiCheckModalHostMocks"

import { act, fireEvent, screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import {
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
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SOURCE_KINDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
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
  startManualProbeSuite,
} from "./apiCheckModalHostTestSupport"

describe("ApiCheckModalHost", () => {
  setupApiCheckModalHostTest()

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

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")
    await pasteIntoField(user, baseUrlInput, "https://proxy.example.com/api")
    await pasteIntoField(user, apiKeyInput, "sk-test-secret-fixture")

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

    const baseUrlInput = await screen.findByPlaceholderText(
      "https://example.com/api",
    )
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")
    await pasteIntoField(user, baseUrlInput, "https://proxy.example.com/api")
    await pasteIntoField(user, apiKeyInput, "sk-test-secret-fixture")

    await waitFor(() => {
      expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(
        WebAiApiCheckMessageTypes.FetchModels,
        expect.objectContaining({
          apiType: "openai-compatible",
        }),
      )
    })

    await pasteIntoField(user, apiKeyInput, "-rotated")

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

    await pasteIntoField(user, baseUrlInput, "https://proxy.example.com/api")
    await pasteIntoField(user, apiKeyInput, "sk-test-secret-fixture")

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
})
