import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  RedemptionBatchResultToast,
  type RedemptionBatchResultItem,
} from "~/entrypoints/content/redemptionAssist/components/RedemptionBatchResultToast"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"

const {
  completeProductAnalyticsActionMock,
  loggerErrorMock,
  startProductAnalyticsActionMock,
  trackProductAnalyticsActionStartedMock,
} = vi.hoisted(() => ({
  completeProductAnalyticsActionMock: vi.fn(),
  loggerErrorMock: vi.fn(),
  startProductAnalyticsActionMock: vi.fn(),
  trackProductAnalyticsActionStartedMock: vi.fn(),
}))

vi.mock("react-i18next", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-i18next")>()

  return {
    ...actual,
    useTranslation: () => ({
      t: (key: string, options?: Record<string, unknown>) => {
        if (key === "redemptionAssist:messages.batchResultSummary") {
          return `summary:${options?.total}/${options?.success}/${options?.failed}`
        }

        const labels: Record<string, string> = {
          "redemptionAssist:messages.batchResultTitle": "Redeem results",
          "common:actions.close": "Close",
          "common:status.success": "Success",
          "common:status.failed": "Failed",
          "common:status.loading": "Loading",
          "common:actions.retry": "Retry",
          "common:status.error": "Generic error",
        }

        return labels[key] ?? key
      },
    }),
  }
})

vi.mock("~/components/ui", () => ({
  Body: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  Button: ({
    children,
    disabled,
    onClick,
    size,
    variant,
  }: {
    children: React.ReactNode
    disabled?: boolean
    onClick?: () => void
    size?: string
    variant?: string
  }) => (
    <button
      type="button"
      data-size={size}
      data-variant={variant}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  ),
  Card: ({ children }: { children: React.ReactNode }) => (
    <section>{children}</section>
  ),
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Heading3: ({ children }: { children: React.ReactNode }) => (
    <h3>{children}</h3>
  ),
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => ({
    error: loggerErrorMock,
  }),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    startProductAnalyticsActionMock(...args),
  trackProductAnalyticsActionStarted: (...args: unknown[]) =>
    trackProductAnalyticsActionStartedMock(...args),
}))

const retryAnalyticsContext = {
  featureId: PRODUCT_ANALYTICS_FEATURE_IDS.RedemptionAssist,
  actionId: PRODUCT_ANALYTICS_ACTION_IDS.RetryRedemptionCode,
  surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.ContentRedemptionBatchResultToast,
  entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Content,
}

describe("RedemptionBatchResultToast", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    completeProductAnalyticsActionMock.mockResolvedValue(undefined)
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
  })

  it("renders the batch summary, distinguishes success from failure rows, and closes from the header action", () => {
    const onClose = vi.fn()

    render(
      <RedemptionBatchResultToast
        results={[
          {
            code: "code-success",
            preview: "OK***1",
            success: true,
            message: "Redeemed successfully",
          },
          {
            code: "code-failed",
            preview: "ERR***2",
            success: false,
            message: "Redeem failed",
            errorMessage: "Network error",
          },
        ]}
        onRetry={vi.fn()}
        onClose={onClose}
      />,
    )

    expect(screen.getByText("summary:2/1/1")).toBeInTheDocument()
    expect(screen.getByText("Success")).toBeInTheDocument()
    expect(screen.getByText("Failed")).toBeInTheDocument()
    expect(screen.getByText("Redeemed successfully")).toBeInTheDocument()
    expect(screen.getByText("Redeem failed")).toBeInTheDocument()

    fireEvent.click(screen.getByRole("button", { name: "Close" }))

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("retries a failed code, shows the loading state, and replaces the row with the successful retry result", async () => {
    let resolveRetry: ((value: RedemptionBatchResultItem) => void) | undefined
    const onRetry = vi.fn<(code: string) => Promise<RedemptionBatchResultItem>>(
      () =>
        new Promise<RedemptionBatchResultItem>((resolve) => {
          resolveRetry = resolve
        }),
    )

    render(
      <RedemptionBatchResultToast
        results={[
          {
            code: "code-failed",
            preview: "ERR***2",
            success: false,
            message: "Redeem failed",
          },
        ]}
        onRetry={onRetry}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry" }))

    expect(onRetry).toHaveBeenCalledWith("code-failed")
    expect(screen.getByRole("button", { name: "Loading" })).toBeDisabled()

    resolveRetry?.({
      code: "code-failed",
      preview: "ERR***2",
      success: true,
      message: "Recovered",
    })

    await waitFor(() => {
      expect(screen.getByText("summary:1/1/0")).toBeInTheDocument()
    })
    expect(screen.getByText("Recovered")).toBeInTheDocument()
    expect(screen.getByText("Success")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "Retry" }),
    ).not.toBeInTheDocument()
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith(
      retryAnalyticsContext,
    )
    expect(trackProductAnalyticsActionStartedMock).not.toHaveBeenCalledWith(
      retryAnalyticsContext,
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("completes retry analytics as failure when the retry resolves with a failed result", async () => {
    const onRetry = vi.fn().mockResolvedValue({
      code: "code-failed",
      preview: "ERR***2",
      success: false,
      message: "Still failed",
    })

    render(
      <RedemptionBatchResultToast
        results={[
          {
            code: "code-failed",
            preview: "ERR***2",
            success: false,
            message: "Redeem failed",
          },
        ]}
        onRetry={onRetry}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry" }))

    await waitFor(() => {
      expect(screen.getByText("Still failed")).toBeInTheDocument()
    })

    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith(
      retryAnalyticsContext,
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("keeps the row failed and records the retry error message when a retry throws", async () => {
    const retryError = "Temporary outage"
    const onRetry = vi.fn().mockRejectedValue(retryError)

    render(
      <RedemptionBatchResultToast
        results={[
          {
            code: "code-failed",
            preview: "ERR***2",
            success: false,
            message: "Redeem failed",
          },
        ]}
        onRetry={onRetry}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry" }))

    await waitFor(() => {
      expect(screen.getByText("Temporary outage")).toBeInTheDocument()
    })

    expect(loggerErrorMock).toHaveBeenCalledWith("Retry failed", retryError)
    expect(screen.getByText("summary:1/0/1")).toBeInTheDocument()
    expect(screen.getByText("Failed")).toBeInTheDocument()
    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith(
      retryAnalyticsContext,
    )
    expect(completeProductAnalyticsActionMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      { errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown },
    )
  })

  it("surfaces Error retry failures with the error message", async () => {
    const retryError = new Error("Backend unavailable")
    const onRetry = vi.fn().mockRejectedValue(retryError)

    render(
      <RedemptionBatchResultToast
        results={[
          {
            code: "code-failed",
            preview: "ERR***3",
            success: false,
            message: "Redeem failed",
          },
        ]}
        onRetry={onRetry}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry" }))

    await waitFor(() => {
      expect(screen.getByText("Backend unavailable")).toBeInTheDocument()
    })

    expect(loggerErrorMock).toHaveBeenCalledWith("Retry failed", retryError)
    expect(screen.getByText("summary:1/0/1")).toBeInTheDocument()
  })

  it("falls back to the generic error label when a retry rejects with a non-error value", async () => {
    const onRetry = vi.fn().mockRejectedValue({ transient: true })

    render(
      <RedemptionBatchResultToast
        results={[
          {
            code: "code-failed",
            preview: "ERR***4",
            success: false,
            message: "Redeem failed",
          },
        ]}
        onRetry={onRetry}
        onClose={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole("button", { name: "Retry" }))

    await waitFor(() => {
      expect(screen.getByText("Generic error")).toBeInTheDocument()
    })

    expect(loggerErrorMock).toHaveBeenCalledWith("Retry failed", {
      transient: true,
    })
    expect(screen.getByText("Failed")).toBeInTheDocument()
  })
})
