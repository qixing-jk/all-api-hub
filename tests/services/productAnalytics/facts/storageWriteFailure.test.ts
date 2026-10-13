import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  PRODUCT_ANALYTICS_EVENTS,
  PRODUCT_ANALYTICS_STORAGE_AREAS,
  PRODUCT_ANALYTICS_STORAGE_FAILURE_STAGES,
  PRODUCT_ANALYTICS_STORAGE_OPERATIONS,
} from "~/services/productAnalytics/contracts"

const { trackProductAnalyticsEventMock } = vi.hoisted(() => ({
  trackProductAnalyticsEventMock: vi.fn(async () => true),
}))

vi.mock(
  "~/services/productAnalytics/runtime/dispatch",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("~/services/productAnalytics/runtime/dispatch")
    >()),
    trackProductAnalyticsEvent: trackProductAnalyticsEventMock,
  }),
)

describe("storage write failure analytics", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-11T00:00:00.000Z"))
    // The cooldown state is module-level; reset it for isolation.
    vi.resetModules()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("reports a storage write failure with a normalized low-cardinality payload", async () => {
    const { trackStorageWriteFailure: track } = await import(
      "~/services/productAnalytics/facts/storageWriteFailure"
    )

    const dispatched = track({
      storageArea: PRODUCT_ANALYTICS_STORAGE_AREAS.Local,
      operation: PRODUCT_ANALYTICS_STORAGE_OPERATIONS.AutoCheckinStatus,
      failureStage: PRODUCT_ANALYTICS_STORAGE_FAILURE_STAGES.Write,
      error: new DOMException("quota", "QuotaExceededError"),
    })

    expect(dispatched).toBe(true)
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed,
      {
        storage_area: "local",
        storage_operation: "auto_checkin_status",
        storage_failure_stage: "write",
        error_name: "QuotaExceededError",
      },
    )
  })

  it("falls back to a fixed error name for non-Error failures", async () => {
    const { trackStorageWriteFailure: track } = await import(
      "~/services/productAnalytics/facts/storageWriteFailure"
    )

    track({
      storageArea: PRODUCT_ANALYTICS_STORAGE_AREAS.Local,
      operation: PRODUCT_ANALYTICS_STORAGE_OPERATIONS.ProductAnalyticsState,
      failureStage: PRODUCT_ANALYTICS_STORAGE_FAILURE_STAGES.Apply,
      error: "boom",
    })

    expect(trackProductAnalyticsEventMock).toHaveBeenCalledWith(
      PRODUCT_ANALYTICS_EVENTS.StorageWriteFailed,
      expect.objectContaining({
        storage_operation: "product_analytics_state",
        storage_failure_stage: "apply",
        error_name: "unknown",
      }),
    )
  })

  it("throttles repeated failures of the same operation and stage", async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-10-11T00:00:00.000Z"))
    vi.resetModules()
    const { trackStorageWriteFailure: track } = await import(
      "~/services/productAnalytics/facts/storageWriteFailure"
    )

    const params = {
      storageArea: PRODUCT_ANALYTICS_STORAGE_AREAS.Local,
      operation: PRODUCT_ANALYTICS_STORAGE_OPERATIONS.AutoCheckinStatus,
      failureStage: PRODUCT_ANALYTICS_STORAGE_FAILURE_STAGES.Write,
    }

    expect(track(params)).toBe(true)
    expect(track(params)).toBe(false)
    expect(track(params)).toBe(false)
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledTimes(1)

    // A different operation is still reported on its own schedule.
    expect(
      track({
        ...params,
        operation: PRODUCT_ANALYTICS_STORAGE_OPERATIONS.ProductAnalyticsState,
      }),
    ).toBe(true)
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledTimes(2)

    // The cooldown window elapses and the next failure reports again.
    vi.setSystemTime(new Date("2026-10-11T00:11:00.000Z"))
    expect(track(params)).toBe(true)
    expect(trackProductAnalyticsEventMock).toHaveBeenCalledTimes(3)
  })
})
