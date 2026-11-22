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
import { NetInflowTotalsDisplay } from "~/features/AccountManagement/components/NetInflowTotalsDisplay"
import { ProviderDayUsageSummary } from "~/features/AccountManagement/components/ProviderDayUsageSummary"
import { useAccountDataContext } from "~/features/AccountManagement/data/AccountDataContext"
import { useBalanceAsOf } from "~/features/AccountManagement/data/useBalanceAsOf"
import {
  displayCashflowAmount,
  getReferenceCashflowTotal,
  selectDisplayCashflowGroups,
} from "~/services/accounts/metrics/consumptionProjection"
import { buildNetInflowTotals } from "~/services/accounts/metrics/netInflowTotals"
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
  const { displayData, netInflowTotals } = useAccountDataContext()
  const asOf = useBalanceAsOf(displayData)
  const {
    showTodayCashflow,
    preferences,
    currencyType,
    currencyDisplay = currencyType,
  } = useUserPreferencesContext()
  const displayCurrency = getDisplayCurrency(currencyDisplay, currencyType)
  const referenceCurrency = displayCurrency ?? CURRENCIES.USD
  const netInflowEnabled =
    preferences.balanceHistory?.estimatedTodayIncome?.enabled === true
  const consumption = useMemo(
    () => calculateTotalConsumption(displayData, asOf),
    [displayData, asOf],
  )
  const income = useMemo(
    () => calculateTotalIncomeForSites(displayData, asOf),
    [displayData, asOf],
  )
  const netTotals = useMemo(
    () => netInflowTotals ?? buildNetInflowTotals(displayData),
    [netInflowTotals, displayData],
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
  const showNetInflow = netInflowEnabled && netTotals.groups.length > 0
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
              {showTodayCashflow && netInflowEnabled && (
                <NetInflowTotalsDisplay
                  totals={netTotals}
                  sites={displayData}
                />
              )}
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
          {showNetInflow && (
            <NetInflowTotalsDisplay
              totals={netTotals}
              sites={displayData}
              compact
            />
          )}
        </div>
      )}
    </div>
  )
}
