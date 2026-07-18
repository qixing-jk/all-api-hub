import { act, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { useRepairMissingKeysJob } from "~/features/KeyManagement/components/RepairMissingKeysDialog/useRepairMissingKeysJob"
import {
  AccountKeyRepairMessageTypes,
  sendAccountKeyRepairMessage,
} from "~/services/accounts/accountKeyAutoProvisioning/messaging"
import {
  trackProductAnalyticsActionCompleted,
  trackProductAnalyticsActionStarted,
} from "~/services/productAnalytics/actions"
import {
  PRODUCT_ANALYTICS_RESULTS,
  PRODUCT_ANALYTICS_STATUS_KINDS,
} from "~/services/productAnalytics/contracts"
import type { DisplaySiteData } from "~/types"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"
import type { AccountKeyRepairProgress } from "~/types/accountKeyAutoProvisioning"
import { ACCOUNT_KEY_REPAIR_JOB_STATES } from "~/types/accountKeyAutoProvisioning"
import { buildCompleteTodayStatsAvailability } from "~~/tests/test-utils/accountTodayStats"
import { testI18n } from "~~/tests/test-utils/i18n"
import { renderHook } from "~~/tests/test-utils/render"

vi.mock("~/services/accounts/accountKeyAutoProvisioning/messaging", () => ({
  AccountKeyRepairMessageTypes: {
    Start: "accountKeyRepair:start",
    Cancel: "accountKeyRepair:cancel",
    GetProgress: "accountKeyRepair:getProgress",
    DeleteInvalidTokens: "accountKeyRepair:deleteInvalidTokens",
  },
  sendAccountKeyRepairMessage: vi.fn(),
}))

vi.mock("~/services/productAnalytics/actions", () => ({
  trackProductAnalyticsActionCompleted: vi.fn(),
  trackProductAnalyticsActionStarted: vi.fn(),
}))

vi.mock("~/utils/browser/browserApi", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/browserApi")>()),
  onRuntimeMessage: vi.fn(() => vi.fn()),
}))

const sendAccountKeyRepairMessageMock = vi.mocked(sendAccountKeyRepairMessage)
const trackProductAnalyticsActionCompletedMock = vi.mocked(
  trackProductAnalyticsActionCompleted,
)
const trackProductAnalyticsActionStartedMock = vi.mocked(
  trackProductAnalyticsActionStarted,
)

function buildAccount(
  overrides: Partial<DisplaySiteData> = {},
): DisplaySiteData {
  return {
    id: "account-1",
    name: "Account 1",
    username: "user@example.invalid",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    todayStatsAvailability: buildCompleteTodayStatsAvailability(),
    health: { status: SiteHealthStatus.Healthy },
    siteType: SITE_TYPES.NEW_API,
    baseUrl: "https://one.example.invalid",
    token: "token",
    userId: "user-1",
    authType: AuthTypeEnum.AccessToken,
    disabled: false,
    checkIn: { enableDetection: false },
    ...overrides,
  }
}

function buildProgress(
  overrides: Partial<AccountKeyRepairProgress> = {},
): AccountKeyRepairProgress {
  return {
    jobId: "job-1",
    state: ACCOUNT_KEY_REPAIR_JOB_STATES.Running,
    totals: {
      enabledAccounts: 2,
      eligibleAccounts: 2,
      processedAccounts: 1,
      processedEligibleAccounts: 1,
    },
    summary: {
      created: 1,
      alreadyHad: 0,
      skipped: 0,
      failed: 0,
    },
    results: [],
    ...overrides,
  }
}

describe("useRepairMissingKeysJob", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("shows the load failure message when progress loading returns an unsuccessful response", async () => {
    sendAccountKeyRepairMessageMock.mockResolvedValue({
      success: false,
      error: "load failed",
    })

    const { result } = renderHook(() =>
      useRepairMissingKeysJob({
        accounts: [buildAccount()],
        isOpen: true,
        startOnOpen: false,
        t: testI18n.t,
      }),
    )

    await waitFor(() => {
      expect(result.current.error).toBe(
        "keyManagement:repairMissingKeys.messages.loadFailed",
      )
    })
    expect(sendAccountKeyRepairMessageMock).toHaveBeenCalledWith(
      AccountKeyRepairMessageTypes.GetProgress,
    )
  })

  it("loads existing progress successfully when opened", async () => {
    const progress = buildProgress({
      jobId: "existing-job",
      totals: {
        enabledAccounts: 3,
        eligibleAccounts: 2,
        processedAccounts: 2,
      },
    })
    sendAccountKeyRepairMessageMock.mockResolvedValue({
      success: true,
      data: progress,
    })

    const { result } = renderHook(() =>
      useRepairMissingKeysJob({
        accounts: [buildAccount()],
        isOpen: true,
        startOnOpen: false,
        t: testI18n.t,
      }),
    )

    await waitFor(() => {
      expect(result.current.progress).toEqual(progress)
    })
    expect(result.current.error).toBe("")
    expect(sendAccountKeyRepairMessageMock).toHaveBeenCalledWith(
      AccountKeyRepairMessageTypes.GetProgress,
    )
  })

  it("shows the load failure message when progress loading rejects", async () => {
    sendAccountKeyRepairMessageMock.mockRejectedValue(new Error("network down"))

    const { result } = renderHook(() =>
      useRepairMissingKeysJob({
        accounts: [buildAccount()],
        isOpen: true,
        startOnOpen: false,
        t: testI18n.t,
      }),
    )

    await waitFor(() => {
      expect(result.current.error).toBe(
        "keyManagement:repairMissingKeys.messages.loadFailed",
      )
    })
  })

  it("auto-starts on open and tracks failed terminal progress with warning status", async () => {
    sendAccountKeyRepairMessageMock.mockImplementation(async (type) => {
      if (type === AccountKeyRepairMessageTypes.Start) {
        return {
          success: true,
          data: buildProgress({ jobId: "started-job" }),
        }
      }

      return {
        success: true,
        data: buildProgress({ jobId: "existing-job" }),
      }
    })

    const { result } = renderHook(() =>
      useRepairMissingKeysJob({
        accounts: [buildAccount()],
        isOpen: true,
        startOnOpen: true,
        t: testI18n.t,
      }),
    )

    await waitFor(() => {
      expect(trackProductAnalyticsActionStartedMock).toHaveBeenCalledTimes(1)
    })
    await waitFor(() => {
      expect(result.current.progress?.jobId).toBe("started-job")
    })

    act(() => {
      result.current.setProgress(
        buildProgress({
          jobId: "started-job",
          state: ACCOUNT_KEY_REPAIR_JOB_STATES.Completed,
          totals: {
            enabledAccounts: 3,
            eligibleAccounts: 3,
            processedAccounts: 3,
            processedEligibleAccounts: 3,
          },
          summary: {
            created: 2,
            alreadyHad: 0,
            skipped: 0,
            failed: 1,
          },
        }),
      )
    })

    await waitFor(() => {
      expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith(
        expect.objectContaining({
          result: PRODUCT_ANALYTICS_RESULTS.Failure,
          insights: expect.objectContaining({
            itemCount: 3,
            selectedCount: 3,
            successCount: 2,
            failureCount: 1,
            statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Warning,
          }),
        }),
      )
    })
  })

  it("does not auto-start again when start options change while the dialog stays open", async () => {
    sendAccountKeyRepairMessageMock.mockImplementation((type) => {
      if (type === AccountKeyRepairMessageTypes.Start) {
        return Promise.resolve({
          success: true,
          data: buildProgress({ jobId: "started-job" }),
        })
      }

      return Promise.resolve({
        success: true,
        data: buildProgress({ jobId: "existing-job" }),
      })
    })

    const { rerender } = renderHook(
      ({ renameAutoTemplateTokens }) =>
        useRepairMissingKeysJob({
          accounts: [buildAccount()],
          isOpen: true,
          startOnOpen: true,
          renameAutoTemplateTokens,
          t: testI18n.t,
        }),
      {
        initialProps: {
          renameAutoTemplateTokens: true,
        },
      },
    )

    await waitFor(() => {
      expect(sendAccountKeyRepairMessageMock).toHaveBeenCalledWith(
        AccountKeyRepairMessageTypes.Start,
        {
          renameAutoTemplateTokens: true,
        },
      )
    })

    rerender({ renameAutoTemplateTokens: false })

    await waitFor(() => {
      expect(
        sendAccountKeyRepairMessageMock.mock.calls.filter(
          ([type]) => type === AccountKeyRepairMessageTypes.Start,
        ),
      ).toHaveLength(1)
    })
  })

  it("ignores duplicate start requests while a start is already in flight", async () => {
    let resolveStart:
      | ((value: { success: true; data: AccountKeyRepairProgress }) => void)
      | undefined

    sendAccountKeyRepairMessageMock.mockImplementation((type) => {
      if (type === AccountKeyRepairMessageTypes.Start) {
        return new Promise((resolve) => {
          resolveStart = resolve
        })
      }

      return Promise.resolve({
        success: true,
        data: buildProgress(),
      })
    })

    const { result } = renderHook(() =>
      useRepairMissingKeysJob({
        accounts: [buildAccount()],
        isOpen: false,
        startOnOpen: false,
        t: testI18n.t,
      }),
    )

    await waitFor(() => {
      expect(result.current?.handleStartAudit).toBeTypeOf("function")
    })

    await act(async () => {
      const firstStart = result.current.handleStartAudit()
      const secondStart = result.current.handleStartAudit()

      resolveStart?.({
        success: true,
        data: buildProgress({ jobId: "started-once" }),
      })

      await Promise.all([firstStart, secondStart])
    })

    expect(sendAccountKeyRepairMessageMock).toHaveBeenCalledTimes(1)
    expect(sendAccountKeyRepairMessageMock.mock.calls[0]?.[0]).toBe(
      AccountKeyRepairMessageTypes.Start,
    )
  })

  it("sends the auto-template rename preference when starting repair", async () => {
    sendAccountKeyRepairMessageMock.mockImplementation((type) => {
      if (type === AccountKeyRepairMessageTypes.Start) {
        return Promise.resolve({
          success: true,
          data: buildProgress({ jobId: "started-with-options" }),
        })
      }

      return Promise.resolve({
        success: true,
        data: buildProgress(),
      })
    })

    const { result } = renderHook(() =>
      useRepairMissingKeysJob({
        accounts: [buildAccount()],
        isOpen: false,
        startOnOpen: false,
        renameAutoTemplateTokens: false,
        t: testI18n.t,
      }),
    )

    await waitFor(() => {
      expect(result.current?.handleStartAudit).toBeTypeOf("function")
    })

    await act(async () => {
      await result.current.handleStartAudit()
    })

    expect(sendAccountKeyRepairMessageMock).toHaveBeenCalledWith(
      AccountKeyRepairMessageTypes.Start,
      {
        renameAutoTemplateTokens: false,
      },
    )
  })

  it("sends a cancel request and stores the cancelled progress", async () => {
    const runningProgress = buildProgress({ jobId: "running-job" })
    const cancelledProgress = buildProgress({
      jobId: "running-job",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
      finishedAt: 123,
    })
    sendAccountKeyRepairMessageMock.mockImplementation(async (type) => {
      if (type === AccountKeyRepairMessageTypes.Cancel) {
        return {
          success: true,
          data: cancelledProgress,
        }
      }

      return {
        success: true,
        data: runningProgress,
      }
    })

    const { result } = renderHook(() =>
      useRepairMissingKeysJob({
        accounts: [buildAccount()],
        isOpen: true,
        startOnOpen: false,
        t: testI18n.t,
      }),
    )

    await waitFor(() => {
      expect(result.current.progress).toEqual(runningProgress)
    })

    await act(async () => {
      await result.current.handleCancelAudit()
    })

    expect(sendAccountKeyRepairMessageMock).toHaveBeenCalledWith(
      AccountKeyRepairMessageTypes.Cancel,
    )
    expect(result.current.progress).toEqual(cancelledProgress)
    expect(result.current.error).toBe("")
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        result: PRODUCT_ANALYTICS_RESULTS.Cancelled,
        insights: expect.objectContaining({
          itemCount: 2,
          selectedCount: 1,
          successCount: 1,
          failureCount: 0,
          statusKind: PRODUCT_ANALYTICS_STATUS_KINDS.Healthy,
        }),
      }),
    )
  })

  it("keeps cancelled progress when an older start response settles after cancel", async () => {
    let resolveStart:
      | ((value: { success: true; data: AccountKeyRepairProgress }) => void)
      | undefined
    const runningProgress = buildProgress({ jobId: "running-job" })
    const startedProgress = buildProgress({ jobId: "started-job" })
    const cancelledProgress = buildProgress({
      jobId: "running-job",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
      finishedAt: 123,
    })
    sendAccountKeyRepairMessageMock.mockImplementation((type) => {
      if (type === AccountKeyRepairMessageTypes.Start) {
        return new Promise((resolve) => {
          resolveStart = resolve
        })
      }

      if (type === AccountKeyRepairMessageTypes.Cancel) {
        return Promise.resolve({
          success: true,
          data: cancelledProgress,
        })
      }

      return Promise.resolve({
        success: true,
        data: runningProgress,
      })
    })

    const { result } = renderHook(() =>
      useRepairMissingKeysJob({
        accounts: [buildAccount()],
        isOpen: true,
        startOnOpen: false,
        t: testI18n.t,
      }),
    )

    await waitFor(() => {
      expect(result.current.progress).toEqual(runningProgress)
    })

    await act(async () => {
      const startPromise = result.current.handleStartAudit()
      await result.current.handleCancelAudit()

      resolveStart?.({
        success: true,
        data: startedProgress,
      })

      await startPromise
    })

    expect(result.current.progress).toEqual(cancelledProgress)
    expect(result.current.isStarting).toBe(false)
    expect(result.current.isCancelling).toBe(false)
  })

  it("shows the cancel failure message when cancelling returns an unsuccessful response", async () => {
    const runningProgress = buildProgress({ jobId: "running-job" })
    sendAccountKeyRepairMessageMock.mockImplementation((type) => {
      if (type === AccountKeyRepairMessageTypes.Cancel) {
        return Promise.resolve({
          success: false,
          error: "cancel failed",
        })
      }

      return Promise.resolve({
        success: true,
        data: runningProgress,
      })
    })

    const { result } = renderHook(() =>
      useRepairMissingKeysJob({
        accounts: [buildAccount()],
        isOpen: true,
        startOnOpen: false,
        t: testI18n.t,
      }),
    )

    await waitFor(() => {
      expect(result.current.progress).toEqual(runningProgress)
    })

    await act(async () => {
      await result.current.handleCancelAudit()
    })

    expect(result.current.error).toBe(
      "keyManagement:repairMissingKeys.messages.cancelFailed",
    )
    expect(result.current.isCancelling).toBe(false)
  })

  it("shows the cancel failure message when cancelling rejects", async () => {
    const runningProgress = buildProgress({ jobId: "running-job" })
    sendAccountKeyRepairMessageMock.mockImplementation((type) => {
      if (type === AccountKeyRepairMessageTypes.Cancel) {
        return Promise.reject(new Error("network down"))
      }

      return Promise.resolve({
        success: true,
        data: runningProgress,
      })
    })

    const { result } = renderHook(() =>
      useRepairMissingKeysJob({
        accounts: [buildAccount()],
        isOpen: true,
        startOnOpen: false,
        t: testI18n.t,
      }),
    )

    await waitFor(() => {
      expect(result.current.progress).toEqual(runningProgress)
    })

    await act(async () => {
      await result.current.handleCancelAudit()
    })

    expect(result.current.error).toBe(
      "keyManagement:repairMissingKeys.messages.cancelFailed",
    )
    expect(result.current.isCancelling).toBe(false)
  })

  it("deduplicates concurrent cancel requests", async () => {
    let resolveCancel:
      | ((value: { success: true; data: AccountKeyRepairProgress }) => void)
      | undefined
    const runningProgress = buildProgress({ jobId: "running-job" })
    const cancelledProgress = buildProgress({
      jobId: "running-job",
      state: ACCOUNT_KEY_REPAIR_JOB_STATES.Cancelled,
      finishedAt: 123,
    })
    sendAccountKeyRepairMessageMock.mockImplementation((type) => {
      if (type === AccountKeyRepairMessageTypes.Cancel) {
        return new Promise((resolve) => {
          resolveCancel = resolve
        })
      }

      return Promise.resolve({
        success: true,
        data: runningProgress,
      })
    })

    const { result } = renderHook(() =>
      useRepairMissingKeysJob({
        accounts: [buildAccount()],
        isOpen: true,
        startOnOpen: false,
        t: testI18n.t,
      }),
    )

    await waitFor(() => {
      expect(result.current.progress).toEqual(runningProgress)
    })

    await act(async () => {
      const firstCancel = result.current.handleCancelAudit()
      const secondCancel = result.current.handleCancelAudit()

      resolveCancel?.({
        success: true,
        data: cancelledProgress,
      })

      await Promise.all([firstCancel, secondCancel])
    })

    expect(sendAccountKeyRepairMessageMock).toHaveBeenCalledTimes(2)
    expect(sendAccountKeyRepairMessageMock).toHaveBeenCalledWith(
      AccountKeyRepairMessageTypes.GetProgress,
    )
    expect(sendAccountKeyRepairMessageMock).toHaveBeenCalledWith(
      AccountKeyRepairMessageTypes.Cancel,
    )
    expect(trackProductAnalyticsActionCompletedMock).toHaveBeenCalledTimes(1)
  })
})
