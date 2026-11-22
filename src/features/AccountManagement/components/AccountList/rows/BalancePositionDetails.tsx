import { useTranslation } from "react-i18next"

import { cn } from "~/lib/utils"
import { isKnownOrStaleObservation } from "~/services/amounts/balance"
import type { BalancePosition } from "~/services/amounts/balance"
import {
  ASSET_KINDS,
  BALANCE_RELATIONS,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import {
  formatBalanceScope,
  formatBalanceSource,
  formatBalanceWindow,
  getBalanceObservationDescription,
  getBalanceQualifiers,
  getBalanceRoleLabel,
} from "~/utils/core/balancePresentation"
import { useDevUnlocked } from "~/utils/core/devMode"
import { formatAssetAmount } from "~/utils/core/money"

import { FinancialObservationDetails } from "../../FinancialObservationDetails"
import { FinancialObservationTime } from "../../FinancialObservationTime"

/** Emphasize balances over their components; keep classification in diagnostics. */
export function BalancePositionDetails({
  position: p,
  asOf = Date.now(),
}: {
  position: BalancePosition
  asOf?: number
}) {
  const { t, i18n } = useTranslation("account")
  const devUnlocked = useDevUnlocked()
  const component = p.relation === BALANCE_RELATIONS.Component
  const observationDescription = getBalanceObservationDescription(p, t)
  const qualifiers = getBalanceQualifiers(p, t, {
    includeClassification: false,
  })
  const expired =
    p.validity.kind === BALANCE_VALIDITY_KINDS.Expires && p.validity.at <= asOf
  const reset = p.window?.resetsAt !== undefined && p.window.resetsAt <= asOf
  const validityStatus = [
    expired ? t("balanceHistory:native.expired") : undefined,
    reset ? t("balanceHistory:native.reset") : undefined,
    reset || p.amount.status === OBSERVATION_STATUSES.Stale
      ? t("financial.lastKnown")
      : undefined,
  ].filter(Boolean)
  const amount =
    isKnownOrStaleObservation(p.amount) && p.asset.kind !== ASSET_KINDS.Unknown
      ? formatAssetAmount(
          { value: p.amount.value, asset: p.asset },
          i18n.language,
        )
      : t("financial.unavailable")
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_minmax(0,max-content)] items-baseline gap-x-3 gap-y-1",
        component ? "py-2 pl-5" : "border-border/50 py-3 not-first:border-t",
      )}
    >
      <dt
        className={cn(
          component ? "text-muted-foreground" : "text-sm font-medium",
        )}
      >
        {getBalanceRoleLabel(p, t)}
        {p.label && <span className="mt-1 block">{p.label}</span>}
      </dt>
      <dd className="max-w-52 min-w-0 text-right">
        <div
          className={cn(
            "leading-tight font-semibold tracking-tight break-words tabular-nums",
            component ? "text-sm" : "text-xl",
          )}
        >
          {amount}
        </div>
      </dd>
      {(validityStatus.length > 0 ||
        p.amount.status === OBSERVATION_STATUSES.Known ||
        p.amount.status === OBSERVATION_STATUSES.Stale) && (
        <dd className="col-span-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          {validityStatus.length > 0 && (
            <span className="text-warning-text">
              {validityStatus.join(" · ")}
            </span>
          )}
          {isKnownOrStaleObservation(p.amount) && (
            <span className="ml-auto">
              <FinancialObservationTime observedAt={p.amount.observedAt} />
            </span>
          )}
        </dd>
      )}
      {qualifiers.length > 0 && (
        <dd className="col-span-2 text-muted-foreground">
          {qualifiers.join(" · ")}
        </dd>
      )}
      {observationDescription && (
        <dd className="col-span-2 text-muted-foreground">
          {observationDescription}
        </dd>
      )}
      {formatBalanceScope(p.scope, t).map((line) => (
        <dd key={line} className="col-span-2 break-words">
          {line}
        </dd>
      ))}
      {formatBalanceWindow(p.window, t, i18n.language).map((line) => (
        <dd key={line} className="col-span-2 break-words">
          {line}
        </dd>
      ))}
      {p.validity.kind === BALANCE_VALIDITY_KINDS.Expires && (
        <dd className="col-span-2">
          {t("financial.expires", {
            date: new Date(p.validity.at).toLocaleString(i18n.language),
          })}
        </dd>
      )}
      {p.validity.kind === BALANCE_VALIDITY_KINDS.Unknown &&
        p.reportedTiming?.expiresAt && (
          <dd className="col-span-2">
            {t("financial.expires", {
              date: p.reportedTiming.expiresAt,
            })}{" "}
            · {t("financial.timingUnknown")}
          </dd>
        )}
      {p.reportedTiming?.startsAt && (
        <dd className="col-span-2">
          {t("financial.startsAt")}: {p.reportedTiming.startsAt}
        </dd>
      )}
      {p.reportedTiming?.resetsAt && (
        <dd className="col-span-2">
          {t("financial.resetsAt")}: {p.reportedTiming.resetsAt}
        </dd>
      )}
      {devUnlocked && (
        <dd className="col-span-2">
          <FinancialObservationDetails>
            <p>
              {getBalanceQualifiers(p, t, { includeUnknown: true }).join(" · ")}
            </p>
            {formatBalanceScope(p.scope, t, true).map((line) => (
              <p key={line}>{line}</p>
            ))}
            {p.validity.kind === BALANCE_VALIDITY_KINDS.Unknown && (
              <p>{t("financial.validityUnknown")}</p>
            )}
            <p>{formatBalanceSource(p.amount.source, t, true)}</p>
            {isKnownOrStaleObservation(p.amount) && (
              <p>
                {p.amount.status === OBSERVATION_STATUSES.Stale
                  ? t("financial.lastKnown")
                  : t("financial.observed")}{" "}
                · {new Date(p.amount.observedAt).toLocaleString(i18n.language)}
              </p>
            )}
          </FinancialObservationDetails>
        </dd>
      )}
      {p.amount.source.kind === EVIDENCE_KINDS.Legacy &&
        !observationDescription && (
          <dd className="col-span-2">{t("financial.legacy")}</dd>
        )}
      {p.amount.source.kind === EVIDENCE_KINDS.Manual && (
        <dd className="col-span-2">{t("financial.manual")}</dd>
      )}
    </div>
  )
}
