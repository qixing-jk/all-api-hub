import { ChevronDown, X } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { FINANCIAL_METRIC_KINDS } from "~/components/financialMetricKinds"
import { FinancialMetricLabel } from "~/components/FinancialMetricLabel"
import { Button } from "~/components/ui"
import { hasOpenFloatingLayer } from "~/components/ui/floating-layer"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover"
import { CURRENCIES } from "~/constants/money"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { BalancePortfolioSummary } from "~/features/AccountManagement/components/BalancePortfolioSummary"
import { cn } from "~/lib/utils"
import type { ConsumptionProjection } from "~/services/accounts/metrics/consumptionProjection"
import {
  ASSET_KINDS,
  FINANCIAL_ACCOUNT_EXCLUSION_REASONS,
} from "~/services/amounts/financialConstants"
import { getDisplayCurrency } from "~/services/preferences/currencyDisplay"
import type { DisplaySiteData } from "~/types"
import { ACCOUNT_TODAY_METRIC_REASONS } from "~/types/accountTodayStats"
import { formatAssetAmount } from "~/utils/core/money"

import { FilteredTodayMetric } from "./AccountList/FilteredTodayMetric"
import { formatAccountMetricCoverage } from "./accountMetricCoverage"
import { FinancialAccountExclusions } from "./FinancialAccountExclusions"
import { FinancialObservationTime } from "./FinancialObservationTime"
import { ObservationWindow } from "./ObservationWindow"

/** Shows each native reporting interval and the accounts omitted from this metric. */
function PeriodDetails({
  projection,
  sites,
}: {
  projection: ConsumptionProjection
  sites: DisplaySiteData[]
}) {
  const { t, i18n } = useTranslation(["account", "common"])
  const { currencyType, currencyDisplay = currencyType } =
    useUserPreferencesContext()
  const referenceCurrency =
    getDisplayCurrency(currencyDisplay, currencyType) ?? CURRENCIES.USD
  const coverageText = (coverage: ConsumptionProjection["nativeCoverage"]) =>
    coverage.partialCount === 0 && coverage.legacyUnclassifiedCount === 0
      ? t("financial.coverage", {
          included: coverage.completeCount,
          eligible: coverage.eligibleCount,
        })
      : formatAccountMetricCoverage(coverage, t)
  const byWindow = new Map<string, ConsumptionProjection["groups"]>()
  for (const group of projection.groups) {
    const key = JSON.stringify([group.window, group.coverage])
    const matching = byWindow.get(key)
    if (matching) matching.push(group)
    else byWindow.set(key, [group])
  }

  return (
    <>
      {byWindow.size > 0 ? (
        <div className="space-y-3">
          {[...byWindow].map(([key, groups]) => {
            const { window, coverage } = groups[0]!
            return (
              <div key={key} className="space-y-1">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <ul className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
                    {groups.map(({ amount }, index) => (
                      <li
                        key={index}
                        className="min-w-0 text-base font-semibold break-words tabular-nums"
                      >
                        {formatAssetAmount(amount, i18n.language)}
                      </li>
                    ))}
                  </ul>
                  <ObservationWindow window={window} today />
                </div>
                <p className="text-muted-foreground">
                  {coverageText(coverage)}
                </p>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-muted-foreground">
          {t(
            projection.nativeCoverage.legacyUnclassifiedCount
              ? "todayMetricAvailability.pendingRefresh"
              : "todayMetricAvailability.unavailable",
          )}
        </p>
      )}
      {projection.references?.map((reference) => (
        <div key={reference.accountId} className="space-y-1 py-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-base font-semibold tabular-nums">
              {formatAssetAmount(
                {
                  asset: {
                    kind: ASSET_KINDS.Currency,
                    code: referenceCurrency,
                  },
                  value: String(reference.amount[referenceCurrency]),
                },
                i18n.language,
              )}
            </span>
            <span className="text-muted-foreground">
              {sites.find((site) => site.id === reference.accountId)?.name}
            </span>
            {reference.observedAt !== undefined && (
              <FinancialObservationTime observedAt={reference.observedAt} />
            )}
          </div>
          <p className="text-muted-foreground">
            {t("financial.legacy")}
            {reference.lastKnown && ` · ${t("financial.lastKnown")}`}
          </p>
        </div>
      ))}
      <FinancialAccountExclusions
        sites={sites}
        entries={projection.excludedAccounts.map(({ accountId, reason }) => ({
          accountId,
          reasons: [reason],
        }))}
        labels={{
          [FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Disabled]: t(
            "common:status.disabled",
          ),
          [FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Settings]: t(
            "financial.exclusions.settings",
          ),
          [FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Duplicate]: t(
            "netInflow.reasons.duplicate",
          ),
          [FINANCIAL_ACCOUNT_EXCLUSION_REASONS.Conflict]: t(
            "netInflow.reasons.conflict",
          ),
          [ACCOUNT_TODAY_METRIC_REASONS.LegacyUnclassified]: t(
            "todayMetricAvailability.pendingRefresh",
          ),
          [ACCOUNT_TODAY_METRIC_REASONS.NotCollected]: t(
            "financial.exclusions.notCollected",
          ),
          [ACCOUNT_TODAY_METRIC_REASONS.Unsupported]: t(
            "financial.exclusions.unsupported",
          ),
          [ACCOUNT_TODAY_METRIC_REASONS.WrongPeriod]: t(
            "financial.exclusions.wrongPeriod",
          ),
          [ACCOUNT_TODAY_METRIC_REASONS.RequestFailed]: t(
            "financial.exclusions.requestFailed",
          ),
          [ACCOUNT_TODAY_METRIC_REASONS.InvalidPayload]: t(
            "financial.exclusions.invalidPayload",
          ),
          [FINANCIAL_ACCOUNT_EXCLUSION_REASONS.NoUsableData]: t(
            "financial.exclusions.noData",
          ),
          [ACCOUNT_TODAY_METRIC_REASONS.SourcePartial]: t(
            "financial.exclusions.noData",
          ),
          [ACCOUNT_TODAY_METRIC_REASONS.PageLimit]: t(
            "financial.exclusions.noData",
          ),
        }}
      />
    </>
  )
}

/** Overview and filtered totals share an explicit, keyboard-accessible details entry. */
export function FinancialTotalsPopover({
  sites,
  consumption,
  income,
  showTodayCashflow,
  title,
  triggerLabel,
  triggerAriaLabel,
  consumptionLabel,
  incomeLabel,
  showAccountBreakdown = false,
  children,
}: {
  sites: DisplaySiteData[]
  consumption: ConsumptionProjection
  income: ConsumptionProjection
  showTodayCashflow: boolean
  title: string
  triggerLabel: string
  triggerAriaLabel?: string
  consumptionLabel?: string
  incomeLabel?: string
  showAccountBreakdown?: boolean
  children?: ReactNode
}) {
  const { t } = useTranslation(["account", "common"])
  const [open, setOpen] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const metrics = [
    {
      kind: FINANCIAL_METRIC_KINDS.Consumption,
      label: consumptionLabel ?? t("account:filteredTotals.consumption"),
      total: consumption,
    },
    {
      kind: FINANCIAL_METRIC_KINDS.Income,
      label: incomeLabel ?? t("account:filteredTotals.income"),
      total: income,
    },
  ] as const
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="xs"
          aria-label={triggerAriaLabel}
          className="h-6 min-h-6 gap-1 px-1.5 py-0 text-xs text-muted-foreground hover:text-foreground"
        >
          {triggerLabel}
          <ChevronDown aria-hidden="true" className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        ref={contentRef}
        align="start"
        aria-label={title}
        className={cn(
          "max-h-[min(32rem,var(--radix-popover-content-available-height))] w-80 max-w-[calc(100vw-1rem)] overflow-y-auto text-xs",
          showAccountBreakdown ? "p-0" : "space-y-3 p-3",
        )}
        onEscapeKeyDown={(event) => {
          if (hasOpenFloatingLayer(contentRef.current)) event.preventDefault()
        }}
      >
        <div
          className={cn(
            "flex items-center justify-between gap-2",
            showAccountBreakdown &&
              "sticky top-0 z-10 bg-popover px-3.5 py-2.5",
          )}
        >
          <h3 className="text-sm font-semibold">{title}</h3>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-muted-foreground"
            aria-label={t("common:actions.close")}
            onClick={() => setOpen(false)}
          >
            <X aria-hidden="true" className="size-3.5" />
          </Button>
        </div>
        <div
          className={
            showAccountBreakdown ? "space-y-4 px-3.5 pb-4" : "space-y-3"
          }
        >
          <BalancePortfolioSummary
            sites={sites}
            compact
            showAccountBreakdown={showAccountBreakdown}
          />
          {showTodayCashflow && (
            <div
              className={
                showAccountBreakdown
                  ? "space-y-4"
                  : "grid grid-cols-2 gap-3 border-t border-border/60 pt-3"
              }
            >
              {metrics.map(({ kind, label, total }) => (
                <section
                  key={kind}
                  role="group"
                  aria-label={label}
                  className="min-w-0 space-y-1"
                >
                  {showAccountBreakdown ? (
                    <>
                      <h4 className="font-semibold">
                        <FinancialMetricLabel kind={kind}>
                          {label}
                        </FinancialMetricLabel>
                      </h4>
                      <div className="space-y-1 pl-5">
                        <PeriodDetails projection={total} sites={sites} />
                      </div>
                    </>
                  ) : (
                    <>
                      <FinancialMetricLabel
                        kind={kind}
                        className="block text-muted-foreground"
                      >
                        {label}
                      </FinancialMetricLabel>
                      <FilteredTodayMetric total={total} t={t} />
                    </>
                  )}
                </section>
              ))}
            </div>
          )}
          {children}
        </div>
      </PopoverContent>
    </Popover>
  )
}
