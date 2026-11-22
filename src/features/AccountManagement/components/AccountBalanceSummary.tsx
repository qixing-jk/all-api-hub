import { useMemo, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { CURRENCIES } from "~/constants/money"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { BalancePortfolioSummary } from "~/features/AccountManagement/components/BalancePortfolioSummary"
import {
  FINANCIAL_AMOUNT_TONES,
  FinancialAmountSummary,
} from "~/features/AccountManagement/components/FinancialAmountSummary"
import { FinancialTotalsPopover } from "~/features/AccountManagement/components/FinancialTotalsPopover"
import { ProviderDayUsageSummary } from "~/features/AccountManagement/components/ProviderDayUsageSummary"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import {
  displayCashflowAmount,
  getReferenceCashflowTotal,
  selectDisplayCashflowGroups,
} from "~/services/accounts/metrics/consumptionProjection"
import { getDisplayCurrency } from "~/services/preferences/currencyDisplay"
import { ACCOUNT_TODAY_METRIC_STATUSES } from "~/types/accountTodayStats"
import {
  calculateTotalConsumption,
  calculateTotalIncomeForSites,
} from "~/utils/core/formatters"

/** Native balances and reported daily amounts retain independent assets, intervals and coverage. */
export default function AccountBalanceSummary({
  additionalDetails,
  additionalSummary,
  shareAction,
}: {
  additionalDetails?: ReactNode
  additionalSummary?: ReactNode
  shareAction?: ReactNode
} = {}) {
  const { t, i18n } = useTranslation("account")
  const { displayData, todayIncomeEstimateTotals } = useAccountDataContext()
  const {
    showTodayCashflow,
    preferences,
    currencyType,
    currencyDisplay = currencyType,
  } = useUserPreferencesContext()
  const displayCurrency = getDisplayCurrency(currencyDisplay, currencyType)
  const referenceCurrency = displayCurrency ?? CURRENCIES.USD
  const estimate = preferences.balanceHistory?.estimatedTodayIncome?.enabled
    ? todayIncomeEstimateTotals?.estimated?.[referenceCurrency]
    : undefined
  const consumption = useMemo(
    () => calculateTotalConsumption(displayData),
    [displayData],
  )
  const income = useMemo(
    () => calculateTotalIncomeForSites(displayData),
    [displayData],
  )
  const summaries = [
    {
      label: t("account:stats.todayConsumption"),
      projection: consumption,
      tone: FINANCIAL_AMOUNT_TONES.Expense,
    },
    {
      label: t("account:filteredTotals.income"),
      projection: income,
      tone: FINANCIAL_AMOUNT_TONES.Income,
    },
  ]
  return (
    <div
      role="region"
      aria-label={t("account:financial.summary")}
      className="space-y-1.5"
    >
      <BalancePortfolioSummary
        sites={displayData}
        allowCurrencyToggle
        overviewAction={
          <div className="flex items-center gap-1">
            <FinancialTotalsPopover
              title={t("account:financial.summary")}
              triggerLabel={t("account:financial.summaryDetails")}
              triggerAriaLabel={t("account:financial.summary")}
              sites={displayData}
              consumption={consumption}
              income={income}
              consumptionLabel={t("account:stats.todayConsumption")}
              incomeLabel={t("account:filteredTotals.income")}
              showTodayCashflow={showTodayCashflow}
              showAccountBreakdown
            >
              {showTodayCashflow && additionalDetails}
            </FinancialTotalsPopover>
            {shareAction}
          </div>
        }
      />
      {showTodayCashflow && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-1">
          {summaries.map(({ label, projection, tone }) => (
            <FinancialAmountSummary
              key={label}
              label={label}
              amounts={[
                ...selectDisplayCashflowGroups(projection, displayCurrency).map(
                  (group) => ({
                    ...displayCashflowAmount(group, displayCurrency),
                    qualifier:
                      group.coverage.status ===
                      ACCOUNT_TODAY_METRIC_STATUSES.Partial
                        ? t("todayMetricAvailability.partial")
                        : group.window.end <= Date.now()
                          ? t("financial.observedThrough", {
                              time: new Intl.DateTimeFormat(
                                i18n.language === "cimode"
                                  ? "en"
                                  : i18n.language,
                                {
                                  timeStyle: "short",
                                  timeZone: group.window.timeZone,
                                },
                              ).format(group.window.end),
                            })
                          : undefined,
                  }),
                ),
                ...[
                  getReferenceCashflowTotal(projection, referenceCurrency),
                ].flatMap((reference) =>
                  reference
                    ? [
                        {
                          ...reference,
                          qualifier: t(
                            "balanceHistory:breakdown.controls.reference",
                          ),
                        },
                      ]
                    : [],
                ),
              ]}
              tone={tone}
              emptyLabel={t(
                projection.nativeCoverage.legacyUnclassifiedCount
                  ? "account:todayMetricAvailability.pendingRefresh"
                  : "account:financial.unavailable",
              )}
            />
          ))}
          {additionalSummary}
          <ProviderDayUsageSummary sites={displayData} />
          {typeof estimate === "number" && (
            <FinancialAmountSummary
              label={t("stats.estimatedTodayIncome")}
              emptyLabel={t("financial.unavailable")}
              amounts={[
                {
                  asset: { kind: "currency", code: referenceCurrency },
                  value: String(estimate),
                },
              ]}
              tone={FINANCIAL_AMOUNT_TONES.Income}
            />
          )}
        </div>
      )}
    </div>
  )
}
