import type { TFunction } from "i18next"
import { describe, expect, it, vi } from "vitest"

import { SITE_TYPES, type AccountSiteType } from "~/constants/siteType"
import { DedupeAccountCard } from "~/features/AccountManagement/components/DedupeAccountsDialog/DedupeAccountCard"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import { buildSiteAccount } from "~~/tests/test-utils/factories"
import { render, screen } from "~~/tests/test-utils/render"

const t = ((key: string) => key) as TFunction

const renderCard = (siteType: AccountSiteType) => {
  const account = buildSiteAccount({
    site_type: siteType,
    account_info: {
      ...buildSiteAccount().account_info,
      today_quota_consumption: 987654321,
      today_requests_count: 876543210,
      today_prompt_tokens: 765432109,
      today_completion_tokens: 654321098,
      todayStatsAvailability: undefined,
    },
  })

  render(
    <DedupeAccountCard
      account={account}
      group={{
        groupId: "group-1",
        keepAccountId: account.id,
        recommendedKeepAccountId: account.id,
        hasManualOverride: false,
      }}
      accountLabelById={new Map([[account.id, "Account"]])}
      pinnedAccountIds={[]}
      detailsOpenByAccountId={{ [account.id]: true }}
      isWorking={false}
      t={t}
      onKeepChange={vi.fn()}
      onToggleDetails={vi.fn()}
    />,
  )
}

describe("DedupeAccountCard today statistics", () => {
  it.each([SITE_TYPES.NEW_API, SITE_TYPES.AIHUBMIX])(
    "does not render legacy compatibility values for %s",
    async (siteType) => {
      renderCard(siteType)
      await screen.findByText(
        "ui:dialog.dedupeAccounts.details.todayConsumption",
      )

      expect(screen.queryByText("987654321")).not.toBeInTheDocument()
      expect(screen.queryByText("876543210")).not.toBeInTheDocument()
      expect(screen.queryByText("765432109")).not.toBeInTheDocument()
      expect(screen.queryByText("654321098")).not.toBeInTheDocument()
      expect(
        screen.getAllByText("common:labels.notAvailable").length,
      ).toBeGreaterThanOrEqual(3)
    },
  )

  it("renders explicitly complete today values", async () => {
    const account = buildSiteAccount({
      account_info: {
        ...buildSiteAccount().account_info,
        today_quota_consumption: 987654321,
        today_requests_count: 876543210,
        today_prompt_tokens: 765432109,
        today_completion_tokens: 654321098,
        todayStatsAvailability: {
          consumption: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          requests: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          tokens: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
          income: { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete },
        },
      },
    })

    render(
      <DedupeAccountCard
        account={account}
        group={{
          groupId: "group-1",
          keepAccountId: account.id,
          recommendedKeepAccountId: account.id,
          hasManualOverride: false,
        }}
        accountLabelById={new Map([[account.id, "Account"]])}
        pinnedAccountIds={[]}
        detailsOpenByAccountId={{ [account.id]: true }}
        isWorking={false}
        t={t}
        onKeepChange={vi.fn()}
        onToggleDetails={vi.fn()}
      />,
    )

    await screen.findByText("ui:dialog.dedupeAccounts.details.todayConsumption")

    expect(screen.getByText("987654321")).toBeInTheDocument()
    expect(screen.getByText("876543210")).toBeInTheDocument()
    const tokensDetail = screen.getByText(
      "ui:dialog.dedupeAccounts.details.todayTokens",
    ).parentElement
    expect(tokensDetail).toHaveTextContent("765432109")
    expect(tokensDetail).toHaveTextContent("654321098")
  })
})
