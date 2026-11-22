import { useTranslation } from "react-i18next"

import { FINANCIAL_METRIC_KINDS } from "~/components/financialMetricKinds"
import { FinancialMetricLabel } from "~/components/FinancialMetricLabel"
import { Caption } from "~/components/ui"
import { cn } from "~/lib/utils"
import {
  buildNetInflowTotals,
  type NetInflowTotals,
} from "~/services/accounts/metrics/netInflowTotals"
import { assetIdentity } from "~/services/amounts/assets"
import {
  FINANCIAL_COVERAGE,
  SCOPE_SELECTION_KINDS,
} from "~/services/amounts/financialConstants"
import type { DisplaySiteData } from "~/types"
import { formatBalanceSource } from "~/utils/core/balancePresentation"
import { formatAssetAmount, formatCompactAssetAmount } from "~/utils/core/money"
import {
  getNetInflowAssetLabel,
  getNetInflowReasonLabel,
} from "~/utils/core/netInflowPresentation"

import { ObservationWindow } from "./ObservationWindow"

/** Estimates retain separate asset/window totals and explain every omitted account. */
export function NetInflowTotalsDisplay({
  totals,
  sites,
  compact = false,
}: {
  totals?: NetInflowTotals
  sites: DisplaySiteData[]
  compact?: boolean
}) {
  const { t, i18n } = useTranslation(["account", "shareSnapshots"])
  const summary = totals ?? buildNetInflowTotals(sites)
  const name = (id: string) => sites.find((site) => site.id === id)?.name ?? id
  const countByAsset = new Map<string, number>()
  for (const { amount } of summary.groups) {
    const asset = assetIdentity(amount.asset)
    countByAsset.set(asset, (countByAsset.get(asset) ?? 0) + 1)
  }
  return (
    <section
      aria-label={t("account:stats.estimatedNetInflow")}
      className={cn("min-w-0 space-y-1", !compact && "[&>:not(h4)]:ml-5")}
    >
      <Caption
        as={compact ? "p" : "h4"}
        className={compact ? "font-medium" : "font-semibold text-foreground"}
      >
        <FinancialMetricLabel kind={FINANCIAL_METRIC_KINDS.Change}>
          {t("account:stats.estimatedNetInflow")}
        </FinancialMetricLabel>
      </Caption>
      {summary.groups.length ? (
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
          {summary.groups.map((group) => (
            <div key={group.key} className="min-w-0">
              <p
                className="text-base font-semibold break-words tabular-nums"
                title={formatAssetAmount(group.amount, i18n.language)}
              >
                {formatCompactAssetAmount(group.amount, i18n.language)}
              </p>
              {compact &&
                (countByAsset.get(assetIdentity(group.amount.asset)) ?? 0) >
                  1 && <ObservationWindow window={group.window} />}
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground">
          {t("account:financial.unavailable")}
        </p>
      )}
      {compact &&
        summary.groups.length > 0 &&
        summary.coverage === FINANCIAL_COVERAGE.Partial && (
          <Caption as="p">{t("shareSnapshots:financial.partial")}</Caption>
        )}
      {!compact && (
        <>
          <Caption as="p">
            {t("account:netInflow.coverage", {
              included: summary.availableAccounts,
              eligible: summary.totalAccounts,
            })}{" "}
            ·{" "}
            {summary.coverage === FINANCIAL_COVERAGE.Complete
              ? t("shareSnapshots:financial.complete")
              : t("shareSnapshots:financial.partial")}
          </Caption>
          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              {t("account:netInflow.details")}
            </summary>
            <p className="py-1">{t("account:netInflow.explanation")}</p>
            {summary.groups.map((group) => (
              <div key={group.key} className="py-1">
                <p className="font-medium">
                  {formatAssetAmount(group.amount, i18n.language)}
                </p>
                <ObservationWindow window={group.window} />
                {group.contributions.map(
                  ({ accountId, seriesKey, estimate }) => (
                    <p key={`${accountId}:${seriesKey}`} className="py-1">
                      {name(accountId)} ·{" "}
                      {formatAssetAmount(estimate.amount, i18n.language)} ·{" "}
                      {formatBalanceSource(estimate.source, t)} ·{" "}
                      {estimate.scope.authority}
                      {[
                        estimate.scope.projects,
                        estimate.scope.keys,
                        estimate.scope.models,
                        estimate.scope.groups,
                      ].some(
                        (scope) =>
                          scope.kind === SCOPE_SELECTION_KINDS.Restricted,
                      )
                        ? ` · ${t("account:financial.restricted")}`
                        : ""}
                    </p>
                  ),
                )}
              </div>
            ))}
            {summary.excluded.map((item) => (
              <p
                key={`${item.accountId}:${item.seriesKey ?? "account"}`}
                className="py-1"
              >
                {name(item.accountId)} ·{" "}
                {item.position &&
                  `${getNetInflowAssetLabel(item.position.asset)} · `}
                {getNetInflowReasonLabel(item.reason, t)}
                {item.position && (
                  <>
                    {" "}
                    · {formatBalanceSource(
                      item.position.amount.source,
                      t,
                    )} · {item.position.scope.authority}
                  </>
                )}
              </p>
            ))}
            {summary.potentialDuplicateCount > 0 && (
              <p>
                {t("account:financial.potentialDuplicates", {
                  count: summary.potentialDuplicateCount,
                })}
              </p>
            )}
          </details>
        </>
      )}
    </section>
  )
}
