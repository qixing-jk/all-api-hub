import { useTranslation } from "react-i18next"

import AccountLinkButton from "~/components/AccountLinkButton"
import { TableCell, TableRow } from "~/components/ui"
import { Z_INDEX } from "~/constants/designTokens"
import { AccountCredentialRecoveryGuidance } from "~/features/AccountManagement/credentialRecovery/AccountCredentialRecoveryGuidance"
import CheckinAwards from "~/features/AutoCheckin/results/CheckinAwards"
import type { ResultsTableActionsProps } from "~/features/AutoCheckin/results/ResultsTable.types"
import ResultsTableRowActions from "~/features/AutoCheckin/results/ResultsTableRowActions"
import ResultStatusBadge from "~/features/AutoCheckin/results/ResultStatusBadge"
import { formatTimestamp } from "~/features/AutoCheckin/table/tableUtils"
import {
  AUTO_CHECKIN_TROUBLESHOOTING_HINT_KEYS,
  getAutoCheckinResultMessage,
  resolveAutoCheckinTroubleshootingHintKey,
  type AutoCheckinTroubleshootingHintKey,
} from "~/features/AutoCheckin/utils/autoCheckin"
import { ProtectionBypassHistoryLink } from "~/features/ProtectionBypass/components/ProtectionBypassHistoryLink"
import { cn } from "~/lib/utils"
import { resolveSelectedCheckInMethod } from "~/services/checkin/autoCheckin/discovery/inspection"
import type { SiteTypeMismatch } from "~/services/siteDetection/siteTypeMismatch"
import type { CurrencyType, DisplaySiteData } from "~/types"
import {
  AUTO_CHECKIN_SKIP_REASON,
  CHECKIN_RESULT_STATUS,
  type CheckinAccountResult,
} from "~/types/autoCheckin"
import { openProtectionBypassHistory } from "~/utils/navigation"

interface ResultsTableRowProps extends ResultsTableActionsProps {
  result: CheckinAccountResult
  account?: DisplaySiteData
  exchangeRate?: number
  currencyType?: CurrencyType
  siteTypeMismatch?: SiteTypeMismatch
}

/** Renders one execution result while keeping table orchestration in the parent. */
export default function ResultsTableRow({
  result,
  account,
  exchangeRate,
  currencyType,
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
      <TableCell className="w-40 max-w-40 min-w-40 px-4 py-density-3 text-sm font-medium text-foreground [@container(min-width:48rem)]:w-56 [@container(min-width:48rem)]:max-w-56 [@container(min-width:48rem)]:min-w-56 [@container(min-width:48rem)]:px-6">
        <AccountLinkButton
          accountId={result.accountId}
          accountName={result.accountName}
          className="w-full max-w-full min-w-0 shrink justify-start overflow-hidden px-0 text-left"
        />
      </TableCell>
      <TableCell className="px-4 py-density-3 text-sm whitespace-nowrap [@container(min-width:48rem)]:px-6">
        <ResultStatusBadge status={result.status} />
      </TableCell>
      <TableCell className="max-w-lg min-w-64 px-6 py-density-3 text-sm break-words text-muted-foreground">
        <div className="space-y-density-1">
          <p>{message}</p>
          <CheckinAwards
            result={result}
            currencyType={currencyType}
            exchangeRate={exchangeRate}
          />

          {troubleshootingHintKey && (
            <div className="text-xs text-faint-foreground">
              {getTroubleshootingHintLabel(troubleshootingHintKey)}
            </div>
          )}
          {account &&
            (result.status === CHECKIN_RESULT_STATUS.FAILED ||
              result.status === CHECKIN_RESULT_STATUS.SKIPPED) &&
            (result.reasonCode ===
              AUTO_CHECKIN_SKIP_REASON.AUTHENTICATION_REQUIRED ||
              result.reasonCode ===
                AUTO_CHECKIN_SKIP_REASON.CREDENTIALS_MISSING ||
              result.reasonCode ===
                AUTO_CHECKIN_SKIP_REASON.LOGIN_PROVIDER_REQUIRED) && (
              <AccountCredentialRecoveryGuidance
                account={account}
                failure
                checkInMethodId={
                  resolveSelectedCheckInMethod({
                    config: account.checkIn,
                    siteType: account.siteType,
                    siteUrl: account.baseUrl,
                  }) ?? undefined
                }
              />
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
      <TableCell className="px-6 py-density-3 text-sm whitespace-nowrap text-muted-foreground">
        {formatTimestamp(result.timestamp)}
      </TableCell>
      <TableCell
        className={cn(
          "sticky right-0 w-12 min-w-12 border-l border-border bg-card px-2 py-density-3 text-sm text-muted-foreground group-hover:bg-surface-subtle dark:bg-background dark:group-hover:bg-card [@container(min-width:48rem)]:w-auto [@container(min-width:48rem)]:min-w-0 [@container(min-width:48rem)]:px-3",
          Z_INDEX.tableStickyCell,
        )}
      >
        <ResultsTableRowActions result={result} {...actionProps} />
      </TableCell>
    </TableRow>
  )
}
