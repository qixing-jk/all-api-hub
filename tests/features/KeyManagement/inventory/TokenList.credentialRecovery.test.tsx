import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/features/KeyManagement/constants"
import { TokenList } from "~/features/KeyManagement/inventory/TokenList"
import { AuthTypeEnum } from "~/types"
import { openTargetedOptionsPage } from "~/utils/navigation/optionsPage"
import { nativeRowFromSeed } from "~~/tests/test-utils/keyManagement/TokenListHarness"
import { render, screen } from "~~/tests/test-utils/render"
import {
  createAccount,
  createToken,
} from "~~/tests/utils/keyManagementFactories"

vi.mock("~/utils/navigation/optionsPage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/navigation/optionsPage")>()),
  openTargetedOptionsPage: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("~/contexts/FeatureGuidanceContext", () => ({
  useFeatureGuidanceContext: () => ({
    markGatewayGuidanceOnboardingCompleted: vi.fn(),
  }),
}))

describe("key inventory credential recovery guidance", () => {
  it.each([false, true])(
    "links a rejected Cookie account to login configuration (all accounts: %s)",
    async (allAccounts) => {
      const account = createAccount({
        id: "anyrouter-keys",
        siteType: SITE_TYPES.ANYROUTER,
        authType: AuthTypeEnum.Cookie,
      })
      const user = userEvent.setup()
      render(
        <TokenList
          isLoading={false}
          entries={[]}
          filteredEntries={[]}
          displayData={[account]}
          selectedAccount={
            allAccounts ? KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE : account.id
          }
          handleAddToken={vi.fn()}
          nativeInventoryLoadError="authentication failed"
          authenticationFailedAccountIds={[account.id]}
        />,
      )
      await screen.findByText("keyManagement:loadError.title")
      await user.click(
        screen.getByRole("button", {
          name: "accountDialog:login.configureRecovery",
        }),
      )
      expect(openTargetedOptionsPage).toHaveBeenCalledWith(
        expect.objectContaining({
          inPageSearchParams: {
            action: "edit",
            accountId: account.id,
            focusSection: "account-login",
          },
        }),
      )
    },
  )

  it("keeps available keys usable and scopes recovery to the visible rejected account", async () => {
    const rejectedAccount = createAccount({
      id: "rejected-account",
      name: "Rejected account",
      siteType: SITE_TYPES.ANYROUTER,
      authType: AuthTypeEnum.Cookie,
    })
    const availableAccount = createAccount({
      id: "available-account",
      name: "Available account",
    })
    const props = {
      isLoading: false,
      entries: [],
      filteredEntries: [],
      displayData: [rejectedAccount, availableAccount],
      selectedAccount: KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE,
      handleAddToken: vi.fn(),
      authenticationFailedAccountIds: [rejectedAccount.id],
      nativeRows: [
        nativeRowFromSeed(
          availableAccount,
          createToken({
            accountId: availableAccount.id,
            name: "Available key",
          }),
        ),
      ],
    }
    const user = userEvent.setup()
    const { rerender } = render(<TokenList {...props} />)
    await user.click(
      await screen.findByRole("button", { name: /Available account/u }),
    )
    expect(await screen.findByText("Available key")).toBeVisible()
    await user.click(
      screen.getByRole("button", {
        name: "accountDialog:login.configureRecovery",
      }),
    )
    expect(openTargetedOptionsPage).toHaveBeenCalledWith(
      expect.objectContaining({
        inPageSearchParams: expect.objectContaining({
          accountId: rejectedAccount.id,
        }),
      }),
    )

    rerender(
      <TokenList
        {...props}
        allAccountsFilterAccountIds={[availableAccount.id]}
      />,
    )
    expect(screen.getByText("Available key")).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:login.configureRecovery",
      }),
    ).not.toBeInTheDocument()

    rerender(<TokenList {...props} authenticationFailedAccountIds={[]} />)
    expect(screen.getByText("Available key")).toBeVisible()
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:login.configureRecovery",
      }),
    ).not.toBeInTheDocument()
  })

  it("does not suggest login recovery for an unclassified load failure", async () => {
    const account = createAccount({
      siteType: SITE_TYPES.ANYROUTER,
      authType: AuthTypeEnum.Cookie,
    })
    render(
      <TokenList
        isLoading={false}
        entries={[]}
        filteredEntries={[]}
        displayData={[account]}
        selectedAccount={account.id}
        handleAddToken={vi.fn()}
        nativeInventoryLoadError="HTTP 401 text from an unknown failure"
      />,
    )
    await screen.findByText("keyManagement:loadError.title")
    expect(
      screen.queryByRole("button", {
        name: "accountDialog:login.configureRecovery",
      }),
    ).not.toBeInTheDocument()
  })
})
