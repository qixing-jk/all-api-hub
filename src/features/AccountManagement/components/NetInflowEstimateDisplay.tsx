import { useTranslation } from "react-i18next"

import { FINANCIAL_METRIC_KINDS } from "~/components/financialMetricKinds"
import { FinancialMetricLabel } from "~/components/FinancialMetricLabel"
import Tooltip from "~/components/Tooltip"
import { Button } from "~/components/ui"
import { SCOPE_SELECTION_KINDS } from "~/services/amounts/financialConstants"
import { NET_INFLOW_STATUSES } from "~/services/history/dailyBalanceHistory/netInflow"
import type { DisplaySiteData } from "~/types"
import {
  formatBalanceSource,
  formatBalanceWindow,
  getBalanceRoleLabel,
} from "~/utils/core/balancePresentation"
import { formatAssetAmount } from "~/utils/core/money"
import {
  getNetInflowAssetLabel,
  getNetInflowReasonLabel,
} from "~/utils/core/netInflowPresentation"

/** Each ledger keeps its native asset and evidence; one refresh updates the account. */
export function NetInflowEstimateDisplay({
  estimate,
  onRefresh,
  disabled,
  loading,
}: {
  estimate: DisplaySiteData["netInflowEstimate"]
  onRefresh?: () => void
  disabled?: boolean
  loading?: boolean
}) {
  const { t, i18n } = useTranslation(["account", "keyManagement"])
  const label = t("stats.estimatedNetInflow")
  const items = (estimate?.estimates ?? []).map((item) => {
    const result = item.netInflow
    const available =
      result?.status === NET_INFLOW_STATUSES.Available ? result : undefined
    return {
      ...item,
      available,
      walletLabel: item.position.label || getBalanceRoleLabel(item.position, t),
      value: available
        ? formatAssetAmount(available.amount, i18n.language)
        : [
            getNetInflowAssetLabel(item.position.asset),
            t("financial.unavailable"),
          ]
            .filter(Boolean)
            .join(" · "),
      reason: available
        ? available.partial
          ? t("keyManagement:financial.partial")
          : undefined
        : getNetInflowReasonLabel(
            result?.status === NET_INFLOW_STATUSES.Unavailable
              ? result.reason
              : item.status,
            t,
          ),
    }
  })
  const fallbackReason = items.length
    ? undefined
    : getNetInflowReasonLabel(estimate?.status, t)
  const description = items.length
    ? items
        .map(
          (item) =>
            `${item.walletLabel} · ${item.value}${item.reason ? `. ${item.reason}` : ""}`,
        )
        .join(". ")
    : `${t("financial.unavailable")}. ${fallbackReason}`
  const content = (
    <>
      <FinancialMetricLabel
        kind={FINANCIAL_METRIC_KINDS.Change}
        className="text-3xs font-normal"
        iconClassName="size-3"
      >
        {label}
      </FinancialMetricLabel>
      {items.length ? (
        items.map((item) => (
          <span className="block" key={item.seriesKey}>
            <span>{item.walletLabel} · </span>
            {item.value}
          </span>
        ))
      ) : (
        <span className="block">{t("financial.unavailable")}</span>
      )}
    </>
  )
  return (
    <Tooltip
      content={
        <div className="space-y-1">
          <p>{t("netInflow.explanation")}</p>
          {fallbackReason && <p>{fallbackReason}</p>}
          {items.map((item) => (
            <div key={item.seriesKey} className="space-y-1">
              <p>
                {item.walletLabel} · {item.value}
              </p>
              {item.reason && <p>{item.reason}</p>}
              {item.available &&
                formatBalanceWindow(
                  item.available.window,
                  t,
                  i18n.language,
                ).map((line) => <p key={line}>{line}</p>)}
              <p>
                {formatBalanceSource(
                  item.available?.source ?? item.position.amount.source,
                  t,
                )}
              </p>
              <p>{item.position.scope.authority}</p>
              {[
                item.position.scope.projects,
                item.position.scope.keys,
                item.position.scope.models,
                item.position.scope.groups,
              ].some(
                (scope) => scope.kind === SCOPE_SELECTION_KINDS.Restricted,
              ) && <p>{t("financial.restricted")}</p>}
            </div>
          ))}
        </div>
      }
      wrapperClassName="min-w-0 max-w-full"
    >
      {onRefresh ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-auto max-w-full flex-col items-end px-0 py-0 text-xs whitespace-normal text-muted-foreground"
          aria-label={`${label}. ${description}`}
          onClick={onRefresh}
          disabled={disabled}
          loading={loading}
        >
          {content}
        </Button>
      ) : (
        <div
          className="max-w-full text-right text-xs text-muted-foreground"
          tabIndex={0}
          aria-label={`${label}. ${description}`}
        >
          {content}
        </div>
      )}
    </Tooltip>
  )
}
