import { ChevronDown } from "lucide-react"
import { useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { FINANCIAL_METRIC_KINDS } from "~/components/financialMetricKinds"
import { FinancialMetricLabel } from "~/components/FinancialMetricLabel"
import { Badge, Button } from "~/components/ui"
import { ACCOUNT_USAGE_SCOPES } from "~/constants/accountUsage"
import { CURRENCIES } from "~/constants/money"
import type { ReferenceCashflow } from "~/services/accounts/metrics/consumptionProjection"
import { isKnownOrStaleObservation } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  FINANCIAL_COVERAGE,
  FINANCIAL_SETTLEMENT_STATUSES,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import type { AccountUsageSummary, DisplaySiteData } from "~/types"
import {
  formatBalanceScope,
  formatBalanceSource,
  formatBalanceWindow,
} from "~/utils/core/balancePresentation"
import { formatAssetAmount, formatCompactAssetAmount } from "~/utils/core/money"

import { FinancialObservationDetails } from "../../FinancialObservationDetails"
import { FinancialObservationTime } from "../../FinancialObservationTime"

type ConsumptionObservation = AccountUsageSummary & {
  income?: boolean
  coverage?: (typeof FINANCIAL_COVERAGE)[keyof typeof FINANCIAL_COVERAGE]
  settlement?: (typeof FINANCIAL_SETTLEMENT_STATUSES)[keyof typeof FINANCIAL_SETTLEMENT_STATUSES]
}

/** Individual observations stay visible even when their period cannot enter today's totals. */
export function AccountConsumptionDetails({
  site,
}: {
  site: Pick<
    DisplaySiteData,
    | "usage"
    | "usageObservations"
    | "settledConsumption"
    | "reportedIncome"
    | "referenceConsumption"
    | "referenceIncome"
  >
}) {
  const observations: ConsumptionObservation[] = [
    ...(site.usageObservations ?? []),
    ...(site.usage ? [site.usage] : []),
    ...(site.settledConsumption ?? []).map((fact) => ({
      coverage: fact.coverage,
      settlement: fact.settlement,
      scope: ACCOUNT_USAGE_SCOPES.CurrentPeriod,
      cost: {
        asset: fact.asset,
        amount: fact.amount,
        scope: fact.scope,
        window: fact.window,
      },
    })),
    ...(site.reportedIncome ?? []).map((fact) => ({
      income: true,
      coverage: fact.coverage,
      scope: ACCOUNT_USAGE_SCOPES.CurrentPeriod,
      cost: {
        asset: fact.asset,
        amount: fact.amount,
        scope: fact.scope,
        window: fact.window,
      },
    })),
  ]
  const seen = new Set<string>()
  return (
    <div className="w-full max-w-full min-w-0 divide-y divide-border/60">
      {site.referenceConsumption && (
        <ReferenceCashflowRow reference={site.referenceConsumption} />
      )}
      {site.referenceIncome && (
        <ReferenceCashflowRow reference={site.referenceIncome} income />
      )}
      {observations.flatMap((usage) => {
        const cost = usage.cost
        if (!cost) return []
        const key = JSON.stringify([
          usage.income,
          usage.scope,
          usage.coverage,
          usage.settlement,
          cost,
        ])
        if (seen.has(key)) return []
        seen.add(key)
        return [
          <ConsumptionObservationRow key={key} usage={usage} cost={cost} />,
        ]
      })}
    </div>
  )
}

/** Release observations remain readable without assigning unrecorded native scope or periods. */
function ReferenceCashflowRow({
  reference,
  income = false,
}: {
  reference: ReferenceCashflow
  income?: boolean
}) {
  const { t, i18n } = useTranslation(["account"])
  return (
    <div className="min-w-0 space-y-2 py-3 text-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <FinancialMetricLabel
          kind={
            income
              ? FINANCIAL_METRIC_KINDS.Income
              : FINANCIAL_METRIC_KINDS.Consumption
          }
          className="text-muted-foreground"
        >
          {t(income ? "financial.reportedIncome" : "stats.todayConsumption")}
        </FinancialMetricLabel>
        <span className="text-sm font-semibold break-words text-foreground tabular-nums">
          {formatAssetAmount(
            {
              asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
              value: String(reference.amount.USD),
            },
            i18n.language,
          )}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge size="sm" variant="secondary">
          {t("financial.legacy")}
        </Badge>
        {reference.lastKnown && (
          <Badge size="sm" variant="warning">
            {t("financial.lastKnown")}
          </Badge>
        )}
        {reference.observedAt === undefined ? (
          <span className="text-muted-foreground">
            {t("financial.timingUnknown")}
          </span>
        ) : (
          <FinancialObservationTime observedAt={reference.observedAt} />
        )}
      </div>
    </div>
  )
}

/** A readable amount row with explicitly requested precision and observation details. */
function ConsumptionObservationRow({
  usage,
  cost,
}: {
  usage: ConsumptionObservation
  cost: NonNullable<AccountUsageSummary["cost"]>
}) {
  const { t, i18n } = useTranslation(["account", "keyManagement", "common"])
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()
  const label = usage.income
    ? t("financial.reportedIncome")
    : usage.scope === ACCOUNT_USAGE_SCOPES.Lifetime
      ? t("financial.usageLifetime")
      : t("financial.usagePeriod")
  const knownAmount =
    isKnownOrStaleObservation(cost.amount) &&
    cost.asset.kind !== ASSET_KINDS.Unknown
      ? { asset: cost.asset, value: cost.amount.value }
      : undefined
  const amount = knownAmount
    ? formatCompactAssetAmount(knownAmount, i18n.language)
    : t("financial.unavailable")
  const exact = knownAmount
    ? formatAssetAmount(knownAmount, i18n.language)
    : t("financial.unavailable")
  const coverage = usage.coverage ?? cost.coverage
  return (
    <div
      role="group"
      aria-label={`${label} · ${amount}`}
      className="min-w-0 space-y-2 py-3 text-xs"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <FinancialMetricLabel
          kind={
            usage.income
              ? FINANCIAL_METRIC_KINDS.Income
              : FINANCIAL_METRIC_KINDS.Consumption
          }
          className="text-muted-foreground"
        >
          {label}
        </FinancialMetricLabel>
        <div className="max-w-full space-y-1 text-right">
          <div className="text-sm font-semibold break-words text-foreground tabular-nums">
            {amount}
          </div>
          {isKnownOrStaleObservation(cost.amount) && (
            <FinancialObservationTime observedAt={cost.amount.observedAt} />
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {cost.amount.status === OBSERVATION_STATUSES.Stale && (
          <Badge size="sm" variant="warning">
            {t("financial.lastKnown")}
          </Badge>
        )}
        {coverage === FINANCIAL_COVERAGE.Partial && (
          <Badge size="sm" variant="warning">
            {t("keyManagement:financial.partial")}
          </Badge>
        )}
        {coverage === FINANCIAL_COVERAGE.Unknown && (
          <Badge size="sm" variant="secondary">
            {t("financial.coverageUnknown")}
          </Badge>
        )}
        {usage.settlement && (
          <Badge
            size="sm"
            variant={
              usage.settlement === FINANCIAL_SETTLEMENT_STATUSES.Settled
                ? "secondary"
                : "warning"
            }
          >
            {usage.settlement === FINANCIAL_SETTLEMENT_STATUSES.Pending
              ? t("financial.pendingCharge")
              : usage.settlement === FINANCIAL_SETTLEMENT_STATUSES.Settled
                ? t("financial.settled")
                : t("financial.settlementUnknown")}
          </Badge>
        )}
        {cost.window?.timeZone && (
          <span className="text-muted-foreground">{cost.window.timeZone}</span>
        )}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="ml-auto h-6 gap-1 px-1.5 text-xs"
          aria-expanded={expanded}
          aria-controls={detailsId}
          onClick={() => setExpanded(!expanded)}
        >
          {t("keyManagement:actions.details")}
          <ChevronDown
            aria-hidden="true"
            className={`size-3 ${expanded ? "rotate-180" : ""}`}
          />
        </Button>
      </div>
      {!cost.window && usage.scope !== ACCOUNT_USAGE_SCOPES.Lifetime && (
        <span className="block text-muted-foreground">
          {t("financial.timingUnknown")}
        </span>
      )}
      {expanded && (
        <div
          id={detailsId}
          className="space-y-2 rounded-md bg-muted/40 p-3 text-muted-foreground"
        >
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5">
            <dt>{t("financial.exactAmount")}</dt>
            <dd className="text-right font-medium break-words text-foreground tabular-nums">
              {exact}
            </dd>
          </dl>
          <div className="space-y-1 break-words">
            {formatBalanceWindow(cost.window, t, i18n.language).map((line) => (
              <p key={line}>{line}</p>
            ))}
            {cost.scope &&
              formatBalanceScope(cost.scope, t).map((line, index) => (
                <p key={index}>{line}</p>
              ))}
          </div>
          <FinancialObservationDetails>
            <p>{formatBalanceSource(cost.amount.source, t, true)}</p>
          </FinancialObservationDetails>
        </div>
      )}
    </div>
  )
}
