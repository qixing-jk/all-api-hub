// Install shared mocks before loading scheduler dependencies.
import "~~/tests/services/autoCheckin/schedulerTestHarness"

import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  mapRunSummaryToProductAnalyticsResult,
  notifyScheduledRunResult,
  notifyUiRunCompleted,
} from "~/services/checkin/autoCheckin/execution/runPresentation"
import { PRODUCT_ANALYTICS_RESULTS } from "~/services/productAnalytics/contracts"
import { AUTO_CHECKIN_RUN_TYPE } from "~/types/autoCheckin"
import {
  mockedBrowserApi,
  mockedNotifyTaskResult,
} from "~~/tests/services/autoCheckin/schedulerTestHarness"

describe("execution/runPresentation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })
  it("sends already-checked results as a distinct notification count", async () => {
    await notifyScheduledRunResult({
      successCount: 2,
      alreadyCheckedCount: 1,
      failedCount: 1,
      uncertainCount: 1,
      skippedCount: 0,
      total: 4,
    })

    expect(mockedNotifyTaskResult).toHaveBeenCalledWith({
      task: "autoCheckin",
      status: "partial_success",
      counts: {
        total: 4,
        success: 1,
        alreadyChecked: 1,
        failed: 1,
        uncertain: 1,
        skipped: 0,
      },
    })
  })

  it("maps no-op run summaries to skipped analytics results", () => {
    expect(
      mapRunSummaryToProductAnalyticsResult({
        executed: 0,
        failedCount: 0,
        skippedCount: 0,
      }),
    ).toBe(PRODUCT_ANALYTICS_RESULTS.Skipped)
    expect(
      mapRunSummaryToProductAnalyticsResult({
        executed: 0,
        failedCount: 1,
        skippedCount: 0,
      }),
    ).toBe(PRODUCT_ANALYTICS_RESULTS.Failure)
    expect(
      mapRunSummaryToProductAnalyticsResult({
        executed: 1,
        failedCount: 0,
        skippedCount: 0,
      }),
    ).toBe(PRODUCT_ANALYTICS_RESULTS.Success)
  })

  it("keeps run-completed notifications best-effort for missing receivers and other errors", async () => {
    mockedBrowserApi.sendRuntimeMessage.mockRejectedValueOnce(
      new Error("receiver unavailable"),
    )
    mockedBrowserApi.isMessageReceiverUnavailableError.mockReturnValueOnce(true)

    await expect(
      notifyUiRunCompleted({
        runKind: AUTO_CHECKIN_RUN_TYPE.MANUAL,
        updatedAccountIds: ["a"],
        summary: {
          totalEligible: 1,
          executed: 1,
          successCount: 1,
          failedCount: 0,
          skippedCount: 0,
          needsRetry: false,
        },
      }),
    ).resolves.toBeUndefined()

    mockedBrowserApi.sendRuntimeMessage.mockRejectedValueOnce(
      new Error("unexpected failure"),
    )
    mockedBrowserApi.isMessageReceiverUnavailableError.mockReturnValueOnce(
      false,
    )

    await expect(
      notifyUiRunCompleted({
        runKind: AUTO_CHECKIN_RUN_TYPE.DAILY,
        updatedAccountIds: [],
      }),
    ).resolves.toBeUndefined()

    expect(mockedBrowserApi.sendRuntimeMessage).toHaveBeenCalledTimes(2)
  })
})
