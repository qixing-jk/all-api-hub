import { act, renderHook } from "@testing-library/react"
import { type MouseEvent } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { openExternalCheckIns } from "~/features/AccountManagement/utils/openExternalCheckIns"
import { useAutoCheckinRecovery } from "~/features/AutoCheckin/workspace/useAutoCheckinRecovery"
import toast from "~/lib/notify"
import { accountMutations } from "~/services/accounts/accountStorage/accountMutations"
import {
  startProductAnalyticsAction,
  trackProductAnalyticsActionCompleted,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  PRODUCT_ANALYTICS_RESULTS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"
import { getExternalCheckInOpenOptions } from "~/utils/core/shortcutKeys"
import {
  openAccountBaseUrl,
  openCheckInPage,
  openCheckInPages,
} from "~/utils/navigation/sitePages"
import { createDeferred } from "~~/tests/test-utils/deferred"

vi.mock("~/lib/notify", () => ({
  default: {
    loading: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
    dismiss: vi.fn(),
  },
}))

vi.mock("~/features/AccountManagement/utils/openExternalCheckIns", () => ({
  openExternalCheckIns: vi.fn(),
}))

vi.mock("~/services/accounts/accountStorage/accountMutations", () => ({
  accountMutations: {
    setAccountDisabled: vi.fn(),
  },
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  startProductAnalyticsAction: vi.fn(),
  trackProductAnalyticsActionCompleted: vi.fn(),
}))

vi.mock("~/utils/navigation/sitePages", () => ({
  openAccountBaseUrl: vi.fn(),
  openCheckInPage: vi.fn(),
  openCheckInPages: vi.fn(),
}))

vi.mock("~/utils/core/shortcutKeys", () => ({
  getExternalCheckInOpenOptions: vi.fn(),
}))

describe("useAutoCheckinRecovery", () => {
  const resolveAutoCheckinAccountMock = vi.fn()
  const loadStatusMock = vi.fn()
  const analyticsTrackerMock = {
    complete: vi.fn(),
  }

  const sampleAccount: DisplaySiteData = {
    id: "acc-rec-1",
    name: "Site Recovery",
    baseUrl: "https://rec.example.com",
    disabled: false,
  } as unknown as DisplaySiteData

  beforeEach(() => {
    vi.clearAllMocks()

    vi.mocked(startProductAnalyticsAction).mockReturnValue(
      analyticsTrackerMock as unknown as ReturnType<
        typeof startProductAnalyticsAction
      >,
    )
    vi.mocked(resolveAutoCheckinAccountMock).mockResolvedValue(sampleAccount)
    vi.mocked(accountMutations.setAccountDisabled).mockResolvedValue(true)
    vi.mocked(getExternalCheckInOpenOptions).mockReturnValue({
      openAll: false,
      openInNewWindow: false,
    })
  })

  it("opens account site and tracks analytics on success", async () => {
    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: [],
        externalCheckInAccounts: [],
        accountInfoById: { "acc-rec-1": sampleAccount },
      }),
    )

    await act(async () => {
      await result.current.handleOpenAccountSite("acc-rec-1")
    })

    expect(resolveAutoCheckinAccountMock).toHaveBeenCalledWith("acc-rec-1", {
      includeDisabled: true,
    })
    expect(openAccountBaseUrl).toHaveBeenCalledWith(sampleAccount)
    expect(trackProductAnalyticsActionCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAutoCheckinAccountSite,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
      }),
    )
  })

  it.each(["bulk", "account"])(
    "coalesces repeated %s external check-in opens while navigation is pending",
    async (scope) => {
      const pending =
        createDeferred<Awaited<ReturnType<typeof openExternalCheckIns>>>()
      vi.mocked(openExternalCheckIns).mockReturnValueOnce(pending.promise)
      const { result } = renderHook(() =>
        useAutoCheckinRecovery({
          resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
          loadStatus: loadStatusMock,
          failedManualAccountIds: [],
          externalCheckInAccounts: [sampleAccount],
          accountInfoById: { "acc-rec-1": sampleAccount },
        }),
      )
      const open = () =>
        scope === "bulk"
          ? result.current.handleOpenExternalCheckIns(
              {} as MouseEvent<HTMLButtonElement>,
            )
          : result.current.handleOpenAccountExternalCheckIn("acc-rec-1")
      let first!: Promise<void>
      act(() => {
        first = open()
      })
      await act(async () => {
        await open()
      })
      expect(openExternalCheckIns).toHaveBeenCalledTimes(1)

      await act(async () => {
        pending.resolve({
          openedAccountCount: 1,
          skipped: false,
          partialFailure: false,
          failed: false,
        } as Awaited<ReturnType<typeof openExternalCheckIns>>)
        await first
      })

      expect(result.current.isOpeningExternalCheckIns).toBe(false)
      expect(result.current.openingExternalCheckInAccountId).toBeNull()
    },
  )

  it("does not open an external check-in for an account missing from the snapshot", async () => {
    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: [],
        externalCheckInAccounts: [],
        accountInfoById: {},
      }),
    )

    await act(async () => {
      await result.current.handleOpenAccountExternalCheckIn("missing")
    })

    expect(openExternalCheckIns).not.toHaveBeenCalled()
    expect(result.current.openingExternalCheckInAccountId).toBeNull()
  })

  it("restores disable state and reports a failed account lookup", async () => {
    resolveAutoCheckinAccountMock.mockRejectedValueOnce(
      new Error("Account unavailable"),
    )
    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: [],
        externalCheckInAccounts: [],
        accountInfoById: {},
      }),
    )

    await act(async () => {
      await result.current.handleDisableAccount("missing")
    })

    expect(result.current.disablingAccountId).toBeNull()
    expect(accountMutations.setAccountDisabled).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      "messages:toast.error.operationFailed",
    )
    expect(analyticsTrackerMock.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.anything(),
    )
  })

  it("keeps deletion closed when the account lookup fails", async () => {
    resolveAutoCheckinAccountMock.mockRejectedValueOnce(
      new Error("Account unavailable"),
    )
    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: [],
        externalCheckInAccounts: [],
        accountInfoById: {},
      }),
    )

    await act(async () => {
      await result.current.handleDeleteAccount("missing")
    })

    expect(result.current.deletingAccountId).toBeNull()
    expect(result.current.deleteDialogAccount).toBeNull()
    expect(toast.error).toHaveBeenCalledWith(
      "messages:toast.error.operationFailed",
    )
  })

  it("restores bulk-open state when navigation throws", async () => {
    vi.mocked(openCheckInPages).mockRejectedValueOnce(
      new Error("Browser unavailable"),
    )
    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: ["acc-rec-1"],
        externalCheckInAccounts: [],
        accountInfoById: {},
      }),
    )

    await act(async () => {
      await result.current.handleOpenFailedManualSignIns(
        {} as MouseEvent<HTMLButtonElement>,
      )
    })

    expect(result.current.isOpeningFailedManualSignIns).toBe(false)
    expect(toast.dismiss).toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      "autoCheckin:messages.error.openFailedManualFailed",
    )
    expect(analyticsTrackerMock.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.objectContaining({
        insights: expect.objectContaining({ failureCount: 1 }),
      }),
    )
  })

  it("shows error toast when opening account site fails", async () => {
    vi.mocked(openAccountBaseUrl).mockRejectedValueOnce(
      new Error("Navigation blocked"),
    )

    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: [],
        externalCheckInAccounts: [],
        accountInfoById: { "acc-rec-1": sampleAccount },
      }),
    )

    await act(async () => {
      await result.current.handleOpenAccountSite("acc-rec-1")
    })

    expect(toast.error).toHaveBeenCalled()
    expect(trackProductAnalyticsActionCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        result: PRODUCT_ANALYTICS_RESULTS.Failure,
      }),
    )
  })

  it("opens manual sign in and tracks completion", async () => {
    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: [],
        externalCheckInAccounts: [],
        accountInfoById: { "acc-rec-1": sampleAccount },
      }),
    )

    await act(async () => {
      await result.current.handleOpenManualSignIn("acc-rec-1")
    })

    expect(resolveAutoCheckinAccountMock).toHaveBeenCalledWith("acc-rec-1")
    expect(openCheckInPage).toHaveBeenCalledWith(sampleAccount)
    expect(trackProductAnalyticsActionCompleted).toHaveBeenCalledWith(
      expect.objectContaining({
        actionId: PRODUCT_ANALYTICS_ACTION_IDS.OpenAutoCheckinManualSignIn,
        result: PRODUCT_ANALYTICS_RESULTS.Success,
      }),
    )
  })

  it("disables account, refreshes status, and shows success toast", async () => {
    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: [],
        externalCheckInAccounts: [],
        accountInfoById: { "acc-rec-1": sampleAccount },
      }),
    )

    await act(async () => {
      await result.current.handleDisableAccount("acc-rec-1")
    })

    expect(accountMutations.setAccountDisabled).toHaveBeenCalledWith(
      "acc-rec-1",
      true,
    )
    expect(loadStatusMock).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
    expect(analyticsTrackerMock.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
    )
  })

  it("handles failure when setAccountDisabled returns false", async () => {
    vi.mocked(accountMutations.setAccountDisabled).mockResolvedValueOnce(false)

    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: [],
        externalCheckInAccounts: [],
        accountInfoById: { "acc-rec-1": sampleAccount },
      }),
    )

    await act(async () => {
      await result.current.handleDisableAccount("acc-rec-1")
    })

    expect(toast.error).toHaveBeenCalled()
    expect(analyticsTrackerMock.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.anything(),
    )
  })

  it("sets deleteDialogAccount on handleDeleteAccount", async () => {
    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: [],
        externalCheckInAccounts: [],
        accountInfoById: { "acc-rec-1": sampleAccount },
      }),
    )

    await act(async () => {
      await result.current.handleDeleteAccount("acc-rec-1")
    })

    expect(result.current.deleteDialogAccount).toEqual(sampleAccount)
  })

  it("skips bulk opening failed manual sign-ins when list is empty", async () => {
    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: [],
        externalCheckInAccounts: [],
        accountInfoById: {},
      }),
    )

    await act(async () => {
      await result.current.handleOpenFailedManualSignIns(
        {} as MouseEvent<HTMLButtonElement>,
      )
    })

    expect(toast.error).toHaveBeenCalled()
    expect(analyticsTrackerMock.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Skipped,
      expect.anything(),
    )
  })

  it("bulk opens failed manual sign-ins successfully", async () => {
    vi.mocked(openCheckInPages).mockResolvedValueOnce({
      openedCount: 2,
      failedCount: 0,
    })

    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: ["acc-1", "acc-2"],
        externalCheckInAccounts: [],
        accountInfoById: {},
      }),
    )

    await act(async () => {
      await result.current.handleOpenFailedManualSignIns(
        {} as MouseEvent<HTMLButtonElement>,
      )
    })

    expect(openCheckInPages).toHaveBeenCalled()
    expect(toast.success).toHaveBeenCalled()
    expect(analyticsTrackerMock.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Success,
      expect.anything(),
    )
  })

  it("handles partial failure when bulk opening failed manual sign-ins", async () => {
    vi.mocked(openCheckInPages).mockResolvedValueOnce({
      openedCount: 1,
      failedCount: 1,
    })

    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: ["acc-1", "acc-2"],
        externalCheckInAccounts: [],
        accountInfoById: {},
      }),
    )

    await act(async () => {
      await result.current.handleOpenFailedManualSignIns(
        {} as MouseEvent<HTMLButtonElement>,
      )
    })

    expect(toast.error).toHaveBeenCalled()
    expect(analyticsTrackerMock.complete).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_RESULTS.Failure,
      expect.anything(),
    )
  })

  it("opens external check-ins and reports success toast", async () => {
    vi.mocked(openExternalCheckIns).mockResolvedValueOnce({
      openedAccountCount: 1,
      skipped: false,
      partialFailure: false,
      failed: false,
    } as unknown as Awaited<ReturnType<typeof openExternalCheckIns>>)

    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: [],
        externalCheckInAccounts: [sampleAccount],
        accountInfoById: {},
      }),
    )

    await act(async () => {
      await result.current.handleOpenExternalCheckIns(
        {} as MouseEvent<HTMLButtonElement>,
      )
    })

    expect(openExternalCheckIns).toHaveBeenCalledWith(
      [sampleAccount],
      expect.objectContaining({
        openAll: false,
        openInNewWindow: false,
      }),
    )
    expect(toast.success).toHaveBeenCalled()
  })

  it("opens single account external check-in", async () => {
    vi.mocked(openExternalCheckIns).mockResolvedValueOnce({
      openedAccountCount: 1,
      skipped: false,
      partialFailure: false,
      failed: false,
    } as unknown as Awaited<ReturnType<typeof openExternalCheckIns>>)

    const { result } = renderHook(() =>
      useAutoCheckinRecovery({
        resolveAutoCheckinAccount: resolveAutoCheckinAccountMock,
        loadStatus: loadStatusMock,
        failedManualAccountIds: [],
        externalCheckInAccounts: [],
        accountInfoById: { "acc-rec-1": sampleAccount },
      }),
    )

    await act(async () => {
      await result.current.handleOpenAccountExternalCheckIn("acc-rec-1")
    })

    expect(openExternalCheckIns).toHaveBeenCalledWith(
      [sampleAccount],
      expect.objectContaining({
        openAll: true,
      }),
    )
    expect(toast.success).toHaveBeenCalled()
  })
})
