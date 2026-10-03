import { useTranslation } from "react-i18next"

import AccountLinkButton from "~/components/AccountLinkButton"
import { TableCell, TableRow } from "~/components/ui"
import { Z_INDEX } from "~/constants/designTokens"
import {
  AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS,
  getAutoCheckinResultMessage,
  resolveAutoCheckinTroubleshootingHintKey,
  type AutoCheckinTroubleshootingHintKey,
} from "~/features/AutoCheckin/utils/autoCheckin"
import { ProtectionBypassHistoryLink } from "~/features/ProtectionBypass/components/ProtectionBypassHistoryLink"
import { cn } from "~/lib/utils"
import type { SiteTypeMismatch } from "~/services/siteDetection/siteTypeMismatch"
import type { CurrencyType } from "~/types"
import { type CheckinAccountResult } from "~/types/autoCheckin"
import { getCurrencySymbol } from "~/utils/core/formatters"
import {
  convertQuotaToCurrencyAmounts,
  formatMoneyFixed,
} from "~/utils/core/money"
import { openProtectionBypassHistory } from "~/utils/navigation"

import { formatTimestamp } from "../utils/tableUtils"
import type { ResultsTableActionsProps } from "./ResultsTable.types"
import ResultsTableRowActions from "./ResultsTableRowActions"
import ResultStatusBadge from "./ResultStatusBadge"

interface ResultsTableRowProps extends ResultsTableActionsProps {
  result: CheckinAccountResult
  siteTypeMismatch?: SiteTypeMismatch
  /** Currency the reward line is shown in. */
  currencyType?: CurrencyType
  /**
   * Each account's USD-to-CNY rate, keyed by account id. Only accounts that can
   * convert are shown an amount: a deleted account has no rate to convert with,
   * and guessing one would misstate the award.
   */
  exchangeRateByAccountId?: Record<string, number>
}

/** Renders one execution result while keeping table orchestration in the parent. */
export default function ResultsTableRow({
  result,
  siteTypeMismatch,
  currencyType = "USD",
  exchangeRateByAccountId = {},
  ...actionProps
}: ResultsTableRowProps) {
  const { t } = useTranslation(["autoCheckin", "account"])
  const message = getAutoCheckinResultMessage(t, result)
  const exchangeRate = exchangeRateByAccountId[result.accountId]
  // Only a hint from the site itself is shown; a method without an
  // authoritative amount renders nothing rather than a zero.
  const rewardAmount =
    result.reward &&
    Number.isFinite(result.reward.quota) &&
    result.reward.quota > 0 &&
    typeof exchangeRate === "number" &&
    Number.isFinite(exchangeRate) &&
    exchangeRate > 0
      ? convertQuotaToCurrencyAmounts(result.reward.quota, exchangeRate)[
          currencyType
        ]
      : undefined
  const rewardText =
    rewardAmount !== undefined &&
    Number.isFinite(rewardAmount) &&
    rewardAmount > 0
      ? `+${getCurrencySymbol(currencyType)}${formatMoneyFixed(rewardAmount)}`
      : null
  const troubleshootingHintKey = resolveAutoCheckinTroubleshootingHintKey({
    status: result.status,
    reasonCode: result.reasonCode,
    messageKey: result.messageKey,
    message,
  })

  const getTroubleshootingHintLabel = (
    hintKey: AutoCheckinTroubleshootingHintKey,
  ) => {
    // Keys stay literal at the t() call: the i18n extractor only sees literal
    // arguments, so a hint translated through its constant alone would be pruned.
    switch (hintKey) {
      case AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS.invalidAccessToken:
        return t("execution.hints.invalidAccessToken")
      case AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS.manualVerificationRequired:
        return t("execution.hints.manualVerificationRequired")
      case AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS.noTabWithId:
        return t("execution.hints.noTabWithId")
      case AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS.siteTypeCheckinUnsupported:
        // A named type replaces the generic advice to go and check it.
        return siteTypeMismatch
          ? t("execution.hints.siteTypeMismatch", {
              storedType: siteTypeMismatch.storedSiteType,
              suggestedType: siteTypeMismatch.suggestedSiteType,
            })
          : t("execution.hints.siteTypeCheckinUnsupported")
    }
  }

  return (
    <TableRow className="group border-border hover:bg-surface-subtle dark:hover:bg-card">
      <TableCell className="text-foreground py-density-3 w-40 max-w-40 min-w-40 px-4 text-sm font-medium [@container(min-width:48rem)]:w-56 [@container(min-width:48rem)]:max-w-56 [@container(min-width:48rem)]:min-w-56 [@container(min-width:48rem)]:px-6">
        <AccountLinkButton
          accountId={result.accountId}
          accountName={result.accountName}
          className="w-full max-w-full min-w-0 shrink justify-start overflow-hidden px-0 text-left"
        />
      </TableCell>
      <TableCell className="py-density-3 px-4 text-sm whitespace-nowrap [@container(min-width:48rem)]:px-6">
        <ResultStatusBadge status={result.status} />
      </TableCell>
      <TableCell className="text-muted-foreground py-density-3 max-w-lg min-w-64 px-6 text-sm break-words">
        <div className="space-y-density-1">
          {/* The amount trails the message as its own node: the search and the
              status filter read the message string alone. */}
          <div className="gap-density-1 flex flex-wrap items-baseline">
            <span>{message}</span>
            {rewardText && (
              <>
                <span aria-hidden="true">·</span>
                <span
                  className="text-success-text font-medium"
                  title={t("execution.reward.title")}
                >
                  {rewardText}
                </span>
              </>
            )}
          </div>
          {troubleshootingHintKey && (
            <div className="text-faint-foreground text-xs">
              {getTroubleshootingHintLabel(troubleshootingHintKey)}
            </div>
          )}
          {(troubleshootingHintKey ===
            AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS.manualVerificationRequired ||
            troubleshootingHintKey ===
              AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS.noTabWithId) && (
            <ProtectionBypassHistoryLink
              className="text-xs"
              onOpen={openProtectionBypassHistory}
            />
          )}
        </div>
      </TableCell>
      <TableCell className="text-muted-foreground py-density-3 px-6 text-sm whitespace-nowrap">
        {formatTimestamp(result.timestamp)}
      </TableCell>
      <TableCell
        className={cn(
          "border-border bg-card text-muted-foreground group-hover:bg-surface-subtle dark:bg-background dark:group-hover:bg-card py-density-3 sticky right-0 w-12 min-w-12 border-l px-2 text-sm [@container(min-width:48rem)]:w-auto [@container(min-width:48rem)]:min-w-0 [@container(min-width:48rem)]:px-3",
          Z_INDEX.tableStickyCell,
        )}
      >
        <ResultsTableRowActions result={result} {...actionProps} />
      </TableCell>
    </TableRow>
  )
}
