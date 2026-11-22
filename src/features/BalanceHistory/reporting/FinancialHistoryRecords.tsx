import { useTranslation } from "react-i18next"

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table"
import { FinancialObservationDetails } from "~/features/AccountManagement/components/FinancialObservationDetails"
import { subtractDecimal } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  BALANCE_ROLES,
  BALANCE_VALIDITY_KINDS,
  BUDGET_AMOUNT_FIELDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { NET_INFLOW_STATUSES } from "~/services/history/dailyBalanceHistory/netInflow"
import {
  FINANCIAL_HISTORY_LIFECYCLE_STATUSES,
  type FinancialHistoryObservation,
  type FinancialHistorySeries,
} from "~/services/history/dailyBalanceHistory/selectors"
import {
  formatBalanceScope,
  formatBalanceSource,
  formatBalanceWindow,
} from "~/utils/core/balancePresentation"
import {
  formatBudgetAmount,
  formatBudgetConstraint,
} from "~/utils/core/budgetPresentation"

import { getFinancialHistoryPresentation } from "./financialHistoryPresentation"

const lifecycleStatuses: ReadonlySet<string> = new Set(
  Object.values(FINANCIAL_HISTORY_LIFECYCLE_STATUSES),
)

/** Dated values and lifecycle details for one balance or allowance. */
export function FinancialHistoryRecords({
  item,
  title,
  showNetInflow,
}: {
  item: FinancialHistorySeries
  title: string
  showNetInflow: boolean
}) {
  const { t, i18n } = useTranslation("balanceHistory")
  const { position } = item
  const { asset } = position
  const { statusLabel, displayAmount } = getFinancialHistoryPresentation(
    [item],
    t,
    i18n.language,
  )
  const observations = [...item.observations].reverse()
  const first = item.observations[0]
  const latest = observations[0]
  const showCurrentConstraint =
    item.allowance && !lifecycleStatuses.has(latest?.status ?? "")
  const recordAmount = (observation: FinancialHistoryObservation) =>
    observation.allowance
      ? formatBudgetAmount(
          observation.allowance.constraint,
          BUDGET_AMOUNT_FIELDS.Remaining,
          t,
        )
      : observation.value === null
        ? "—"
        : displayAmount(asset, observation.value)
  let rangeChange: string | undefined
  if (
    first &&
    latest &&
    first !== latest &&
    first.status === OBSERVATION_STATUSES.Known &&
    latest.status === OBSERVATION_STATUSES.Known &&
    first.value !== null &&
    latest.value !== null &&
    asset.kind !== ASSET_KINDS.Unknown &&
    !observations.some(({ status }) => lifecycleStatuses.has(status))
  ) {
    try {
      rangeChange = displayAmount(
        asset,
        subtractDecimal(latest.value, first.value),
      )
    } catch {
      // The observations are still useful when their difference cannot be represented.
    }
  }
  const endpoints = [
    ...(first && first !== latest
      ? [{ label: t("native.firstRecord"), record: first }]
      : []),
    ...(latest ? [{ label: t("native.latest"), record: latest }] : []),
  ]
  const showSeriesNetInflow =
    showNetInflow &&
    (position.role === BALANCE_ROLES.Ledger ||
      item.observations.some(
        ({ netInflow }) => netInflow?.status === NET_INFLOW_STATUSES.Available,
      )) &&
    asset.kind !== ASSET_KINDS.Unknown
  return (
    <div className="min-w-0 space-y-3">
      {endpoints.length > 0 && (
        <dl className="flex flex-wrap gap-x-6 gap-y-2 rounded-md bg-muted/30 px-3 py-2">
          {endpoints.map(({ label, record }) => (
            <div key={label}>
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">
                {recordAmount(record)}
              </dd>
              <dd className="text-xs text-muted-foreground">
                {new Date(record.at).toLocaleString(i18n.language)}
              </dd>
              {record.status !== OBSERVATION_STATUSES.Known && (
                <dd className="text-xs text-muted-foreground">
                  {statusLabel(record.status)}
                </dd>
              )}
            </div>
          ))}
          {rangeChange && (
            <div>
              <dt className="text-xs text-muted-foreground">
                {t("metrics.net")}
              </dt>
              <dd className="font-medium tabular-nums">{rangeChange}</dd>
            </div>
          )}
        </dl>
      )}
      <div className="rounded-md bg-muted/20 [&_[data-slot=table-container]]:max-h-80 [&_td]:px-2 [&_th]:px-2 [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-10 [&_thead]:bg-muted">
        <Table aria-label={title} className="text-xs">
          <TableHeader>
            <TableRow>
              <TableHead className="whitespace-nowrap">
                {t("native.time")}
              </TableHead>
              <TableHead className="text-right whitespace-nowrap">
                {item.allowance || position.role === BALANCE_ROLES.Allowance
                  ? t("keyManagement:financial.remaining")
                  : t("metrics.balance")}
              </TableHead>
              <TableHead className="text-right whitespace-nowrap">
                {t("native.status")}
              </TableHead>
              {showSeriesNetInflow && (
                <TableHead className="text-right [overflow-wrap:normal]">
                  {t("native.netInflow")}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {observations.map((observation, index) => (
              <TableRow key={`${observation.at}-${index}`}>
                <TableCell className="text-xs [overflow-wrap:normal]">
                  {new Date(observation.at).toLocaleString(i18n.language)}
                  {observation.observedAt !== undefined &&
                    observation.observedAt !== observation.at && (
                      <span className="block text-muted-foreground">
                        {t("native.originalObservation", {
                          date: new Date(observation.observedAt).toLocaleString(
                            i18n.language,
                          ),
                        })}
                      </span>
                    )}
                </TableCell>
                <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">
                  {recordAmount(observation)}
                </TableCell>
                <TableCell className="text-right text-xs whitespace-nowrap text-muted-foreground">
                  {statusLabel(observation.status)}
                </TableCell>
                {showSeriesNetInflow && (
                  <TableCell className="text-right">
                    {observation.netInflow?.status ===
                    NET_INFLOW_STATUSES.Available ? (
                      <>
                        <span className="tabular-nums">
                          {displayAmount(
                            asset,
                            observation.netInflow.amount.value,
                          )}
                        </span>
                        <span className="block text-xs text-muted-foreground">
                          {observation.netInflow.partial && (
                            <>{t("keyManagement:financial.partial")} · </>
                          )}
                          {formatBalanceWindow(
                            observation.netInflow.window,
                            t,
                            i18n.language,
                          ).join(" · ")}
                        </span>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {showSeriesNetInflow && (
        <p className="text-xs text-muted-foreground">
          {t("native.netInflowHint")}
        </p>
      )}
      {showCurrentConstraint && item.allowance && (
        <p className="text-xs text-muted-foreground">
          {formatBudgetConstraint(item.allowance.constraint, t, false)}
        </p>
      )}
      {item.allowance?.validity.kind === BALANCE_VALIDITY_KINDS.Expires && (
        <p className="text-xs text-muted-foreground">
          {t("account:financial.expires", {
            date: new Date(item.allowance.validity.at).toLocaleString(
              i18n.language,
            ),
          })}
        </p>
      )}
      {formatBalanceScope(position.scope, t).map((line) => (
        <p key={line} className="text-xs text-muted-foreground">
          {line}
        </p>
      ))}
      {formatBalanceWindow(position.window, t, i18n.language).map((line) => (
        <p key={line} className="text-xs text-muted-foreground">
          {line}
        </p>
      ))}
      <FinancialObservationDetails>
        {showCurrentConstraint && item.allowance && (
          <p>{formatBudgetConstraint(item.allowance.constraint, t)}</p>
        )}
        {item.allowance?.validity.kind === BALANCE_VALIDITY_KINDS.Unknown && (
          <p>{t("account:financial.validityUnknown")}</p>
        )}
        <p>{formatBalanceSource(position.amount.source, t, true)}</p>
        <p>
          {t("native.scope")}: {position.scope.authority} ·{" "}
          {position.scope.organizationId ?? "—"} ·{" "}
          {position.scope.walletId ?? "—"}
        </p>
        {formatBalanceScope(position.scope, t, true).map((line) => (
          <p key={line}>{line}</p>
        ))}
      </FinancialObservationDetails>
    </div>
  )
}
