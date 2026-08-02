import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { PRODUCT_ANALYTICS_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  normalizeProductAnalyticsState,
  normalizeShieldBypassSummaryState,
  normalizeSponsorRecommendationsSummaryState,
  productAnalyticsState,
} from "~/services/productAnalytics/state"

describe("productAnalyticsState", () => {
  const storage = new Storage({ area: "local" })
  const analyticsStorage = (
    productAnalyticsState as unknown as { storage: Storage }
  ).storage

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

  it("atomically merges bounded protection-bypass decision dimensions", async () => {
    await Promise.all([
      productAnalyticsState.incrementShieldBypassSummary({
        featureCounts: { checkin: 1 },
        invocationKindCounts: { automatic: 1 },
        automaticTriggerCounts: { scheduled: 1 },
        operationCounts: { native_page_action: 1 },
        decisionCounts: { denied: 1 },
        denialReasonCounts: { automatic_disabled: 1 },
      }),
      productAnalyticsState.incrementShieldBypassSummary({
        featureCounts: { checkin: 1 },
        invocationKindCounts: { user_command: 1 },
        operationCounts: { native_page_action: 1 },
        decisionCounts: { allowed: 1 },
        adapterCounts: { tab: 1 },
      }),
    ])

    await expect(
      productAnalyticsState.getShieldBypassSummaryState(),
    ).resolves.toEqual(
      expect.objectContaining({
        featureCounts: { checkin: 2 },
        invocationKindCounts: { automatic: 1, user_command: 1 },
        automaticTriggerCounts: { scheduled: 1 },
        operationCounts: { native_page_action: 2 },
        decisionCounts: { allowed: 1, denied: 1 },
        denialReasonCounts: { automatic_disabled: 1 },
        adapterCounts: { tab: 1 },
      }),
    )
  })

  it("atomically merges bounded protection-bypass focus dimensions", async () => {
    const focusIncrement = {
      adapterCounts: { auto: 1 },
      focusStartCounts: { unfocused: 1 },
      focusEndCounts: { focused: 1 },
      focusTransitionCounts: { foregrounded: 1 },
      focusBackgroundStartAdapterCounts: { composite: 1 },
      focusForegroundActivationAdapterCounts: { composite: 1 },
      focusUnknownAdapterCounts: { tab: 1 },
    } as const

    await Promise.all([
      productAnalyticsState.incrementShieldBypassSummary(focusIncrement),
      productAnalyticsState.incrementShieldBypassSummary(focusIncrement),
    ])

    await expect(
      productAnalyticsState.getShieldBypassSummaryState(),
    ).resolves.toEqual(
      expect.objectContaining({
        adapterCounts: { auto: 2 },
        focusStartCounts: { unfocused: 2 },
        focusEndCounts: { focused: 2 },
        focusTransitionCounts: { foregrounded: 2 },
        focusBackgroundStartAdapterCounts: { composite: 2 },
        focusForegroundActivationAdapterCounts: { composite: 2 },
        focusUnknownAdapterCounts: { tab: 2 },
      }),
    )
  })

  it("rolls shield bypass summary counts to a new UTC day", async () => {
    await productAnalyticsState.replaceShieldBypassSummaryState({
      day: "2026-05-11",
      promptShownCount: 9,
      featureCounts: { key_management: 9 },
      decisionCounts: { allowed: 9 },
      focusStartCounts: { focused: 9 },
      focusEndCounts: { focused: 9 },
      focusTransitionCounts: { remained_focused: 9 },
      focusBackgroundStartAdapterCounts: { window: 9 },
      focusForegroundActivationAdapterCounts: { window: 9 },
      focusUnknownAdapterCounts: { window: 9 },
    })

    await productAnalyticsState.incrementShieldBypassSummary({
      settingsVisitedCount: 1,
      featureCounts: { checkin: 1 },
      decisionCounts: { denied: 1 },
      focusStartCounts: { unfocused: 1 },
      focusEndCounts: { focused: 1 },
      focusTransitionCounts: { foregrounded: 1 },
      focusBackgroundStartAdapterCounts: { composite: 1 },
      focusForegroundActivationAdapterCounts: { composite: 1 },
      focusUnknownAdapterCounts: { tab: 1 },
    })

    const summary = await productAnalyticsState.getShieldBypassSummaryState()

    expect(summary).toEqual(
      expect.objectContaining({
        day: "2026-05-12",
        settingsVisitedCount: 1,
        featureCounts: { checkin: 1 },
        decisionCounts: { denied: 1 },
        focusStartCounts: { unfocused: 1 },
        focusEndCounts: { focused: 1 },
        focusTransitionCounts: { foregrounded: 1 },
        focusBackgroundStartAdapterCounts: { composite: 1 },
        focusForegroundActivationAdapterCounts: { composite: 1 },
        focusUnknownAdapterCounts: { tab: 1 },
      }),
    )
  })

  it("increments sponsor recommendations summary counts for the current UTC day", async () => {
    await productAnalyticsState.incrementSponsorRecommendationsSummary({
      impressionCount: 1,
      itemTotal: 2,
      supportedItemTotal: 1,
      unsupportedItemTotal: 1,
      addAccountSurfaceCount: 1,
    })
    await productAnalyticsState.incrementSponsorRecommendationsSummary({
      impressionCount: 1,
      itemTotal: 1,
      supportedItemTotal: 1,
      newcomerSurfaceCount: 1,
    })

    await expect(productAnalyticsState.getState()).resolves.toEqual(
      expect.objectContaining({
        sponsorRecommendationsSummary: {
          day: "2026-05-12",
          impressionCount: 2,
          itemTotal: 3,
          supportedItemTotal: 2,
          unsupportedItemTotal: 1,
          addAccountSurfaceCount: 1,
          newcomerSurfaceCount: 1,
        },
      }),
    )
  })

  it("rolls sponsor recommendations summary counts to a new UTC day", async () => {
    await productAnalyticsState.replaceSponsorRecommendationsSummaryState({
      day: "2026-05-11",
      impressionCount: 9,
      itemTotal: 18,
    })

    await productAnalyticsState.incrementSponsorRecommendationsSummary({
      impressionCount: 1,
      itemTotal: 2,
    })

    await expect(productAnalyticsState.getState()).resolves.toEqual(
      expect.objectContaining({
        sponsorRecommendationsSummary: {
          day: "2026-05-12",
          impressionCount: 1,
          itemTotal: 2,
        },
      }),
    )
  })

  it("reports sponsor recommendations summary replacement write failures", async () => {
    const storageSetSpy = vi
      .spyOn(analyticsStorage, "set")
      .mockRejectedValueOnce(new Error("write failed"))

    await expect(
      productAnalyticsState.replaceSponsorRecommendationsSummaryState({
        day: "2026-05-12",
        impressionCount: 1,
      }),
    ).resolves.toBe(false)

    await expect(
      storage.get(PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_STATE),
    ).resolves.toBeUndefined()

    storageSetSpy.mockRestore()
  })

  it("reports sponsor recommendations summary increment write failures", async () => {
    const storageSetSpy = vi
      .spyOn(analyticsStorage, "set")
      .mockRejectedValueOnce(new Error("write failed"))

    await expect(
      productAnalyticsState.incrementSponsorRecommendationsSummary({
        impressionCount: 1,
        itemTotal: 2,
      }),
    ).resolves.toBe(false)

    await expect(
      storage.get(PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_STATE),
    ).resolves.toBeUndefined()

    storageSetSpy.mockRestore()
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

  it("normalizes old and hostile decision maps into enum-sized controlled buckets", () => {
    expect(
      normalizeShieldBypassSummaryState({
        day: "2026-05-12",
        promptShownCount: 2,
        featureCounts: {
          checkin: 2.8,
          unknown_feature: 4,
          another_unknown: 3,
          site_detection: 0,
          verification: -1,
        },
        invocationKindCounts: { automatic: 2, forged: 5 },
        automaticTriggerCounts: { scheduled: 1, mystery: 2 },
        operationCounts: { fetch: 3, secret_operation: 7 },
        decisionCounts: { allowed: 1, impossible: 9 },
        denialReasonCounts: { deprecated_reason: 2, backend_message: 5 },
        adapterCounts: { auto: 1, tab: 1, private_host: 6 },
        focusStartCounts: { focused: 1, hidden: 2 },
        focusEndCounts: { unknown: 3, visible: 4 },
        focusTransitionCounts: { mixed: 5, raw_sequence: 6 },
        focusBackgroundStartAdapterCounts: { window: 1, auto: 2 },
        focusForegroundActivationAdapterCounts: { composite: 3, auto: 4 },
        focusUnknownAdapterCounts: { tab: 5, auto: 6 },
      }),
    ).toEqual({
      day: "2026-05-12",
      promptShownCount: 2,
      featureCounts: { checkin: 2, other: 7 },
      invocationKindCounts: { automatic: 2, other: 5 },
      automaticTriggerCounts: { scheduled: 1, other: 2 },
      operationCounts: { fetch: 3, other: 7 },
      decisionCounts: { allowed: 1, other: 9 },
      denialReasonCounts: { other: 7 },
      adapterCounts: { auto: 1, tab: 1, other: 6 },
      focusStartCounts: { focused: 1 },
      focusEndCounts: { unknown: 3 },
      focusTransitionCounts: { mixed: 5 },
      focusBackgroundStartAdapterCounts: { window: 1, other: 2 },
      focusForegroundActivationAdapterCounts: { composite: 3, other: 4 },
      focusUnknownAdapterCounts: { tab: 5, other: 6 },
    })
  })

  it("normalizes persisted sponsor recommendations summary counts", () => {
    expect(
      normalizeSponsorRecommendationsSummaryState({
        day: "2026-05-12",
        impressionCount: 2.8,
        itemTotal: 4,
        supportedItemTotal: -1,
        unsupportedItemTotal: Number.NaN,
        addAccountSurfaceCount: 1,
      }),
    ).toEqual({
      day: "2026-05-12",
      impressionCount: 2,
      itemTotal: 4,
      addAccountSurfaceCount: 1,
    })
  })
})
