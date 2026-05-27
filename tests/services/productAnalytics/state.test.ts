import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { PRODUCT_ANALYTICS_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  normalizeProductAnalyticsState,
  normalizeShieldBypassSummaryState,
  productAnalyticsState,
} from "~/services/productAnalytics/state"

describe("productAnalyticsState", () => {
  const storage = new Storage({ area: "local" })

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-12T00:00:00.000Z"))
    await storage.remove(
      PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_PREFERENCES,
    )
    await storage.remove(PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_STATE)
  })

  afterEach(async () => {
    vi.useRealTimers()
    await storage.remove(
      PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_PREFERENCES,
    )
    await storage.remove(PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_STATE)
  })

  it("persists site ecosystem snapshot timestamp only in analytics state storage", async () => {
    await storage.set(
      PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_PREFERENCES,
      {
        enabled: false,
        anonymousId: "analytics-existing",
      },
    )

    await expect(
      productAnalyticsState.setLastSiteEcosystemSnapshotAt(12345),
    ).resolves.toBe(true)

    await expect(productAnalyticsState.getState()).resolves.toEqual(
      expect.objectContaining({
        lastSiteEcosystemSnapshotAt: 12345,
      }),
    )
    await expect(
      storage.get(PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_STATE),
    ).resolves.toEqual(
      expect.objectContaining({
        lastSiteEcosystemSnapshotAt: 12345,
        updatedAt: Date.parse("2026-05-12T00:00:00.000Z"),
      }),
    )
    await expect(
      storage.get(PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_PREFERENCES),
    ).resolves.toEqual({
      enabled: false,
      anonymousId: "analytics-existing",
    })
  })

  it("persists settings snapshot timestamp in analytics local state", async () => {
    await expect(
      productAnalyticsState.setLastSettingsSnapshotAt(67890),
    ).resolves.toBe(true)

    await expect(productAnalyticsState.getState()).resolves.toEqual(
      expect.objectContaining({
        lastSettingsSnapshotAt: 67890,
      }),
    )
  })

  it("rejects invalid settings snapshot timestamps", async () => {
    await expect(
      productAnalyticsState.setLastSettingsSnapshotAt(Number.NaN),
    ).resolves.toBe(false)

    await expect(productAnalyticsState.getState()).resolves.not.toEqual(
      expect.objectContaining({
        lastSettingsSnapshotAt: expect.any(Number),
      }),
    )
  })

  it("increments shield bypass summary counts for the current UTC day", async () => {
    await productAnalyticsState.incrementShieldBypassSummary({
      promptShownCount: 2,
      tempWindowFetchSuccessCount: 1,
    })
    await productAnalyticsState.incrementShieldBypassSummary({
      promptShownCount: 1,
      tempWindowFetchFailureCount: 1,
    })

    await expect(productAnalyticsState.getState()).resolves.toEqual(
      expect.objectContaining({
        shieldBypassSummary: expect.objectContaining({
          day: "2026-05-12",
          promptShownCount: 3,
          tempWindowFetchSuccessCount: 1,
          tempWindowFetchFailureCount: 1,
        }),
      }),
    )
  })

  it("rolls shield bypass summary counts to a new UTC day", async () => {
    await productAnalyticsState.replaceShieldBypassSummaryState({
      day: "2026-05-11",
      promptShownCount: 9,
    })

    await productAnalyticsState.incrementShieldBypassSummary({
      settingsVisitedCount: 1,
    })

    await expect(productAnalyticsState.getState()).resolves.toEqual(
      expect.objectContaining({
        shieldBypassSummary: {
          day: "2026-05-12",
          settingsVisitedCount: 1,
        },
      }),
    )
  })

  it("normalizes persisted analytics state timestamps", () => {
    expect(
      normalizeProductAnalyticsState({
        lastSettingsSnapshotAt: 67890,
        lastSiteEcosystemSnapshotAt: Number.NaN,
      }),
    ).toEqual({
      lastSettingsSnapshotAt: 67890,
    })
  })

  it("normalizes persisted shield bypass summary counts", () => {
    expect(
      normalizeShieldBypassSummaryState({
        day: "2026-05-12",
        promptShownCount: 2.8,
        promptDismissedCount: -1,
        settingsVisitedCount: Number.NaN,
        tempWindowFetchSuccessCount: 1,
      }),
    ).toEqual({
      day: "2026-05-12",
      promptShownCount: 2,
      tempWindowFetchSuccessCount: 1,
    })
  })
})
