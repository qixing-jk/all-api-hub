import { beforeEach, describe, expect, it, vi } from "vitest"

import { Storage } from "@plasmohq/storage"

import { STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  createEmptyFeatureGuidanceState,
  FeatureGuidanceStateService,
  mergeFeatureGuidanceStates,
  PRODUCT_TOUR_OUTCOMES,
  PRODUCT_TOUR_VARIANTS,
} from "~/services/featureGuidance/featureGuidanceState"
import {
  DEFAULT_PREFERENCES,
  userPreferences,
} from "~/services/preferences/userPreferences"
import { setLoggingPreferences } from "~/utils/core/logger"

const storage = new Storage({ area: "local" })

describe("feature guidance state", () => {
  beforeEach(async () => {
    await Promise.all([
      storage.remove(STORAGE_KEYS.FEATURE_GUIDANCE_STATE),
      storage.remove(STORAGE_KEYS.USER_PREFERENCES),
    ])
  })

  it("tracks product-tour versions independently for expanded and compact layouts", async () => {
    const service = new FeatureGuidanceStateService()

    await service.markProductTourHandled(
      PRODUCT_TOUR_VARIANTS.Expanded,
      2,
      PRODUCT_TOUR_OUTCOMES.Completed,
      100,
    )
    await service.markProductTourHandled(
      PRODUCT_TOUR_VARIANTS.Compact,
      1,
      PRODUCT_TOUR_OUTCOMES.Dismissed,
      200,
    )

    await expect(service.getState()).resolves.toMatchObject({
      productTour: {
        expanded: {
          handledVersion: 2,
          outcome: PRODUCT_TOUR_OUTCOMES.Completed,
          handledAt: 100,
        },
        compact: {
          handledVersion: 1,
          outcome: PRODUCT_TOUR_OUTCOMES.Dismissed,
          handledAt: 200,
        },
      },
    })
  })

  it("merges synced history monotonically per tour layout", () => {
    const local = createEmptyFeatureGuidanceState()
    local.productTour.expanded = {
      handledVersion: 3,
      outcome: PRODUCT_TOUR_OUTCOMES.Dismissed,
      handledAt: 300,
    }
    local.gatewayGuidance.dismissedAtBySurface.account = 100

    const merged = mergeFeatureGuidanceStates(local, {
      schemaVersion: 1,
      productTour: {
        expanded: {
          handledVersion: 2,
          outcome: PRODUCT_TOUR_OUTCOMES.Completed,
          handledAt: 400,
        },
        compact: {
          handledVersion: 1,
          outcome: PRODUCT_TOUR_OUTCOMES.Completed,
          handledAt: 200,
        },
      },
      gatewayGuidance: {
        dismissedAtBySurface: {
          account: 50,
          apiCredentialProfiles: 250,
        },
      },
    })

    expect(merged.productTour).toEqual({
      expanded: {
        handledVersion: 3,
        outcome: PRODUCT_TOUR_OUTCOMES.Dismissed,
        handledAt: 300,
      },
      compact: {
        handledVersion: 1,
        outcome: PRODUCT_TOUR_OUTCOMES.Completed,
        handledAt: 200,
      },
    })
    expect(merged.gatewayGuidance.dismissedAtBySurface).toEqual({
      account: 100,
      apiCredentialProfiles: 250,
    })
  })

  it("prefers completion and the newest timestamp for the same tour version", () => {
    const local = createEmptyFeatureGuidanceState()
    local.productTour.expanded = {
      handledVersion: 2,
      outcome: PRODUCT_TOUR_OUTCOMES.Dismissed,
      handledAt: 300,
    }

    const merged = mergeFeatureGuidanceStates(local, {
      productTour: {
        expanded: {
          handledVersion: 2,
          outcome: PRODUCT_TOUR_OUTCOMES.Completed,
          handledAt: 200,
        },
      },
    })

    expect(merged.productTour.expanded).toEqual({
      handledVersion: 2,
      outcome: PRODUCT_TOUR_OUTCOMES.Completed,
      handledAt: 300,
    })
  })

  it("keeps dismissal and the newest timestamp when both same-version records are dismissed", () => {
    const local = createEmptyFeatureGuidanceState()
    local.productTour.compact = {
      handledVersion: 2,
      outcome: PRODUCT_TOUR_OUTCOMES.Dismissed,
      handledAt: 100,
    }

    const merged = mergeFeatureGuidanceStates(local, {
      productTour: {
        compact: {
          handledVersion: 2,
          outcome: PRODUCT_TOUR_OUTCOMES.Dismissed,
          handledAt: 300,
        },
      },
    })

    expect(merged.productTour.compact).toEqual({
      handledVersion: 2,
      outcome: PRODUCT_TOUR_OUTCOMES.Dismissed,
      handledAt: 300,
    })
  })

  it("discards a tour record with an unknown outcome", () => {
    const merged = mergeFeatureGuidanceStates(
      {},
      {
        productTour: {
          compact: {
            handledVersion: 1,
            outcome: "unknown",
            handledAt: 200,
          },
        },
      },
    )

    expect(merged.productTour).toEqual({})
  })

  it("returns an empty state when persisted guidance cannot be read", async () => {
    const service = new FeatureGuidanceStateService()
    const getSpy = vi
      .spyOn((service as any).preferencesStorage, "get")
      .mockRejectedValueOnce(new Error("storage unavailable"))

    try {
      await expect(service.getState()).resolves.toEqual(
        createEmptyFeatureGuidanceState(),
      )
    } finally {
      getSpy.mockRestore()
    }
  })

  it("migrates released gateway guidance but discards unreleased product-tour preferences", async () => {
    await storage.set(STORAGE_KEYS.USER_PREFERENCES, {
      themeMode: "dark",
      gatewayGuidance: {
        onboardingCompletedAt: 300,
        dismissedAtBySurface: {
          account: 200,
        },
      },
      productTour: {
        completedVersion: 99,
        completedAt: 400,
      },
    })

    const service = new FeatureGuidanceStateService()
    const state = await service.getState()

    expect(state.gatewayGuidance).toEqual({
      onboardingCompletedAt: 300,
      dismissedAtBySurface: { account: 200 },
    })
    expect(state.productTour).toEqual({})
    expect(await storage.get(STORAGE_KEYS.USER_PREFERENCES)).toEqual({
      themeMode: "dark",
    })
  })

  it("migrates released gateway guidance before an unrelated preference write", async () => {
    await storage.set(STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      gatewayGuidance: {
        onboardingCompletedAt: 300,
      },
      productTour: {
        completedVersion: 99,
        completedAt: 400,
      },
    })

    await expect(
      userPreferences.savePreferences({ themeMode: "light" }),
    ).resolves.toMatchObject({ ok: true })

    const guidance = await storage.get(STORAGE_KEYS.FEATURE_GUIDANCE_STATE)
    const preferences = await storage.get(STORAGE_KEYS.USER_PREFERENCES)
    expect(guidance).toMatchObject({
      gatewayGuidance: { onboardingCompletedAt: 300 },
      productTour: {},
    })
    expect(preferences).not.toHaveProperty("gatewayGuidance")
    expect(preferences).not.toHaveProperty("productTour")
  })

  it("migrates local gateway guidance before importing a backup without guidance", async () => {
    await storage.set(STORAGE_KEYS.USER_PREFERENCES, {
      ...DEFAULT_PREFERENCES,
      gatewayGuidance: {
        onboardingCompletedAt: 300,
        dismissedAtBySurface: { account: 200 },
      },
    })

    await expect(
      userPreferences.importPreferences({
        ...DEFAULT_PREFERENCES,
        themeMode: "light",
      }),
    ).resolves.toMatchObject({ ok: true })

    await expect(
      storage.get(STORAGE_KEYS.FEATURE_GUIDANCE_STATE),
    ).resolves.toMatchObject({
      gatewayGuidance: {
        onboardingCompletedAt: 300,
        dismissedAtBySurface: { account: 200 },
      },
    })
  })

  it("rolls a failed transaction back before applying concurrent progress", async () => {
    const service = new FeatureGuidanceStateService()
    const concurrentService = new FeatureGuidanceStateService()
    await service.markProductTourHandled(
      PRODUCT_TOUR_VARIANTS.Expanded,
      1,
      PRODUCT_TOUR_OUTCOMES.Dismissed,
      100,
    )

    let markWorkStarted: () => void = () => {}
    const workStarted = new Promise<void>((resolve) => {
      markWorkStarted = resolve
    })
    let releaseWork: () => void = () => {}
    const workGate = new Promise<void>((resolve) => {
      releaseWork = resolve
    })

    const transaction = service.withMergedStateTransaction(
      {
        productTour: {
          expanded: {
            handledVersion: 2,
            outcome: PRODUCT_TOUR_OUTCOMES.Completed,
            handledAt: 200,
          },
          compact: {
            handledVersion: 1,
            outcome: PRODUCT_TOUR_OUTCOMES.Completed,
            handledAt: 200,
          },
        },
      },
      async () => {
        markWorkStarted()
        await workGate
        throw new Error("dependent write failed")
      },
    )

    await workStarted
    let concurrentWriteSettled = false
    const concurrentWrite = concurrentService
      .markProductTourHandled(
        PRODUCT_TOUR_VARIANTS.Expanded,
        3,
        PRODUCT_TOUR_OUTCOMES.Completed,
        300,
      )
      .then(() => {
        concurrentWriteSettled = true
      })

    await Promise.resolve()
    expect(concurrentWriteSettled).toBe(false)

    releaseWork()
    await expect(transaction).rejects.toThrow("dependent write failed")
    await concurrentWrite

    const state = await service.getState()
    expect(state.productTour.expanded).toEqual({
      handledVersion: 3,
      outcome: PRODUCT_TOUR_OUTCOMES.Completed,
      handledAt: 300,
    })
    expect(state.productTour.compact).toBeUndefined()
  })

  it("propagates the dependent failure when restoring the transaction also fails", async () => {
    const service = new FeatureGuidanceStateService()
    const dependentError = new Error("dependent write failed")
    const rollbackError = new Error("rollback storage failed")
    const setSpy = vi
      .spyOn((service as any).storage, "set")
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(rollbackError)
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
    setLoggingPreferences({ consoleEnabled: true, level: "error" })

    try {
      await expect(
        service.withMergedStateTransaction({}, async () => {
          throw dependentError
        }),
      ).rejects.toBe(dependentError)

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          "Failed to rollback feature guidance transaction",
        ),
        expect.objectContaining({ message: "rollback storage failed" }),
      )
    } finally {
      setLoggingPreferences({ consoleEnabled: false, level: "debug" })
      setSpy.mockRestore()
      errorSpy.mockRestore()
    }
  })
})
