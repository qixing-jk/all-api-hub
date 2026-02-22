import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { AccountSelectorPanel } from "~/entrypoints/options/pages/KeyManagement/components/AccountSelectorPanel"
import { KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE } from "~/entrypoints/options/pages/KeyManagement/constants"
import keyManagementEn from "~/locales/en/keyManagement.json"
import { testI18n } from "~/tests/test-utils/i18n"
import { render, screen } from "~/tests/test-utils/render"
import { createAccount } from "~/tests/utils/keyManagementFactories"

describe("KeyManagement AccountSelectorPanel retry failed", () => {
  beforeAll(() => {
    testI18n.addResourceBundle(
      "en",
      "keyManagement",
      keyManagementEn,
      true,
      true,
    )
  })

  it("renders retry failed accounts button and statistics in all-accounts mode", async () => {
    const user = userEvent.setup()
    const onRetryFailedAccounts = vi.fn()

    render(
      <AccountSelectorPanel
        selectedAccount={KEY_MANAGEMENT_ALL_ACCOUNTS_VALUE}
        setSelectedAccount={vi.fn()}
        displayData={[createAccount({ id: "acc-a", name: "Account A" })] as any}
        tokens={[]}
        filteredTokens={[]}
        tokenLoadProgress={null}
        failedAccounts={[
          {
            accountId: "acc-a",
            accountName: "Account A",
            errorMessage: "boom",
          },
          {
            accountId: "acc-b",
            accountName: "Account B",
            errorMessage: "boom",
          },
        ]}
        onRetryFailedAccounts={onRetryFailedAccounts}
      />,
    )

    const expectedFailedText = keyManagementEn.allAccountsFailed.replace(
      "{{count}}",
      "2",
    )
    expect(await screen.findByText(expectedFailedText)).toBeInTheDocument()

    const retryButton = await screen.findByRole("button", {
      name: keyManagementEn.actions.retryFailed,
    })
    expect(retryButton).toBeInTheDocument()

    await user.click(retryButton)
    expect(onRetryFailedAccounts).toHaveBeenCalledTimes(1)
  })
})
