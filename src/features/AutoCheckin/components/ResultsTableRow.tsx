import { useTranslation } from "react-i18next"

import AccountLinkButton from "~/components/AccountLinkButton"
import { TableCell, TableRow } from "~/components/ui"
import { Z_INDEX } from "~/constants/designTokens"
import {
  getAutoCheckinResultMessage,
  resolveAutoCheckinTroubleshootingHintKey,
} from "~/features/AutoCheckin/utils/autoCheckin"
import { ProtectionBypassHistoryLink } from "~/features/ProtectionBypass/components/ProtectionBypassHistoryLink"
import { cn } from "~/lib/utils"
import { type CheckinAccountResult } from "~/types/autoCheckin"
import { openProtectionBypassHistory } from "~/utils/navigation"

import { formatTimestamp } from "../utils/tableUtils"
import type { ResultsTableActionsProps } from "./ResultsTable.types"
import ResultsTableRowActions from "./ResultsTableRowActions"
import ResultStatusBadge from "./ResultStatusBadge"

interface ResultsTableRowProps extends ResultsTableActionsProps {
  result: CheckinAccountResult
}

/** Renders one execution result while keeping table orchestration in the parent. */
export default function ResultsTableRow({
  result,
  ...actionProps
}: ResultsTableRowProps) {
  const { t } = useTranslation(["autoCheckin", "account"])
  const message = getAutoCheckinResultMessage(t, result)
  const troubleshootingHintKey = resolveAutoCheckinTroubleshootingHintKey({
    status: result.status,
    messageKey: result.messageKey,
    message,
  })

  const getTroubleshootingHintLabel = (hintKey: string) => {
    switch (hintKey) {
      case "execution.hints.invalidAccessToken":
        return t("execution.hints.invalidAccessToken")
      case "execution.hints.manualVerificationRequired":
        return t("execution.hints.manualVerificationRequired")
      case "execution.hints.noTabWithId":
        return t("execution.hints.noTabWithId")
      case "execution.hints.siteTypeCheckinUnsupported":
        return t("execution.hints.siteTypeCheckinUnsupported")
      default:
        return hintKey
    }
  }

  return (
    <TableRow className="group border-gray-200 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800">
      <TableCell className="w-40 max-w-40 min-w-40 px-4 py-3 text-sm font-medium text-gray-900 dark:text-gray-100 [@container(min-width:48rem)]:w-56 [@container(min-width:48rem)]:max-w-56 [@container(min-width:48rem)]:min-w-56 [@container(min-width:48rem)]:px-6">
        <AccountLinkButton
          accountId={result.accountId}
          accountName={result.accountName}
          className="w-full max-w-full min-w-0 shrink justify-start overflow-hidden px-0 text-left"
        />
      </TableCell>
      <TableCell className="px-4 py-3 text-sm whitespace-nowrap [@container(min-width:48rem)]:px-6">
        <ResultStatusBadge status={result.status} />
      </TableCell>
      <TableCell className="max-w-lg min-w-64 px-6 py-3 text-sm break-words text-gray-500 dark:text-gray-400">
        <div className="space-y-1">
          <div>{message}</div>
          {troubleshootingHintKey && (
            <div className="text-xs text-gray-400 dark:text-gray-500">
              {getTroubleshootingHintLabel(troubleshootingHintKey)}
            </div>
          )}
          {(troubleshootingHintKey ===
            "execution.hints.manualVerificationRequired" ||
            troubleshootingHintKey === "execution.hints.noTabWithId") && (
            <ProtectionBypassHistoryLink
              className="text-xs"
              onOpen={openProtectionBypassHistory}
            />
          )}
        </div>
      </TableCell>
      <TableCell className="px-6 py-3 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
        {formatTimestamp(result.timestamp)}
      </TableCell>
      <TableCell
        className={cn(
          "sticky right-0 w-12 min-w-12 border-l border-gray-200 bg-white px-2 py-3 text-sm text-gray-500 group-hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:group-hover:bg-gray-800 [@container(min-width:48rem)]:w-auto [@container(min-width:48rem)]:min-w-0 [@container(min-width:48rem)]:px-3",
          Z_INDEX.tableStickyCell,
        )}
      >
        <ResultsTableRowActions result={result} {...actionProps} />
      </TableCell>
    </TableRow>
  )
}
