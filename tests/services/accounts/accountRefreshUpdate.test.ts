import { expect, it } from "vitest"

import type { RefreshAccountResult } from "~/services/accounts/accountDataModel"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
  getAccountBalanceSnapshots,
} from "~/services/accounts/balanceSnapshot"
import { buildAccountRefreshUpdate } from "~/services/accounts/refresh/accountRefreshUpdate"
import { FINANCIAL_COVERAGE } from "~/services/amounts/financialConstants"
import { SiteHealthStatus } from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

it.each(["invalid", "NaN", "-2", "2usd", null, 2, true, {}, "0", "2"])(
  "preserves the reported unavailable observation independently of manual amount %s",
  (manualBalanceUsd) => {
    const account = Object.assign(buildSiteAccount(), {
      manualBalanceUsd,
    }) as ReturnType<typeof buildSiteAccount>
    const balance = accountBalanceSnapshot(
      accountBalanceScope({ baseUrl: account.site_url, accountId: account.id }),
      [],
      100,
      FINANCIAL_COVERAGE.Unknown,
    )
    const result: RefreshAccountResult = {
      success: true,
      healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
      data: {
        balance,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
        checkIn: buildCheckInConfig(),
      },
    }
    const update = buildAccountRefreshUpdate(account, result, false)
    expect(update.account_info?.balance).toBe(balance)
    expect(update.account_info).not.toHaveProperty("quota")
    expect(update.account_info).not.toHaveProperty("balanceUnavailable")
    expect(update).not.toHaveProperty("manualBalanceUsd")
    const manual = getAccountBalanceSnapshots(account).manual
    if (manualBalanceUsd === "0" || manualBalanceUsd === "2") {
      expect(manual?.positions[0]?.amount).toMatchObject({
        status: "known",
        value: manualBalanceUsd,
        source: { kind: "manual" },
      })
    } else expect(manual).toBeUndefined()
  },
)

it("retains a legacy provider's refreshed amount as a reference during adapter rollout", () => {
  const account = buildSiteAccount()
  const result: RefreshAccountResult = {
    success: true,
    healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
    data: {
      quota: 1500000,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_quota_consumption: 0,
      today_requests_count: 0,
      today_income: 0,
      checkIn: buildCheckInConfig(),
    },
  }
  const update = buildAccountRefreshUpdate(account, result, false)
  expect(update.account_info?.balance?.positions?.[0]?.amount).toMatchObject({
    status: "stale",
    value: "3",
    source: { kind: "legacy" },
  })
  expect(update.account_info?.legacyFinancial?.quota).toBe(1500000)
  expect(update.account_info).not.toHaveProperty("quota")
})
