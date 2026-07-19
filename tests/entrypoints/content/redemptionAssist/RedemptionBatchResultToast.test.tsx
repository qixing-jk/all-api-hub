import { act, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RedemptionBatchResultToast } from "~/entrypoints/content/redemptionAssist/components/RedemptionBatchResultToast"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"

const { trackStartedMock, startActionMock, completeActionMock } = vi.hoisted(
  () => ({
    trackStartedMock: vi.fn(),
    startActionMock: vi.fn(),
    completeActionMock: vi.fn(),
  }),
)

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: startActionMock,
  trackProductAnalyticsActionStarted: trackStartedMock,
}))

const createDeferred = <T,>() => {
  let resolve!: (value: T | PromiseLike<T>) => void
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}

describe("RedemptionBatchResultToast", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    startActionMock.mockReturnValue({
      complete: completeActionMock,
    })
    trackStartedMock.mockResolvedValue(undefined)
  })

  it("tracks fixed analytics metadata for closing and retrying batch results", async () => {
    const user = userEvent.setup()
    const retryDeferred = createDeferred<{
      code: string
      preview: string
      success: boolean
      message: string
    }>()
    const onRetry = vi.fn().mockReturnValue(retryDeferred.promise)

    render(
      <RedemptionBatchResultToast
        results={[
          {
            code: "code-a",
            preview: "AA**",
            success: false,
            message: "Failed",
          },
          {
            code: "code-b",
            preview: "BB**",
            success: false,
            message: "Failed",
          },
        ]}
        onRetry={onRetry}
        onClose={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )
    const [firstRetryButton] = screen.getAllByRole("button", {
      name: "common:actions.retry",
    })
    await user.click(firstRetryButton)

    const retryingButton = screen.getByRole("button", {
      name: "common:status.retrying",
    })
    expect(retryingButton).toHaveAttribute("aria-busy", "true")
    expect(retryingButton).toBeDisabled()
    const siblingRetryButton = screen.getByRole("button", {
      name: "common:actions.retry",
    })
    expect(siblingRetryButton).toBeDisabled()
    expect(siblingRetryButton).not.toHaveAttribute("aria-busy")

    await user.click(retryingButton)
    expect(onRetry).toHaveBeenCalledTimes(1)

    await act(async () => {
      retryDeferred.resolve({
        code: "code-a",
        preview: "AA**",
        success: true,
        message: "Redeemed",
      })
    })

    await waitFor(() => {
      expect(completeActionMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Success,
      )
    })

    expect(trackStartedMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.CloseRedemptionBatchResult,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionBatchResultToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
    expect(startActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RetryRedemptionCode,
      surfaceId:
        PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionBatchResultToast,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
    })
  })

  it("tracks failed retry completion using a structured category without leaking raw code", async () => {
    const user = userEvent.setup()

    render(
      <RedemptionBatchResultToast
        results={[
          {
            code: "raw-secret-code",
            preview: "RA**",
            success: false,
            message: "Failed",
          },
        ]}
        onRetry={vi.fn().mockResolvedValue({
          code: "raw-secret-code",
          preview: "RA**",
          success: false,
          message: "private backend failure text",
          errorMessage: "private backend failure text",
          analyticsErrorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
        })}
        onClose={vi.fn()}
      />,
    )

    await user.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )

    expect(completeActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      {
        errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Validation,
      },
    )

    const analyticsPayloads = JSON.stringify([
      startActionMock.mock.calls,
      completeActionMock.mock.calls,
    ])
    expect(analyticsPayloads).not.toContain("raw-secret-code")
    expect(analyticsPayloads).not.toContain("RA**")
    expect(analyticsPayloads).not.toContain("private backend")
  })
})
