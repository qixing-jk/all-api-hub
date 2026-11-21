import { useTranslation } from "react-i18next"

import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { useBalanceAsOf } from "~/features/AccountManagement/data/useBalanceAsOf"
import { getSiteDayReadings } from "~/services/accounts/metrics/accountTodayStats"
import { isKnownOrStaleObservation } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  FINANCIAL_COVERAGE,
} from "~/services/amounts/financialConstants"
import { getDisplayCurrency } from "~/services/preferences/currencyDisplay"
import type { DisplaySiteData } from "~/types"
import { formatCurrencyDisplayAmount } from "~/utils/core/money"

import { ObservationWindow } from "./ObservationWindow"

/** Keep provider-day readings separate while honoring the selected monetary display currency. */
export function ProviderDayUsageSummary({
  sites,
}: {
  sites: readonly DisplaySiteData[]
}) {
  const { t, i18n } = useTranslation("account")
  const { currencyType, currencyDisplay = currencyType } =
    useUserPreferencesContext()
  const displayCurrency = getDisplayCurrency(currencyDisplay, currencyType)
  const asOf = useBalanceAsOf(sites)
  const formatCount = (value: number) =>
    new Intl.NumberFormat(i18n.language === "cimode" ? "en" : i18n.language, {
      notation: "compact",
    }).format(value)
  const readings = sites
    .filter((site) => !site.disabled)
    .flatMap((site) => {
      return getSiteDayReadings(site, asOf).map((reading, index) => ({
        site,
        ...reading,
        index,
      }))
    })
  if (!readings.length) return null
  return (
    <div
      role="group"
      aria-label={t("account:financial.siteDay")}
      className="col-span-full min-w-0 space-y-1 text-xs text-muted-foreground"
    >
      <p className="font-medium">{t("account:financial.siteDay")}</p>
      {readings.map(({ site, usage, observedAt, lastKnown, index }) => (
        <div
          key={`${site.id}:${index}`}
          className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5"
        >
          <span className="min-w-0 break-words">{site.name}</span>
          {usage.cost &&
            usage.cost.asset.kind !== ASSET_KINDS.Unknown &&
            isKnownOrStaleObservation(usage.cost.amount) && (
              <>
                <span className="font-medium tabular-nums">
                  {formatCurrencyDisplayAmount(
                    { asset: usage.cost.asset, value: usage.cost.amount.value },
                    i18n.language,
                    displayCurrency,
                    site.exchangeRate,
                  )}
                </span>
              </>
            )}
          {usage.totalRequests !== undefined && (
            <span>
              {t("usageAnalytics:summary.requests")}:{" "}
              {formatCount(usage.totalRequests)}
            </span>
          )}
          {usage.cost?.coverage === FINANCIAL_COVERAGE.Partial && (
            <span>{t("todayMetricAvailability.partial")}</span>
          )}
          {usage.totalTokens !== undefined && (
            <span>Token: {formatCount(usage.totalTokens)}</span>
          )}
          {lastKnown && <span>{t("financial.lastKnown")}</span>}
          {usage.reportedDay ? (
            <span>{usage.reportedDay}</span>
          ) : observedAt !== undefined ? (
            <span>
              {new Date(observedAt).toLocaleString(
                i18n.language === "cimode" ? "en" : i18n.language,
              )}
            </span>
          ) : null}
          {usage.cost?.window && (
            <ObservationWindow window={usage.cost.window} />
          )}
        </div>
      ))}
    </div>
  )
}
