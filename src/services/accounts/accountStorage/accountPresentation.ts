import {
  ACCOUNT_CASHFLOW_METRICS,
  type AccountCashflowMetric,
} from "~/constants/accountUsage"
import { QUOTA_PER_USD } from "~/constants/money"
import { getAccountBalanceSnapshots } from "~/services/accounts/balanceSnapshot"
import { normalizeSiteAccount } from "~/services/accounts/editing/accountDefaults"
import { resolveAccountTodayStatsAvailability } from "~/services/accounts/metrics/accountTodayStatsResolver"
import {
  getDisplayConsumptionProjection,
  getDisplayIncomeProjection,
  hasRecordedCashflowAmount,
  type ReferenceCashflow,
} from "~/services/accounts/metrics/consumptionProjection"
import {
  collectDuplicateAccountNameKeys,
  resolveAccountDisplayName,
} from "~/services/accounts/utils/accountDisplayName"
import type {
  AccountMetricCoverage,
  AccountTodayMetricAvailability,
  DisplaySiteData,
  SiteAccount,
} from "~/types"
import { SiteHealthStatus } from "~/types"
import {
  ACCOUNT_TODAY_METRIC_REASONS,
  ACCOUNT_TODAY_METRIC_STATUSES,
} from "~/types/accountTodayStats"
import { formatLocalDayKey } from "~/utils/core/dayKey"
import { convertCurrencyAmount } from "~/utils/core/money"

/** Preserve a source's absence reason until qualified financial facts are available. */
function financialMetricAvailability(
  hasObservations: boolean,
  original: AccountTodayMetricAvailability,
  coverage: AccountMetricCoverage,
): AccountTodayMetricAvailability {
  if (
    !hasObservations &&
    original.status === ACCOUNT_TODAY_METRIC_STATUSES.Unavailable
  )
    return original
  if (coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Complete)
    return { status: ACCOUNT_TODAY_METRIC_STATUSES.Complete }
  return coverage.status === ACCOUNT_TODAY_METRIC_STATUSES.Partial
    ? {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Partial,
        reason: ACCOUNT_TODAY_METRIC_REASONS.SourcePartial,
      }
    : {
        status: ACCOUNT_TODAY_METRIC_STATUSES.Unavailable,
        reason: ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod,
      }
}

class AccountPresentation {
  convertToDisplayData(
    input: SiteAccount,
    displayNameAccountsContext?: readonly SiteAccount[],
  ): DisplaySiteData
  convertToDisplayData(
    input: SiteAccount[],
    displayNameAccountsContext?: readonly SiteAccount[],
  ): DisplaySiteData[]
  convertToDisplayData(
    input: SiteAccount | SiteAccount[],
    displayNameAccountsContext?: readonly SiteAccount[],
  ): DisplaySiteData | DisplaySiteData[] {
    const normalizedInput = Array.isArray(input)
      ? input.map(normalizeSiteAccount)
      : normalizeSiteAccount(input)
    const normalizedAccounts = Array.isArray(normalizedInput)
      ? normalizedInput
      : [normalizedInput]
    const normalizedContext = displayNameAccountsContext
      ? displayNameAccountsContext.map(normalizeSiteAccount)
      : normalizedAccounts
    const duplicateKeys = collectDuplicateAccountNameKeys(normalizedContext)

    const transform = (account: SiteAccount): DisplaySiteData => {
      const originalAvailability = resolveAccountTodayStatsAvailability(account)
      const reference = (
        metric: AccountCashflowMetric,
      ): ReferenceCashflow | undefined => {
        const facts =
          metric === ACCOUNT_CASHFLOW_METRICS.Consumption
            ? account.account_info.settledConsumption
            : account.account_info.reportedIncome
        const value = account.account_info.legacyFinancial?.cashflow?.[metric]
        const availability = originalAvailability[metric]
        if (
          hasRecordedCashflowAmount(facts) ||
          typeof value !== "number" ||
          !Number.isFinite(value)
        )
          return undefined
        const at =
          account.account_info.legacyFinancial?.cashflowCapturedAt?.[metric] ??
          account.account_info.legacyFinancial?.capturedAt ??
          account.last_sync_time
        const observedAt =
          at > 0 && Number.isFinite(new Date(at).getTime()) ? at : undefined
        const usd = value / QUOTA_PER_USD
        const cny = convertCurrencyAmount(
          { asset: { kind: "currency", code: "USD" }, value: String(usd) },
          "CNY",
          account.exchange_rate,
        )
        return {
          amount: {
            USD: usd,
            CNY:
              cny.asset.kind === "currency" && cny.asset.code === "CNY"
                ? Number(cny.value)
                : 0,
          },
          ...(observedAt === undefined ? {} : { observedAt }),
          lastKnown:
            account.account_info.legacyFinancial?.identityInvalidated ===
              true ||
            account.health.status !== SiteHealthStatus.Healthy ||
            (availability.status ===
              ACCOUNT_TODAY_METRIC_STATUSES.Unavailable &&
              availability.reason !==
                ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified) ||
            observedAt === undefined ||
            observedAt > Date.now() ||
            formatLocalDayKey(new Date(observedAt)) !==
              formatLocalDayKey(new Date()),
        }
      }
      const referenceConsumption = reference(
        ACCOUNT_CASHFLOW_METRICS.Consumption,
      )
      const referenceIncome = reference(ACCOUNT_CASHFLOW_METRICS.Income)
      const incomeProjection = getDisplayIncomeProjection([
        {
          id: account.id,
          reportedIncome: account.account_info.reportedIncome,
          todayStatsAvailability: originalAvailability,
          referenceIncome,
        },
      ])
      const consumptionProjection = getDisplayConsumptionProjection([
        {
          id: account.id,
          settledConsumption: account.account_info.settledConsumption,
          todayStatsAvailability: originalAvailability,
          referenceConsumption,
        },
      ])
      const { reported, manual } = getAccountBalanceSnapshots(account)
      return {
        ...(referenceConsumption ? { referenceConsumption } : {}),
        ...(referenceIncome ? { referenceIncome } : {}),
        reportedIncome: account.account_info.reportedIncome,
        incomeProjection,
        settledConsumption: account.account_info.settledConsumption,
        consumptionProjection,
        balanceSnapshot: reported,
        allowances: account.account_info.allowances,
        manualBalanceSnapshot: manual,
        id: account.id,
        exchangeRate: account.exchange_rate,
        name: resolveAccountDisplayName({
          baseName: account.site_name,
          username: account.account_info.username,
          duplicateKeys,
        }),
        baseName: account.site_name,
        username: account.account_info.username,
        disabled: account.disabled,
        excludeFromTotalBalance: account.excludeFromTotalBalance,
        excludeFromTodayIncome: account.excludeFromTodayIncome,
        todayConsumption:
          referenceConsumption?.amount ?? consumptionProjection.amount,
        todayIncome: referenceIncome?.amount ?? incomeProjection.amount,
        todayTokens: {
          upload: account.account_info.today_prompt_tokens,
          download: account.account_info.today_completion_tokens,
        },
        todayStatsAvailability: {
          ...originalAvailability,
          income: financialMetricAvailability(
            !!account.account_info.reportedIncome?.length,
            originalAvailability.income,
            incomeProjection.nativeCoverage,
          ),
          consumption: financialMetricAvailability(
            !!account.account_info.settledConsumption?.length,
            originalAvailability.consumption,
            consumptionProjection.nativeCoverage,
          ),
        },
        usage: account.account_info.usage,
        usageObservations: account.account_info.usageObservations,
        subscription: account.account_info.subscription,
        recentUsageRecords: account.account_info.recentUsageRecords,
        health: account.health,
        last_sync_time: account.last_sync_time,
        created_at: account.created_at,
        baseUrl: account.site_url,
        token: account.account_info.access_token,
        userId: account.account_info.id,
        notes: account.notes,
        tagIds: account.tagIds,
        tags: account.tags,
        siteType: account.site_type,
        checkIn: account.checkIn,
        authType: account.authType,
        cookieAuthSessionCookie: account.cookieAuth?.sessionCookie,
        ...(account.aimlApiAuth?.apiKey
          ? { aimlApiKey: account.aimlApiAuth.apiKey }
          : {}),
      }
    }

    return Array.isArray(normalizedInput)
      ? normalizedAccounts.map(transform)
      : transform(normalizedInput)
  }

  resolveDisplayData(
    account: SiteAccount,
    accountsContext: SiteAccount[] = [],
  ): DisplaySiteData {
    const normalizedAccount = normalizeSiteAccount(account)
    const contextWithAccount = Array.from(
      new Map(
        [...accountsContext.map(normalizeSiteAccount), normalizedAccount].map(
          (item) => [item.id, item],
        ),
      ).values(),
    )
    return this.convertToDisplayData(normalizedAccount, contextWithAccount)
  }
}

export const accountPresentation = new AccountPresentation()
