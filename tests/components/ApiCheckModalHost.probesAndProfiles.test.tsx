import "./apiCheckModalHostMocks"

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
import { describe, expect, it, vi } from "vitest"

import { RuntimeActionIds } from "~/constants/runtimeActions"
import { parseDateInputValue } from "~/entrypoints/content/webAiApiCheck/components/useApiCheckModalViewModel"
import {
  API_CHECK_MODAL_CLOSE_REASONS,
  API_CHECK_MODAL_CLOSED_EVENT,
  dispatchOpenApiCheckModal,
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
} from "~/services/productAnalytics/contracts"
import type { ApiVerificationProbeId } from "~/services/verification/aiApiVerification"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import type { ApiCheckRunProbeResponse } from "~/services/verification/webAiApiCheck/types"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"

import {
  completeProductAnalyticsActionMock,
  startProductAnalyticsActionMock,
  upsertVerificationHistorySummaryMock,
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
  waitForSelectedModelId,
} from "./apiCheckModalHostTestSupport"

describe("ApiCheckModalHost", () => {
  setupApiCheckModalHostTest()

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

    const stopButton = await screen.findByRole("button", {
      name: "webAiApiCheck:modal.actions.stopTest",
    })
    expect(stopButton).toBeEnabled()
    expect(stopButton).toHaveAttribute("aria-busy", "true")
    await user.click(stopButton)

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
    const saveDeferred = createDeferred<any>()
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
          return saveDeferred.promise
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

    const savingButton = screen.getByRole("button", {
      name: "webAiApiCheck:modal.actions.saving",
    })
    expect(savingButton).toHaveAttribute("aria-busy", "true")
    expect(savingButton).toBeDisabled()
    const testButton = screen.getByRole("button", {
      name: "webAiApiCheck:modal.actions.test",
    })
    expect(testButton).not.toHaveAttribute("aria-busy")

    await user.click(savingButton)
    expect(
      vi
        .mocked(sendWebAiApiCheckMessage)
        .mock.calls.filter(
          ([type]) => type === WebAiApiCheckMessageTypes.SaveProfile,
        ),
    ).toHaveLength(1)

    await waitFor(() => {
      expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.SaveProfile, {
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-test-secret-fixture",
        pageUrl: "https://example.com",
      })
    })

    await act(async () => {
      saveDeferred.resolve({
        success: true,
        profileId: "p-1",
        name: "proxy.example.com",
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
      })
    })

    await waitFor(() => {
      expect(
        screen.queryByRole("button", {
          name: "webAiApiCheck:modal.actions.saving",
        }),
      ).not.toBeInTheDocument()
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

  it("persists completed pre-save probe results as profile verification history after saving", async () => {
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
              latencyMs: 12,
              summary: "Text generation OK",
              summaryKey: "verifyDialog.summaries.textGenerationSucceeded",
              summaryParams: { model: "gpt-test-model" },
            },
          }
        }
        if (type === WebAiApiCheckMessageTypes.SaveProfile) {
          return {
            success: true,
            profileId: "p-verified",
            name: "proxy.example.com",
            apiType: message.apiType,
            baseUrl: "https://proxy.example.com/api",
          }
        }
        return { success: false }
      },
    )

    await openModal()

    await user.click(
      await screen.findByPlaceholderText("https://example.com/api"),
    )
    await user.paste("https://proxy.example.com/api")
    await user.click(await screen.findByPlaceholderText("sk-..."))
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
    expect(
      await within(probeCard).findByText(
        "aiApiVerification:verifyDialog.summaries.textGenerationSucceeded",
      ),
    ).toBeVisible()

    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.actions.saveToProfiles",
      }),
    )

    await waitFor(() => {
      expect(upsertVerificationHistorySummaryMock).toHaveBeenCalledWith(
        expect.objectContaining({
          target: {
            kind: "profile-model",
            profileId: "p-verified",
            modelId: "gpt-test-model",
          },
          targetKey: "profile:p-verified:model:gpt-test-model",
          status: "pass",
          apiType: "openai-compatible",
          resolvedModelId: "gpt-test-model",
          probes: [
            expect.objectContaining({
              id: "text-generation",
              status: "pass",
              latencyMs: 12,
              summary: "Text generation OK",
              summaryKey: "verifyDialog.summaries.textGenerationSucceeded",
              summaryParams: { model: "gpt-test-model" },
            }),
          ],
        }),
      )
    })
  })

  it("does not persist stale pre-save probe results after credentials change", async () => {
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
              latencyMs: 12,
              summary: "Text generation OK",
            },
          }
        }
        if (type === WebAiApiCheckMessageTypes.SaveProfile) {
          return {
            success: true,
            profileId: "p-changed",
            name: "proxy.example.com",
            apiType: message.apiType,
            baseUrl: "https://proxy.example.com/api",
          }
        }
        return { success: false }
      },
    )

    await openModal()

    await user.click(
      await screen.findByPlaceholderText("https://example.com/api"),
    )
    await user.paste("https://proxy.example.com/api")
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")
    await user.click(apiKeyInput)
    await user.paste("sk-test-original-fixture")

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
    expect(
      await within(probeCard).findByText("Text generation OK"),
    ).toBeVisible()

    await user.clear(apiKeyInput)
    await user.paste("sk-test-changed-fixture")
    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.actions.saveToProfiles",
      }),
    )

    await waitFor(() => {
      expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.SaveProfile, {
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-test-changed-fixture",
        pageUrl: "https://example.com",
      })
    })
    expect(upsertVerificationHistorySummaryMock).not.toHaveBeenCalled()
  })

  it("does not persist mixed-context pre-save probe results after a later probe matches changed credentials", async () => {
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
              latencyMs: 12,
              summary:
                message.probeId === "models"
                  ? "Original models OK"
                  : "Changed text generation OK",
            },
          }
        }
        if (type === WebAiApiCheckMessageTypes.SaveProfile) {
          return {
            success: true,
            profileId: "p-changed",
            name: "proxy.example.com",
            apiType: message.apiType,
            baseUrl: "https://proxy.example.com/api",
          }
        }
        return { success: false }
      },
    )

    await openModal()

    await user.click(
      await screen.findByPlaceholderText("https://example.com/api"),
    )
    await user.paste("https://proxy.example.com/api")
    const apiKeyInput = await screen.findByPlaceholderText("sk-...")
    await user.click(apiKeyInput)
    await user.paste("sk-test-original-fixture")

    await waitFor(() => {
      expect(
        screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
      ).toHaveTextContent("gpt-test-model")
    })

    const modelsProbeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("models"),
    )
    await user.click(
      within(modelsProbeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )
    expect(
      await within(modelsProbeCard).findByText("Original models OK"),
    ).toBeVisible()

    await user.clear(apiKeyInput)
    await user.paste("sk-test-changed-fixture")

    await waitFor(() => {
      expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.FetchModels, {
        apiType: "openai-compatible",
        baseUrl: "https://proxy.example.com/api",
        apiKey: "sk-test-changed-fixture",
      })
    })

    const textGenerationProbeCard = await screen.findByTestId(
      getWebAiApiCheckProbeTestId("text-generation"),
    )
    await user.click(
      within(textGenerationProbeCard).getByRole("button", {
        name: "webAiApiCheck:modal.actions.runOne",
      }),
    )
    expect(
      await within(textGenerationProbeCard).findByText(
        "Changed text generation OK",
      ),
    ).toBeVisible()

    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.actions.saveToProfiles",
      }),
    )

    await waitFor(() => {
      expect(upsertVerificationHistorySummaryMock).toHaveBeenCalled()
    })
    const [[summary]] = upsertVerificationHistorySummaryMock.mock.calls
    expect(summary.probes).toEqual([
      expect.objectContaining({
        id: "text-generation",
        summary: "Changed text generation OK",
      }),
    ])
  })

  it("saves profile metadata entered in the API check modal", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.ListTags) {
          return {
            success: true,
            tags: [
              { id: "tag-work", name: "Work", createdAt: 1, updatedAt: 1 },
              {
                id: "tag-expiring",
                name: "Expiring",
                createdAt: 2,
                updatedAt: 2,
              },
            ],
          }
        }
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

    await openModal()

    await user.click(
      await screen.findByPlaceholderText("https://example.com/api"),
    )
    await user.paste("https://proxy.example.com/api")
    await user.click(await screen.findByPlaceholderText("sk-..."))
    await user.paste("sk-test-secret-fixture")

    expect(
      screen.queryByRole("button", {
        name: "webAiApiCheck:modal.optionalProfileFields.title",
      }),
    ).not.toBeNull()
    expect(
      screen.queryByRole("button", {
        name: "webAiApiCheck:modal.placeholders.tags",
      }),
    ).toBeNull()

    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.optionalProfileFields.title",
      }),
    )

    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.placeholders.tags",
      }),
    )
    expect(screen.queryByLabelText("accountDialog:form.tagsDelete")).toBeNull()
    await user.click(await screen.findByText("Work"))
    await user.click(await screen.findByText("Expiring"))

    await user.click(
      await screen.findByPlaceholderText(
        "webAiApiCheck:modal.placeholders.notes",
      ),
    )
    await user.paste("Shared by Alice")
    fireEvent.change(
      await screen.findByLabelText("webAiApiCheck:modal.fields.expiresAt"),
      { target: { value: "2026-10-31" } },
    )

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
        tagIds: ["tag-work", "tag-expiring"],
        notes: "Shared by Alice",
        expiresAt: new Date(2026, 9, 31).getTime(),
      })
    })
  })

  it("ignores impossible calendar dates when preparing profile metadata", () => {
    expect(parseDateInputValue("2026-02-31")).toBeNull()
  })

  it("rejects expanded-year calendar dates when preparing profile metadata", () => {
    expect(parseDateInputValue("202607-01-01")).toBeNull()
  })

  it("clears stale global tags before reloading them on modal open", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.ListTags) {
          return {
            success: true,
            tags: [
              { id: "tag-work", name: "Work", createdAt: 1, updatedAt: 1 },
            ],
          }
        }
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        return { success: false }
      },
    )

    await openModal()

    const optionalSaveFieldsTrigger = await screen.findByRole("button", {
      name: "webAiApiCheck:modal.optionalProfileFields.title",
    })
    await user.click(optionalSaveFieldsTrigger)
    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.placeholders.tags",
      }),
    )
    expect(await screen.findByText("Work")).toBeInTheDocument()
    await user.keyboard("{Escape}")

    await user.click(
      await screen.findByRole("button", {
        name: "common:actions.close",
      }),
    )

    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.ListTags) {
          return { success: false, error: "Tags unavailable" }
        }
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        return { success: false }
      },
    )

    await act(async () => {
      dispatchOpenApiCheckModal({
        sourceText: "",
        pageUrl: "https://example.com/next",
        trigger: "contextMenu",
      })
    })

    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.optionalProfileFields.title",
      }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.placeholders.tags",
      }),
    )

    await waitFor(() => {
      expect(screen.queryByText("Work")).toBeNull()
    })
  })

  it("adds created tags to the modal tag picker and selection", async () => {
    const user = userEvent.setup()

    await openModal()

    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.optionalProfileFields.title",
      }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.placeholders.tags",
      }),
    )
    await user.type(
      await screen.findByPlaceholderText(
        "accountDialog:form.tagsSearchPlaceholder",
      ),
      "Created",
    )
    await user.click(
      await screen.findByRole("button", {
        name: "accountDialog:form.tagsCreate",
      }),
    )

    await waitFor(() => {
      expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.CreateTag, {
        name: "Created",
      })
    })
    expect(
      await screen.findByRole("button", {
        name: "accountDialog:form.tagsSelectedCount",
      }),
    ).toBeInTheDocument()
  })

  it("shows the local create-tag fallback when the background response has no error", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.ListTags) {
          return { success: true, tags: [] }
        }
        if (type === WebAiApiCheckMessageTypes.CreateTag) {
          return { success: false }
        }
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        return { success: false }
      },
    )

    await openModal()

    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.optionalProfileFields.title",
      }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.placeholders.tags",
      }),
    )
    await user.type(
      await screen.findByPlaceholderText(
        "accountDialog:form.tagsSearchPlaceholder",
      ),
      "Created",
    )
    await user.click(
      await screen.findByRole("button", {
        name: "accountDialog:form.tagsCreate",
      }),
    )

    expect(
      await screen.findByRole("alert", {
        name: "",
      }),
    ).toHaveTextContent("accountDialog:messages.operationFailed")
  })

  it("renames global tags in the modal tag picker", async () => {
    const user = userEvent.setup()

    await openModal()

    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.optionalProfileFields.title",
      }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.placeholders.tags",
      }),
    )
    await user.type(
      await screen.findByPlaceholderText(
        "accountDialog:form.tagsSearchPlaceholder",
      ),
      "Work",
    )
    await user.click(
      await screen.findByLabelText("accountDialog:form.tagsRename"),
    )
    const renameInput = (await screen.findAllByDisplayValue("Work")).find(
      (input) =>
        input.getAttribute("placeholder") !==
        "accountDialog:form.tagsSearchPlaceholder",
    ) as HTMLInputElement
    await user.clear(renameInput)
    await user.type(renameInput, "Renamed")
    await user.click(
      await screen.findByLabelText("accountDialog:form.tagsRenameSave"),
    )

    await waitFor(() => {
      expectTypedApiCheckMessage(WebAiApiCheckMessageTypes.RenameTag, {
        tagId: "tag-work",
        name: "Renamed",
      })
    })
    await user.click(
      await screen.findByRole("button", { name: "common:actions.clear" }),
    )
    expect(await screen.findByText("Renamed")).toBeInTheDocument()
  })

  it("shows the local rename-tag fallback when the background response has no error", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
        if (type === WebAiApiCheckMessageTypes.ListTags) {
          return {
            success: true,
            tags: [
              { id: "tag-work", name: "Work", createdAt: 1, updatedAt: 1 },
            ],
          }
        }
        if (type === WebAiApiCheckMessageTypes.RenameTag) {
          return { success: false }
        }
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        return { success: false }
      },
    )

    await openModal()

    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.optionalProfileFields.title",
      }),
    )
    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.placeholders.tags",
      }),
    )
    await user.click(
      await screen.findByLabelText("accountDialog:form.tagsRename"),
    )
    const renameInput = await screen.findByDisplayValue("Work")
    await user.clear(renameInput)
    await user.type(renameInput, "Renamed")
    await user.click(
      await screen.findByLabelText("accountDialog:form.tagsRenameSave"),
    )

    expect(
      await screen.findByRole("alert", {
        name: "",
      }),
    ).toHaveTextContent("accountDialog:messages.operationFailed")
  })

  it("omits an invalid profile expiration date when saving metadata", async () => {
    const user = userEvent.setup()
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any, message: any) => {
        if (type === WebAiApiCheckMessageTypes.ListTags) {
          return { success: true, tags: [] }
        }
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

    await openModal()

    await user.click(
      await screen.findByPlaceholderText("https://example.com/api"),
    )
    await user.paste("https://proxy.example.com/api")
    await user.click(await screen.findByPlaceholderText("sk-..."))
    await user.paste("sk-test-secret-fixture")
    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.optionalProfileFields.title",
      }),
    )
    fireEvent.change(
      await screen.findByLabelText("webAiApiCheck:modal.fields.expiresAt"),
      { target: { value: "2026-02-31" } },
    )

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
  })

  it("lets users collapse optional save fields without losing entered metadata", async () => {
    const user = userEvent.setup()

    await openModal()

    const optionalSaveFieldsTrigger = await screen.findByRole("button", {
      name: "webAiApiCheck:modal.optionalProfileFields.title",
    })
    await user.click(optionalSaveFieldsTrigger)

    await user.click(
      await screen.findByRole("button", {
        name: "webAiApiCheck:modal.placeholders.tags",
      }),
    )
    await user.click(await screen.findByText("Work"))

    fireEvent.change(
      await screen.findByLabelText("webAiApiCheck:modal.fields.expiresAt"),
      { target: { value: "2026-10-31" } },
    )

    await user.click(
      await screen.findByPlaceholderText(
        "webAiApiCheck:modal.placeholders.notes",
      ),
    )
    await user.paste("Shared by Alice")

    expect(
      screen.getByText("webAiApiCheck:modal.optionalProfileFields.hasInput"),
    ).toBeInTheDocument()

    await user.click(optionalSaveFieldsTrigger)

    expect(
      screen.queryByPlaceholderText("webAiApiCheck:modal.placeholders.notes"),
    ).toBeNull()
    expect(optionalSaveFieldsTrigger).toHaveAttribute("aria-expanded", "false")

    await user.click(optionalSaveFieldsTrigger)

    expect(await screen.findByText("Work")).toBeInTheDocument()
    expect(
      await screen.findByLabelText("webAiApiCheck:modal.fields.expiresAt"),
    ).toHaveValue("2026-10-31")
    expect(
      await screen.findByPlaceholderText(
        "webAiApiCheck:modal.placeholders.notes",
      ),
    ).toHaveValue("Shared by Alice")
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

    const baseUrlInput = await screen.findByLabelText(
      "webAiApiCheck:modal.fields.baseUrl",
    )
    const apiKeyInput = screen.getByLabelText(
      "webAiApiCheck:modal.fields.apiKey",
    )
    await pasteIntoField(user, baseUrlInput, "https://proxy.example.com/api")
    await pasteIntoField(user, apiKeyInput, "sk-test-missing-model-fixture")

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

    const baseUrlInput = await screen.findByLabelText(
      "webAiApiCheck:modal.fields.baseUrl",
    )
    const apiKeyInput = screen.getByLabelText(
      "webAiApiCheck:modal.fields.apiKey",
    )
    await pasteIntoField(user, baseUrlInput, "https://proxy.example.com/api")
    await pasteIntoField(
      user,
      apiKeyInput,
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
  }, 30_000)

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
