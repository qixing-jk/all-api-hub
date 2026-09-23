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
import { type CheckinAccountResult } from "~/types/autoCheckin"
import { openProtectionBypassHistory } from "~/utils/navigation"

import { formatTimestamp } from "../utils/tableUtils"
import type { ResultsTableActionsProps } from "./ResultsTable.types"
import ResultsTableRowActions from "./ResultsTableRowActions"
import ResultStatusBadge from "./ResultStatusBadge"

interface ResultsTableRowProps extends ResultsTableActionsProps {
  result: CheckinAccountResult
  siteTypeMismatch?: SiteTypeMismatch
}

/** Renders one execution result while keeping table orchestration in the parent. */
export default function ResultsTableRow({
  result,
  siteTypeMismatch,
  ...actionProps
}: ResultsTableRowProps) {
  const { t } = useTranslation(["autoCheckin", "account"])
  const message = getAutoCheckinResultMessage(t, result)
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
          <div>{message}</div>
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
