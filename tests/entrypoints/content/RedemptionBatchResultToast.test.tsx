import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import React from "react"
import { I18nextProvider } from "react-i18next"
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import {
  RedemptionBatchResultToast,
  type RedemptionBatchResultItem,
} from "~/entrypoints/content/redemptionAssist/components/RedemptionBatchResultToast"
import enRedemptionAssist from "~/locales/en/redemptionAssist.json"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { testI18n } from "~~/tests/test-utils/i18n"

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

function renderToast(ui: React.ReactElement) {
  return render(<I18nextProvider i18n={testI18n}>{ui}</I18nextProvider>)
}

describe("RedemptionBatchResultToast", () => {
  beforeAll(() => {
    testI18n.addResource(
      "en",
      "redemptionAssist",
      "messages.batchResultSummary",
      enRedemptionAssist.messages.batchResultSummary,
    )
  })

  afterAll(() => {
    testI18n.removeResourceBundle("en", "redemptionAssist")
  })

  beforeEach(() => {
    vi.clearAllMocks()
    completeProductAnalyticsActionMock.mockResolvedValue(undefined)
    startProductAnalyticsActionMock.mockReturnValue({
      complete: completeProductAnalyticsActionMock,
    })
  })

  it("renders the batch summary, distinguishes success from failure rows, and closes from the header action", () => {
    const onClose = vi.fn()

    renderToast(
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

    expect(
      screen.getByText(
        testI18n.t("redemptionAssist:messages.batchResultSummary", {
          total: 2,
          success: 1,
          failed: 1,
        }),
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("common:status.success")).toBeInTheDocument()
    expect(screen.getByText("common:status.failed")).toBeInTheDocument()
    expect(screen.getByText("Redeemed successfully")).toBeInTheDocument()
    expect(screen.getByText("Redeem failed")).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.close" }),
    )

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

    renderToast(
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

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )

    expect(onRetry).toHaveBeenCalledWith("code-failed")
    expect(
      screen.getByRole("button", { name: "common:status.retrying" }),
    ).toBeDisabled()

    resolveRetry?.({
      code: "code-failed",
      preview: "ERR***2",
      success: true,
      message: "Recovered",
    })

    await waitFor(() => {
      expect(
        screen.getByText(
          testI18n.t("redemptionAssist:messages.batchResultSummary", {
            total: 1,
            success: 1,
            failed: 0,
          }),
        ),
      ).toBeInTheDocument()
    })
    expect(screen.getByText("Recovered")).toBeInTheDocument()
    expect(screen.getByText("common:status.success")).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: "common:actions.retry" }),
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

    renderToast(
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

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )

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

    renderToast(
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

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )

    await waitFor(() => {
      expect(screen.getByText("Temporary outage")).toBeInTheDocument()
    })

    expect(loggerErrorMock).toHaveBeenCalledWith("Retry failed", retryError)
    expect(
      screen.getByText(
        testI18n.t("redemptionAssist:messages.batchResultSummary", {
          total: 1,
          success: 0,
          failed: 1,
        }),
      ),
    ).toBeInTheDocument()
    expect(screen.getByText("common:status.failed")).toBeInTheDocument()
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

    renderToast(
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

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )

    await waitFor(() => {
      expect(screen.getByText("Backend unavailable")).toBeInTheDocument()
    })

    expect(loggerErrorMock).toHaveBeenCalledWith("Retry failed", retryError)
    expect(
      screen.getByText(
        testI18n.t("redemptionAssist:messages.batchResultSummary", {
          total: 1,
          success: 0,
          failed: 1,
        }),
      ),
    ).toBeInTheDocument()
  })

  it("falls back to the generic error label when a retry rejects with a non-error value", async () => {
    const onRetry = vi.fn().mockRejectedValue({ transient: true })

    renderToast(
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

    fireEvent.click(
      screen.getByRole("button", { name: "common:actions.retry" }),
    )

    await waitFor(() => {
      expect(screen.getByText("common:status.error")).toBeInTheDocument()
    })

    expect(loggerErrorMock).toHaveBeenCalledWith("Retry failed", {
      transient: true,
    })
    expect(screen.getByText("common:status.failed")).toBeInTheDocument()
  })
})
