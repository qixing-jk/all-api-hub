import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AccountManagement from "~/features/AccountManagement/AccountManagement"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_ENTRYPOINTS,
  PRODUCT_ANALYTICS_ERROR_CATEGORIES,
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/events"
import { fireEvent, render, screen, waitFor } from "~~/tests/test-utils/render"

const openAddAccountMock = vi.fn()
const handleRefreshMock = vi.fn()
const handleRefreshDisabledAccountsMock = vi.fn()
const handleOpenExternalCheckInsMock = vi.fn()
const mockLogger = vi.hoisted(() => ({
  error: vi.fn(),
}))
const toastPromiseMock = vi.hoisted(() => vi.fn())
const { startProductAnalyticsActionMock, trackerCompleteMock } = vi.hoisted(
  () => ({
    startProductAnalyticsActionMock: vi.fn(),
    trackerCompleteMock: vi.fn(),
  }),
)
const accountDataContextState = vi.hoisted(() => ({
  current: {
    displayData: [] as any[],
    isRefreshing: false,
    isRefreshingDisabledAccounts: false,
  },
}))

vi.mock("react-hot-toast", () => ({
  default: {
    promise: toastPromiseMock,
  },
}))

vi.mock("~/utils/core/logger", () => ({
  createLogger: () => mockLogger,
}))

vi.mock("~/features/AccountManagement/hooks/AccountManagementProvider", () => ({
  AccountManagementProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))

vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({
    openAddAccount: openAddAccountMock,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    ...accountDataContextState.current,
    handleRefresh: handleRefreshMock,
    handleRefreshDisabledAccounts: handleRefreshDisabledAccountsMock,
  }),
}))

vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
  useAccountActionsContext: () => ({
    handleOpenExternalCheckIns: handleOpenExternalCheckInsMock,
  }),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: (...args: unknown[]) =>
    startProductAnalyticsActionMock(...args),
}))

vi.mock("~/features/AccountManagement/components/AccountList", () => ({
  default: () => <div>AccountList</div>,
}))

vi.mock("~/features/AccountManagement/components/DedupeAccountsDialog", () => ({
  default: ({ isOpen }: { isOpen: boolean }) =>
    isOpen ? <div>DedupeAccountsDialog</div> : null,
}))

beforeEach(() => {
  vi.clearAllMocks()
  trackerCompleteMock.mockResolvedValue(undefined)
  startProductAnalyticsActionMock.mockReturnValue({
    complete: trackerCompleteMock,
  })
  accountDataContextState.current = {
    displayData: [],
    isRefreshing: false,
    isRefreshingDisabledAccounts: false,
  }
  handleRefreshMock.mockResolvedValue({
    success: 0,
    failed: 0,
    latestSyncTime: 0,
    refreshedCount: 0,
  })
  handleRefreshDisabledAccountsMock.mockResolvedValue({
    processedCount: 0,
    failedCount: 0,
    reEnabledCount: 0,
    latestSyncTime: 0,
  })
  toastPromiseMock.mockImplementation(async (promise: Promise<unknown>) => {
    return await promise
  })
})

describe("AccountManagement refresh analytics", () => {
  it("completes global refresh with safe count insights", async () => {
    handleRefreshMock.mockResolvedValueOnce({
      success: 2,
      failed: 1,
      latestSyncTime: 0,
      refreshedCount: 2,
    })

    render(<AccountManagement />)

    fireEvent.click(
      await screen.findByRole("button", { name: "common:actions.refresh" }),
    )

    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshAllAccounts,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    await waitFor(() => {
      expect(trackerCompleteMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            itemCount: 3,
            successCount: 2,
            failureCount: 1,
          },
        },
      )
    })
  })

  it("completes disabled-account refresh with safe count insights", async () => {
    accountDataContextState.current = {
      ...accountDataContextState.current,
      displayData: [{ id: "disabled-1", disabled: true }],
    }
    handleRefreshDisabledAccountsMock.mockResolvedValueOnce({
      processedCount: 3,
      failedCount: 1,
      reEnabledCount: 1,
      latestSyncTime: 0,
    })

    render(<AccountManagement />)

    fireEvent.click(
      await screen.findByRole("button", {
        name: "account:actions.refreshDisabledAccounts",
      }),
    )

    expect(startProductAnalyticsActionMock).toHaveBeenCalledWith({
      featureId: PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement,
      actionId: PRODUCT_ANALYTICS_ACTION_IDS.RefreshDisabledAccounts,
      surfaceId: PRODUCT_ANALYTICS_SURFACE_IDS.OptionsAccountManagementHeader,
      entrypoint: PRODUCT_ANALYTICS_ENTRYPOINTS.Options,
    })
    await waitFor(() => {
      expect(trackerCompleteMock).toHaveBeenCalledWith(
        PRODUCT_ANALYTICS_RESULTS.Failure,
        {
          errorCategory: PRODUCT_ANALYTICS_ERROR_CATEGORIES.Unknown,
          insights: {
            itemCount: 3,
            successCount: 2,
            failureCount: 1,
          },
        },
      )
    })
  })
})
