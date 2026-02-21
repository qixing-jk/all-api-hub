import userEvent from "@testing-library/user-event"
import { beforeAll, describe, expect, it, vi } from "vitest"

import { AccountSelectorPanel } from "~/entrypoints/options/pages/KeyManagement/components/AccountSelectorPanel"
import keyManagementEn from "~/locales/en/keyManagement.json"
import { testI18n } from "~/tests/test-utils/i18n"
import { render, screen } from "~/tests/test-utils/render"
import { AuthTypeEnum, SiteHealthStatus } from "~/types"

const createAccount = (overrides: Partial<any>) => ({
  id: "account",
  name: "Account",
  username: "user",
  balance: { USD: 0, CNY: 0 },
  todayConsumption: { USD: 0, CNY: 0 },
  todayIncome: { USD: 0, CNY: 0 },
  todayTokens: { upload: 0, download: 0 },
  health: { status: SiteHealthStatus.Healthy },
  siteType: "new-api",
  baseUrl: "https://example.com/v1",
  token: "token",
  userId: 1,
  authType: AuthTypeEnum.AccessToken,
  checkIn: { enableDetection: false },
  ...overrides,
})

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
        selectedAccount="all"
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

    expect(await screen.findByText("2 failed")).toBeInTheDocument()

    const retryButton = await screen.findByRole("button", {
      name: keyManagementEn.actions.retryFailed,
    })
    expect(retryButton).toBeInTheDocument()

    await user.click(retryButton)
    expect(onRetryFailedAccounts).toHaveBeenCalledTimes(1)
  })
})
