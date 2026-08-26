import { act, screen, waitFor } from "@testing-library/react"
import type userEvent from "@testing-library/user-event"
import toast from "react-hot-toast/headless"
import { beforeEach, expect, vi } from "vitest"

import { ApiCheckModalHost } from "~/entrypoints/content/webAiApiCheck/components/ApiCheckModalHost"
import {
  API_CHECK_MODAL_HOST_READY_EVENT,
  dispatchOpenApiCheckModal,
  type ApiCheckOpenModalDetail,
} from "~/entrypoints/content/webAiApiCheck/events"
import { WEB_AI_API_CHECK_TEST_IDS } from "~/entrypoints/content/webAiApiCheck/testIds"
import {
  sendWebAiApiCheckMessage,
  WebAiApiCheckMessageTypes,
} from "~/services/verification/webAiApiCheck/messaging"
import { sendRuntimeMessage } from "~/utils/browser/browserApi"
import { render } from "~~/tests/test-utils/render"

import {
  completeProductAnalyticsActionMock,
  startProductAnalyticsActionMock,
  updateWebAiApiCheckMock,
  upsertVerificationHistorySummaryMock,
} from "./apiCheckModalHostMocks"

export function createDeferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve
    reject = promiseReject
  })
  return { promise, resolve, reject }
}

/**
 * Registers shared mock-reset hooks; call inside each split file's
 * describe block.
 */
export const setupApiCheckModalHostTest = () => {
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
    upsertVerificationHistorySummaryMock.mockReset()
    upsertVerificationHistorySummaryMock.mockImplementation(
      async (summary) => summary,
    )
    vi.mocked(sendRuntimeMessage).mockReset()
    vi.mocked(sendRuntimeMessage).mockResolvedValue({ success: false })
    vi.mocked(sendWebAiApiCheckMessage).mockImplementation(
      async (type: any) => {
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
        if (type === WebAiApiCheckMessageTypes.CreateTag) {
          return {
            success: true,
            tag: {
              id: "tag-created",
              name: "Created",
              createdAt: 3,
              updatedAt: 3,
            },
          }
        }
        if (type === WebAiApiCheckMessageTypes.RenameTag) {
          return {
            success: true,
            tag: {
              id: "tag-work",
              name: "Renamed",
              createdAt: 1,
              updatedAt: 4,
            },
          }
        }
        if (type === WebAiApiCheckMessageTypes.FetchModels) {
          return { success: true, modelIds: [] }
        }
        return { success: false }
      },
    )
  })
}

export const expectAnalyticsCallsToExcludeSensitiveValues = (
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

export const expectTypedApiCheckMessage = (
  type: (typeof WebAiApiCheckMessageTypes)[keyof typeof WebAiApiCheckMessageTypes],
  data: Record<string, unknown>,
) => {
  expect(sendWebAiApiCheckMessage).toHaveBeenCalledWith(type, data)
}

export const getApiCheckMessageCalls = (
  type: (typeof WebAiApiCheckMessageTypes)[keyof typeof WebAiApiCheckMessageTypes],
) =>
  vi
    .mocked(sendWebAiApiCheckMessage)
    .mock.calls.filter((call) => call[0] === type)

const renderSubject = () =>
  render(<ApiCheckModalHost />, {
    withThemeProvider: false,
    withUserPreferencesProvider: false,
  })

export const openModal = async (
  detailOverrides?: Partial<ApiCheckOpenModalDetail>,
) => {
  const defaultDetail: ApiCheckOpenModalDetail = {
    sourceText: "",
    pageUrl: "https://example.com",
    trigger: "contextMenu",
  }

  const hostReady = new Promise<void>((resolve) => {
    window.addEventListener(API_CHECK_MODAL_HOST_READY_EVENT, () => resolve(), {
      once: true,
    })
  })

  renderSubject()
  await hostReady

  await act(async () => {
    dispatchOpenApiCheckModal({ ...defaultDetail, ...detailOverrides })
  })
}

export const startManualProbeSuite = async (
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
    await waitForSelectedModelId(options.waitForModelId)
  }
  await user.click(await screen.findByText("webAiApiCheck:modal.actions.test"))
}

export const waitForSelectedModelId = async (modelId: string) => {
  await waitFor(() => {
    expect(
      screen.getByTestId(WEB_AI_API_CHECK_TEST_IDS.modelId),
    ).toHaveTextContent(modelId)
  })
}

export const pasteIntoField = async (
  user: ReturnType<typeof userEvent.setup>,
  field: HTMLElement,
  value: string,
) => {
  await user.click(field)
  await user.paste(value)
}
