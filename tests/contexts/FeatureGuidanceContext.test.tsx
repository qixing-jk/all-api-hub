import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it } from "vitest"

import { Storage } from "@plasmohq/storage"

import {
  FeatureGuidanceProvider,
  useFeatureGuidanceContext,
} from "~/contexts/FeatureGuidanceContext"
import { STORAGE_KEYS } from "~/services/core/storageKeys"
import {
  featureGuidanceState,
  PRODUCT_TOUR_OUTCOMES,
  PRODUCT_TOUR_VARIANTS,
} from "~/services/featureGuidance/featureGuidanceState"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const storage = new Storage({ area: "local" })

function Harness() {
  const {
    state,
    completeProductTour,
    dismissProductTour,
    dismissGatewayGuidanceSurface,
    markGatewayGuidanceOnboardingCompleted,
  } = useFeatureGuidanceContext()

  return (
    <>
      <output data-testid="state">{JSON.stringify(state)}</output>
      <button
        onClick={() => completeProductTour(PRODUCT_TOUR_VARIANTS.Expanded, 2)}
      >
        complete tour
      </button>
      <button
        onClick={() => dismissProductTour(PRODUCT_TOUR_VARIANTS.Compact, 3)}
      >
        dismiss compact tour
      </button>
      <button onClick={() => dismissGatewayGuidanceSurface("account")}>
        dismiss gateway
      </button>
      <button onClick={markGatewayGuidanceOnboardingCompleted}>
        complete gateway
      </button>
    </>
  )
}

describe("FeatureGuidanceContext", () => {
  beforeEach(async () => {
    await Promise.all([
      storage.remove(STORAGE_KEYS.FEATURE_GUIDANCE_STATE),
      storage.remove(STORAGE_KEYS.USER_PREFERENCES),
    ])
  })

  it("loads and updates guidance state through domain actions", async () => {
    const user = userEvent.setup()
    render(
      <FeatureGuidanceProvider>
        <Harness />
      </FeatureGuidanceProvider>,
      {
        withUserPreferencesProvider: false,
        withFeatureGuidanceProvider: false,
        withThemeProvider: false,
      },
    )

    await screen.findByRole("button", { name: "complete tour" })
    await user.click(screen.getByRole("button", { name: "complete tour" }))
    await user.click(
      screen.getByRole("button", { name: "dismiss compact tour" }),
    )
    await user.click(screen.getByRole("button", { name: "dismiss gateway" }))
    await user.click(screen.getByRole("button", { name: "complete gateway" }))

    await waitFor(async () => {
      await expect(featureGuidanceState.getState()).resolves.toMatchObject({
        productTour: {
          expanded: { handledVersion: 2 },
          compact: {
            handledVersion: 3,
            outcome: PRODUCT_TOUR_OUTCOMES.Dismissed,
          },
        },
        gatewayGuidance: {
          onboardingCompletedAt: expect.any(Number),
          dismissedAtBySurface: { account: expect.any(Number) },
        },
      })
    })
  })

  it("rejects consumers outside the feature guidance provider", () => {
    expect(() =>
      render(<Harness />, {
        withUserPreferencesProvider: false,
        withFeatureGuidanceProvider: false,
        withThemeProvider: false,
      }),
    ).toThrow(
      "useFeatureGuidanceContext must be used within FeatureGuidanceProvider",
    )
  })
})
