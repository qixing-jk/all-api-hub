import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { PRODUCT_ANALYTICS_STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  normalizeState,
  PRODUCT_ANALYTICS_DEFAULT_ENABLED,
  productAnalyticsPreferences,
} from "~/services/productAnalytics/preferences"

describe("productAnalyticsPreferences", () => {
  const storage = new Storage({ area: "local" })

  beforeEach(async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-12T00:00:00.000Z"))
    await storage.remove(
      PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_PREFERENCES,
    )
  })

  afterEach(async () => {
    vi.useRealTimers()
    await storage.remove(
      PRODUCT_ANALYTICS_STORAGE_KEYS.PRODUCT_ANALYTICS_PREFERENCES,
    )
  })

  it("resolves analytics as enabled when no explicit preference exists", async () => {
    await expect(productAnalyticsPreferences.isEnabled()).resolves.toBe(
      PRODUCT_ANALYTICS_DEFAULT_ENABLED,
    )
  })

  it("persists explicit disabled preference durably", async () => {
    await expect(productAnalyticsPreferences.setEnabled(false)).resolves.toBe(
      true,
    )

    await expect(productAnalyticsPreferences.isEnabled()).resolves.toBe(false)
    await expect(productAnalyticsPreferences.getState()).resolves.toEqual(
      expect.objectContaining({
        enabled: false,
        updatedAt: Date.parse("2026-05-12T00:00:00.000Z"),
      }),
    )
  })

  it("generates anonymous id once and reuses it", async () => {
    const first = await productAnalyticsPreferences.getOrCreateAnonymousId()
    const second = await productAnalyticsPreferences.getOrCreateAnonymousId()

    expect(first).toMatch(/^analytics-/)
    expect(second).toBe(first)
  })

  it("returns an anonymous id only while analytics is enabled", async () => {
    await productAnalyticsPreferences.setEnabled(true)

    const anonymousId =
      await productAnalyticsPreferences.getAnonymousIdIfEnabled()

    expect(anonymousId).toMatch(/^analytics-/)
    await expect(productAnalyticsPreferences.getState()).resolves.toEqual(
      expect.objectContaining({
        anonymousId,
      }),
    )
  })

  it("does not create an anonymous id when analytics is disabled", async () => {
    await productAnalyticsPreferences.setEnabled(false)

    await expect(
      productAnalyticsPreferences.getAnonymousIdIfEnabled(),
    ).resolves.toBeNull()
    await expect(productAnalyticsPreferences.getState()).resolves.not.toEqual(
      expect.objectContaining({
        anonymousId: expect.any(String),
      }),
    )
  })

  it("keeps opt-out writes queued while running enabled anonymous-id work", async () => {
    await productAnalyticsPreferences.setEnabled(true)
    let disableCompleted = false
    let disablePromise: Promise<boolean> | null = null

    const result = await productAnalyticsPreferences.withAnonymousIdIfEnabled(
      async (anonymousId) => {
        disablePromise = productAnalyticsPreferences
          .setEnabled(false)
          .then((success) => {
            disableCompleted = true
            return success
          })
        await Promise.resolve()

        expect(anonymousId).toMatch(/^analytics-/)
        expect(disableCompleted).toBe(false)

        return "captured"
      },
    )

    expect(result).toBe("captured")
    await expect(disablePromise).resolves.toBe(true)
    expect(disableCompleted).toBe(true)
    await expect(productAnalyticsPreferences.isEnabled()).resolves.toBe(false)
  })

  it("generates a single anonymous id for concurrent creation requests", async () => {
    const [first, second] = await Promise.all([
      productAnalyticsPreferences.getOrCreateAnonymousId(),
      productAnalyticsPreferences.getOrCreateAnonymousId(),
    ])

    expect(first).toMatch(/^analytics-/)
    expect(second).toBe(first)

    await expect(productAnalyticsPreferences.getState()).resolves.toEqual(
      expect.objectContaining({
        anonymousId: first,
      }),
    )
    await expect(
      productAnalyticsPreferences.getOrCreateAnonymousId(),
    ).resolves.toBe(first)
  })

  it("persists site ecosystem snapshot timestamp", async () => {
    await expect(
      productAnalyticsPreferences.setLastSiteEcosystemSnapshotAt(12345),
    ).resolves.toBe(true)

    await expect(productAnalyticsPreferences.getState()).resolves.toEqual(
      expect.objectContaining({
        lastSiteEcosystemSnapshotAt: 12345,
      }),
    )
  })

  it("normalizes persisted anonymous id whitespace", () => {
    expect(normalizeState({ anonymousId: "  analytics-existing  " })).toEqual({
      anonymousId: "analytics-existing",
    })
  })
})
