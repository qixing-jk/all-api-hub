import { useTranslation } from "react-i18next"

import { CURRENCIES, QUOTA_PER_USD } from "~/constants/money"
import { FinancialObservationDetails } from "~/features/AccountManagement/components/FinancialObservationDetails"
import { formatTimestamp } from "~/features/AutoCheckin/table/tableUtils"
import { isKnownOrStaleObservation } from "~/services/amounts/balance"
import type { Amount } from "~/services/amounts/balance"
import { normalizeDecimalUnits } from "~/services/amounts/decimal"
import {
  ASSET_KINDS,
  AWARD_FULFILLMENT,
  AWARD_TARGETS,
  BALANCE_VALIDITY_KINDS,
  EVIDENCE_KINDS,
  OBSERVATION_STATUSES,
} from "~/services/amounts/financialConstants"
import { readCheckinAwards } from "~/services/checkin/autoCheckin/awards"
import type { CurrencyType } from "~/types"
import type { CheckinAccountResult } from "~/types/autoCheckin"
import {
  formatBalanceScope,
  formatBalanceSource,
} from "~/utils/core/balancePresentation"
import {
  formatAssetAmount,
  formatBalanceAmount,
  getAssetLabel,
} from "~/utils/core/money"

/** Execution certainty and confirmed grants are independent facts. */
export default function CheckinAwards({
  result,
  currencyType,
  exchangeRate,
}: {
  result: CheckinAccountResult
  currencyType?: CurrencyType
  exchangeRate?: number
}) {
  const { t, i18n } = useTranslation("autoCheckin")
  const awards = readCheckinAwards(result)
  if (!awards.length) return null
  const fulfillmentLabels = {
    [AWARD_FULFILLMENT.Credited]: t("execution.awards.credited"),
    [AWARD_FULFILLMENT.PendingRedemption]: t(
      "execution.awards.pendingRedemption",
    ),
    [AWARD_FULFILLMENT.Redeemed]: t("execution.awards.redeemed"),
    [AWARD_FULFILLMENT.Unknown]: t("execution.awards.fulfillmentUnknown"),
  }
  const targetLabels = {
    [AWARD_TARGETS.Wallet]: t("execution.awards.wallet"),
    [AWARD_TARGETS.Entitlement]: t("execution.awards.entitlement"),
    [AWARD_TARGETS.Unknown]: t("execution.awards.targetUnknown"),
  }
  const rateAvailable =
    exchangeRate !== undefined &&
    Number.isFinite(exchangeRate) &&
    exchangeRate > 0
  return (
    <ul aria-label={t("execution.awards.title")} className="space-y-2">
      {awards.map((award, index) => {
        const { asset, amount } = award
        const unit = getAssetLabel(asset, t("execution.awards.unknownAsset"))
        let value = t("execution.awards.amountUnknown", { asset: unit })
        if (isKnownOrStaleObservation(amount)) {
          const legacyValue =
            currencyType !== undefined &&
            award.id === "legacy-reward" &&
            rateAvailable
              ? normalizeDecimalUnits(result.reward?.quota, QUOTA_PER_USD)
              : undefined
          const displayAmount: Amount | undefined =
            legacyValue !== undefined
              ? {
                  asset: { kind: ASSET_KINDS.Currency, code: CURRENCIES.USD },
                  value: legacyValue,
                }
              : asset.kind === ASSET_KINDS.Unknown
                ? undefined
                : { asset, value: amount.value }
          if (!displayAmount) value = `${amount.value} ${unit}`
          else if (
            legacyValue !== undefined ||
            (currencyType !== undefined && rateAvailable)
          )
            value = `+${formatBalanceAmount(displayAmount, i18n.language, currencyType, exchangeRate)}`
          else value = `+${formatAssetAmount(displayAmount, i18n.language)}`
        }
        return (
          <li key={`${award.id}-${index}`}>
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="font-medium text-foreground tabular-nums">
                {value}
              </span>
              <span className="text-xs text-muted-foreground">
                {fulfillmentLabels[award.fulfillment]}
              </span>
              {amount.status === OBSERVATION_STATUSES.Stale && (
                <span className="text-xs text-muted-foreground">
                  {t("account:financial.lastKnown")}
                </span>
              )}
              {amount.source.kind === EVIDENCE_KINDS.Legacy && (
                <span className="text-xs text-muted-foreground">
                  {t("account:financial.olderRecord")}
                </span>
              )}
            </div>
            <details className="mt-1 text-xs text-muted-foreground">
              <summary className="w-fit cursor-pointer underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                {t("execution.awards.details")}
              </summary>
              <div className="mt-2 space-y-1 break-words">
                {isKnownOrStaleObservation(amount) && (
                  <p className="text-foreground tabular-nums">
                    {amount.value} {unit}
                  </p>
                )}
                <p>{targetLabels[award.target]}</p>
                {(amount.source.kind === EVIDENCE_KINDS.Reported ||
                  amount.source.kind === EVIDENCE_KINDS.Derived) && (
                  <p>{formatBalanceSource(amount.source, t)}</p>
                )}
                {isKnownOrStaleObservation(amount) && (
                  <p>
                    {t("execution.awards.observedAt", {
                      date: formatTimestamp(amount.observedAt),
                    })}
                  </p>
                )}
                {formatBalanceScope(award.scope, t).map((line) => (
                  <p key={line}>{line}</p>
                ))}
                {award.validity.kind === BALANCE_VALIDITY_KINDS.Expires && (
                  <p>
                    {t("account:financial.expires", {
                      date: formatTimestamp(award.validity.at),
                    })}
                  </p>
                )}
                {award.validity.kind === BALANCE_VALIDITY_KINDS.NoExpiry && (
                  <p>{t("execution.awards.noExpiry")}</p>
                )}
                <FinancialObservationDetails>
                  <p>{formatBalanceSource(amount.source, t, true)}</p>
                  <p>
                    {award.scope.authority} ·{" "}
                    {award.scope.organizationId ?? "—"} ·{" "}
                    {award.scope.walletId ?? "—"}
                  </p>
                  {formatBalanceScope(award.scope, t, true).map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                  {award.validity.kind === BALANCE_VALIDITY_KINDS.Unknown && (
                    <p>{t("account:financial.validityUnknown")}</p>
                  )}
                  {award.exchangedFrom && (
                    <p>
                      {t("execution.awards.exchangedFrom", {
                        event: `${award.exchangedFrom.namespace}/${award.exchangedFrom.id}`,
                      })}
                    </p>
                  )}
                </FinancialObservationDetails>
              </div>
            </details>
          </li>
        )
      })}
    </ul>
  )
}
