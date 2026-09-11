import userEvent from "@testing-library/user-event"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import AccountManagement from "~/features/AccountManagement/AccountManagement"
import { ACCOUNT_MANAGEMENT_TEST_IDS } from "~/features/AccountManagement/testIds"
import {
  buildDisplaySiteData,
  buildSiteAccount,
} from "~~/tests/test-utils/factories"
import { render, screen, waitFor, within } from "~~/tests/test-utils/render"

const { openEditAccount, loadAccountData, deleteAccount } = vi.hoisted(() => ({
  openEditAccount: vi.fn(),
  loadAccountData: vi.fn(),
  deleteAccount: vi.fn(),
}))
const accounts = ["old", "new"].map((id) =>
  buildSiteAccount({
    id,
    site_name: `${id} site`,
    site_url: `https://${id}.example.com`,
    site_type: "new-api",
    disabled: true,
    account_info: { ...buildSiteAccount().account_info, id: "42" },
  }),
)
const displayData = accounts.map((account) =>
  buildDisplaySiteData({
    id: account.id,
    name: account.site_name,
    baseUrl: account.site_url,
    disabled: true,
  }),
)

vi.mock("~/features/AccountManagement/hooks/AccountManagementProvider", () => ({
  AccountManagementProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))
vi.mock("~/features/AccountManagement/hooks/DialogStateContext", () => ({
  useDialogStateContext: () => ({ openAddAccount: vi.fn(), openEditAccount }),
}))
vi.mock("~/features/AccountManagement/hooks/AccountDataContext", () => ({
  useAccountDataContext: () => ({
    accounts,
    displayData,
    loadAccountData,
    pinnedAccountIds: [],
    orderedAccountIds: [],
    isRefreshing: false,
    isRefreshingDisabledAccounts: false,
  }),
}))
vi.mock("~/features/AccountManagement/hooks/AccountActionsContext", () => ({
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
vi.mock(
  "~/services/accounts/accountStorage/accountMutations",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("~/services/accounts/accountStorage/accountMutations")
      >()
    return {
      ...actual,
      accountMutations: { ...actual.accountMutations, deleteAccount },
    }
  },
)

describe("account management suspected duplicate review", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    deleteAccount.mockResolvedValue(true)
    loadAccountData.mockResolvedValue(undefined)
  })

  it("opens the selected account editor and retains the review until explicitly closed", async () => {
    const user = userEvent.setup()
    render(<AccountManagement />)
    await user.click(
      await screen.findByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.dedupeScanButton),
    )
    const review = screen.getByRole("dialog", {
      name: "ui:dialog.dedupeAccounts.title",
    })
    expect(
      within(review).getByText("ui:dialog.dedupeAccounts.suspected.sameDomain"),
    ).toBeVisible()
    expect(
      within(review).getAllByText("account:list.site.disabled"),
    ).toHaveLength(2)
    await user.click(
      within(review).getAllByRole("button", {
        name: "ui:dialog.dedupeAccounts.suspected.reviewAccount",
      })[1],
    )
    expect(openEditAccount).toHaveBeenCalledWith(displayData[1])
    expect(review).toBeVisible()
    expect(deleteAccount).not.toHaveBeenCalled()
    await user.click(
      within(review).getAllByRole("button", {
        name: "common:actions.close",
      })[0],
    )
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
  })

  it("cancels without deleting and refreshes accounts after confirmed individual deletion", async () => {
    const user = userEvent.setup()
    render(<AccountManagement />)
    await user.click(
      await screen.findByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.dedupeScanButton),
    )
    const review = screen.getByRole("dialog", {
      name: "ui:dialog.dedupeAccounts.title",
    })
    const deleteSelected = within(review).getAllByRole("button", {
      name: "ui:dialog.dedupeAccounts.suspected.deleteAccount",
    })[0]
    await user.click(deleteSelected)
    const confirmation = screen.getByRole("dialog", {
      name: "ui:dialog.delete.title",
    })
    expect(
      within(confirmation).getByText("https://old.example.com"),
    ).toBeVisible()
    await user.click(
      within(confirmation).getByRole("button", {
        name: "common:actions.cancel",
      }),
    )
    expect(deleteAccount).not.toHaveBeenCalled()
    expect(loadAccountData).not.toHaveBeenCalled()
    expect(review).toBeVisible()
    await user.click(deleteSelected)
    await user.click(
      screen.getByTestId(ACCOUNT_MANAGEMENT_TEST_IDS.deleteConfirmButton),
    )
    await waitFor(() => expect(loadAccountData).toHaveBeenCalledTimes(1))
    expect(deleteAccount).toHaveBeenCalledExactlyOnceWith("old")
    expect(
      screen.queryByRole("dialog", { name: "ui:dialog.delete.title" }),
    ).not.toBeInTheDocument()
    expect(review).toBeVisible()
  })
})
