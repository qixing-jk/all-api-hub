import { beforeEach, describe, expect, it } from "vitest"

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
})
