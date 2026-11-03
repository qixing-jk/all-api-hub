import { expect, it } from "vitest"

import type { RefreshAccountResult } from "~/services/accounts/accountDataModel"
import { buildAccountRefreshUpdate } from "~/services/accounts/refresh/accountRefreshUpdate"
import { SiteHealthStatus } from "~/types"
import { buildCheckInConfig } from "~~/tests/test-utils/checkIn"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

it.each(["invalid", "NaN", "-2", "2usd", null, 2, true, {}])(
  "retains unavailable balance when manual amount %s is invalid",
  (manualBalanceUsd) => {
    const result: RefreshAccountResult = {
      success: true,
      healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
      data: {
        quota: 0,
        balanceUnavailable: true,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
        checkIn: buildCheckInConfig(),
      },
    }
    const update = buildAccountRefreshUpdate(
      Object.assign(buildSiteAccount(), { manualBalanceUsd }) as ReturnType<
        typeof buildSiteAccount
      >,
      result,
      false,
    )
    expect(update.account_info?.balanceUnavailable).toBe(true)
    expect(update.account_info?.quota).toBe(0)
  },
)

it.each(["0", "2"])(
  "clears unavailable balance for valid manual amount %s",
  (manualBalanceUsd) => {
    const result: RefreshAccountResult = {
      success: true,
      healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
      data: {
        quota: 0,
        balanceUnavailable: true,
        today_prompt_tokens: 0,
        today_completion_tokens: 0,
        today_quota_consumption: 0,
        today_requests_count: 0,
        today_income: 0,
        checkIn: buildCheckInConfig(),
      },
    }
    const update = buildAccountRefreshUpdate(
      buildSiteAccount({ manualBalanceUsd }),
      result,
      false,
    )
    expect(update.account_info?.balanceUnavailable).toBe(false)
    expect(update.account_info?.quota).toBe(Number(manualBalanceUsd) * 500000)
  },
)
