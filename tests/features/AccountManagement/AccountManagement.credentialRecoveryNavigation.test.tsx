import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import AccountManagement from "~/features/AccountManagement/AccountManagement"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import { AuthTypeEnum, type DisplaySiteData } from "~/types"
import { replaceWithinOptionsPage } from "~/utils/navigation/optionsPage"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { render, screen, waitFor } from "~~/tests/test-utils/render"

const { scenario, openEditAccount } = vi.hoisted(() => ({
  scenario: {
    displayData: [] as DisplaySiteData[],
    isInitialLoad: false,
    isEditAccountOpen: false,
  },
  openEditAccount: vi.fn(),
}))

vi.mock(
  "~/features/AccountManagement/workspace/AccountManagementProvider",
  () => ({
    AccountManagementProvider: ({ children }: { children: ReactNode }) => (
      <>{children}</>
    ),
  }),
)
vi.mock("~/features/AccountManagement/dialogs/useDialogStateContext", () => ({
  useAccountDialogActions: () => ({
    openAddAccount: vi.fn(),
    openEditAccount,
  }),
  useDialogStateContext: () => ({
    openAddAccount: vi.fn(),
    openEditAccount,
    isEditAccountOpen: scenario.isEditAccountOpen,
    isAddAccountOpen: false,
  }),
}))
vi.mock("~/features/AccountManagement/data/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    ...scenario,
    loadAccountData: vi.fn(),
    isRefreshing: false,
    isRefreshingDisabledAccounts: false,
  }),
}))
vi.mock("~/features/AccountManagement/actions/AccountActionsContext", () => ({
  useAccountActionsContext: () => ({}),
}))
vi.mock("~/features/AccountManagement/components/AccountList", () => ({
  default: () => null,
}))
vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    state: {
      schemaVersion: 1,
      productTour: {},
      gatewayGuidance: { dismissedAtBySurface: {} },
    },
    dismissGatewayGuidanceSurface: vi.fn(),
  }),
}))
vi.mock("~/utils/navigation/optionsPage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/navigation/optionsPage")>()),
  replaceWithinOptionsPage: vi.fn(),
}))

const routeParams = {
  action: "edit",
  accountId: "cookie-account",
  focusSection: "account-login",
}

describe("account login recovery navigation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    scenario.displayData = [
      buildDisplaySiteData({
        id: routeParams.accountId,
        siteType: SITE_TYPES.ANYROUTER,
        authType: AuthTypeEnum.Cookie,
      }),
    ]
    scenario.isInitialLoad = false
    scenario.isEditAccountOpen = false
  })

  it("waits for saved accounts and opens the matching login section once", async () => {
    const account = scenario.displayData[0]!
    scenario.isInitialLoad = true
    scenario.displayData = []
    const { rerender } = render(<AccountManagement routeParams={routeParams} />)
    await screen.findByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.headerActions)
    expect(openEditAccount).not.toHaveBeenCalled()

    scenario.isInitialLoad = false
    scenario.displayData = [account]
    rerender(<AccountManagement routeParams={routeParams} />)
    await waitFor(() =>
      expect(openEditAccount).toHaveBeenCalledWith(account, {
        focusSection: "account-login",
      }),
    )
    expect(replaceWithinOptionsPage).toHaveBeenCalled()
    scenario.displayData = [{ ...account }]
    rerender(<AccountManagement routeParams={routeParams} />)
    expect(openEditAccount).toHaveBeenCalledTimes(1)
  })

  it("preserves an existing editor until it closes", async () => {
    scenario.isEditAccountOpen = true
    const { rerender } = render(<AccountManagement routeParams={routeParams} />)
    await screen.findByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.headerActions)
    expect(openEditAccount).not.toHaveBeenCalled()
    scenario.isEditAccountOpen = false
    rerender(<AccountManagement routeParams={routeParams} />)
    await waitFor(() => expect(openEditAccount).toHaveBeenCalledTimes(1))
  })

  it("opens authentication settings when the account switched away from Cookie before navigation", async () => {
    const account = buildDisplaySiteData({
      id: routeParams.accountId,
      siteType: SITE_TYPES.ANYROUTER,
      authType: AuthTypeEnum.AccessToken,
    })
    scenario.displayData = [account]
    render(<AccountManagement routeParams={routeParams} />)
    await waitFor(() =>
      expect(openEditAccount).toHaveBeenCalledWith(account, {
        focusSection: "account-auth",
      }),
    )
  })

  it("does not open an unrelated account when the requested account was removed", async () => {
    scenario.displayData = [buildDisplaySiteData({ id: "another-account" })]
    render(<AccountManagement routeParams={routeParams} />)
    await screen.findByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.headerActions)
    expect(openEditAccount).not.toHaveBeenCalled()
  })
})
