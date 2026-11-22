import { expect, it } from "vitest"

import type { RefreshAccountResult } from "~/services/accounts/accountDataModel"
import {
  accountBalanceScope,
  accountBalanceSnapshot,
  getAccountBalanceSnapshots,
} from "~/services/accounts/balanceSnapshot"
import {
  AccountUpdateUserTimestampMode,
  applySiteAccountUpdates,
} from "~/services/accounts/editing/accountDefaults"
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
  expect(
    update.account_info?.balance?.positions?.[0]?.amount?.source?.amountInputs
      ?.quota,
  ).toBe("1500000")
  expect(update.account_info).not.toHaveProperty("quota")
})

it("updates only the legacy counters backed by the refreshed account response", () => {
  const account = buildSiteAccount()
  account.account_info.legacyFinancial = {
    schemaVersion: 1,
    capturedAt: 100,
    quota: 100,
    cashflow: { consumption: 500000, income: 125000 },
  }
  const result: RefreshAccountResult = {
    success: true,
    healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
    data: {
      quota: 1500000,
      today_quota_consumption: 1250000,
      today_income: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      todayStatsAvailability: {
        consumption: { status: "complete" },
        income: { status: "unavailable", reason: "request_failed" },
        tokens: { status: "unavailable", reason: "unsupported" },
        requests: { status: "unavailable", reason: "unsupported" },
      },
      checkIn: buildCheckInConfig(),
    },
  }

  const update = buildAccountRefreshUpdate(account, result, false)
  expect(update.account_info?.legacyFinancial).toEqual({
    schemaVersion: 1,
    capturedAt: 100,
    quota: 100,
    cashflow: { consumption: 1250000, income: 125000 },
    cashflowCapturedAt: { consumption: update.last_sync_time },
  })
})

it("does not reactivate archived income for replaced credentials after a new quota response", () => {
  const account = buildSiteAccount()
  account.account_info.legacyFinancial = {
    schemaVersion: 1,
    capturedAt: 100,
    identityInvalidated: true,
    cashflow: { consumption: 500000, income: 125000 },
  }
  const result: RefreshAccountResult = {
    success: true,
    healthStatus: { status: SiteHealthStatus.Healthy, message: "" },
    data: {
      quota: 1500000,
      today_quota_consumption: 1250000,
      today_income: 0,
      today_prompt_tokens: 0,
      today_completion_tokens: 0,
      today_requests_count: 0,
      todayStatsAvailability: {
        consumption: { status: "complete" },
        income: { status: "unavailable", reason: "not_collected" },
        tokens: { status: "unavailable", reason: "unsupported" },
        requests: { status: "unavailable", reason: "unsupported" },
      },
      checkIn: buildCheckInConfig(),
    },
  }
  const next = applySiteAccountUpdates({
    account,
    updates: buildAccountRefreshUpdate(account, result, false),
    now: Date.now(),
    userTimestampMode: AccountUpdateUserTimestampMode.Preserve,
  })
  expect(next.account_info.legacyFinancial?.cashflow).toEqual({
    consumption: 1250000,
  })
})
