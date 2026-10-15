import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { useProductAnalyticsScope } from "~/contexts/ProductAnalyticsScopeContext"
import { PopupAccountOnboarding } from "~/features/AccountManagement/components/PopupAccountOnboarding"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  PRODUCT_ANALYTICS_FEATURE_IDS,
  PRODUCT_ANALYTICS_SURFACE_IDS,
} from "~/services/productAnalytics/contracts"
import { render, screen } from "~~/tests/test-utils/render"

const { isSidePanelMock } = vi.hoisted(() => ({ isSidePanelMock: vi.fn() }))

vi.mock("~/utils/browser", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser")>()),
  isExtensionSidePanel: isSidePanelMock,
}))

vi.mock(
  "~/features/AccountManagement/components/NewcomerSponsorRecommendationsSection",
  () => ({
    NewcomerSponsorRecommendationsSection: function ScopeProbe() {
      const scope = useProductAnalyticsScope()
      return (
        <div data-testid="onboarding-scope">{`${scope.entrypoint}/${scope.featureId}/${scope.surfaceId}`}</div>
      )
    },
  }),
)

describe("PopupAccountOnboarding", () => {
  beforeEach(() => vi.clearAllMocks())

  it.each([false, true])(
    "opens account onboarding with the correct scope (sidepanel=%s)",
    async (inSidePanel) => {
      isSidePanelMock.mockReturnValue(inSidePanel)
      const onAdd = vi.fn()
      const user = userEvent.setup()
      render(<PopupAccountOnboarding onAdd={onAdd} />, {
        withUserPreferencesProvider: false,
        withThemeProvider: false,
        withReleaseUpdateStatusProvider: false,
      })

      expect(screen.getByTestId("onboarding-scope")).toHaveTextContent(
        `${inSidePanel ? "sidepanel" : "popup"}/${PRODUCT_ANALYTICS_FEATURE_IDS.AccountManagement}/${inSidePanel ? PRODUCT_ANALYTICS_SURFACE_IDS.SidepanelActionBar : PRODUCT_ANALYTICS_SURFACE_IDS.PopupActionBar}`,
      )
      expect(
        screen.getByText("account:popupOnboarding.signInHint"),
      ).toBeVisible()
      await user.click(
        screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.addAccountButton),
      )
      expect(onAdd).toHaveBeenCalledOnce()
    },
  )
})
