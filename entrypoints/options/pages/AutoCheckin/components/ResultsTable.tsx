import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import AccountLinkButton from "~/components/AccountLinkButton"
import { Button, Card } from "~/components/ui"
import {
  formatTimestamp,
  isInvalidAccessTokenMessage,
  isNoTabWithIdMessage,
} from "~/entrypoints/options/pages/AutoCheckin/utils/tableUtils"
import {
  CHECKIN_RESULT_STATUS,
  CheckinAccountResult,
} from "~/types/autoCheckin"
import { stripAutoCheckinMessageKeyPrefix } from "~/utils/autoCheckin"

interface ResultsTableProps {
  results: CheckinAccountResult[]
  showDevActions?: boolean
  retryingAccountId?: string | null
  openingManualAccountId?: string | null
  onRetryAccount?: (accountId: string) => void | Promise<void>
  onOpenManualSignIn?: (accountId: string) => void | Promise<void>
}

/**
 * Renders auto-checkin execution results with status badges, timestamps, and action buttons.
 * @param props Component props container.
 * @param props.results List of account execution results to render.
 * @param props.retryingAccountId Account currently retrying, used to show loading state.
 * @param props.openingManualAccountId Account opening manual sign-in, for button state.
 * @param props.onRetryAccount Callback invoked when retry button clicked.
 * @param props.onOpenManualSignIn Callback invoked when manual sign-in button clicked.
 */
export default function ResultsTable({
  results,
  showDevActions,
  retryingAccountId,
  openingManualAccountId,
  onRetryAccount,
  onOpenManualSignIn,
}: ResultsTableProps) {
  const { t } = useTranslation("autoCheckin")
  const forceShowActions = Boolean(showDevActions)

  const getResultMessage = (result: CheckinAccountResult): string => {
    if (result.rawMessage) return result.rawMessage
    if (result.messageKey) {
      return t(stripAutoCheckinMessageKeyPrefix(result.messageKey), {
        ...(result.messageParams ?? {}),
        defaultValue: result.messageKey,
      }) as string
    }
    return result.message ?? "-"
  }

  /**
   * Map certain failure messages to a concise, localized troubleshooting hint shown under the raw message.
   */
  const getTroubleshootingHintKey = (
    result: CheckinAccountResult,
  ): string | null => {
    if (result.status !== CHECKIN_RESULT_STATUS.FAILED) {
      return null
    }

    const message = getResultMessage(result)

    if (isInvalidAccessTokenMessage(message)) {
      return "execution.hints.invalidAccessToken"
    }

    if (isNoTabWithIdMessage(message)) {
      return "execution.hints.noTabWithId"
    }

    return null
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case CHECKIN_RESULT_STATUS.SUCCESS:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
            <CheckCircleIcon className="h-3 w-3" />
            {t("execution.status.success")}
          </span>
        )
      case CHECKIN_RESULT_STATUS.ALREADY_CHECKED:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            <CheckCircleIcon className="h-3 w-3" />
            {t("execution.status.alreadyChecked")}
          </span>
        )
      case CHECKIN_RESULT_STATUS.FAILED:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
            <XCircleIcon className="h-3 w-3" />
            {t("execution.status.failed")}
          </span>
        )
      case CHECKIN_RESULT_STATUS.SKIPPED:
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800 dark:bg-yellow-900 dark:text-yellow-100">
            <ExclamationTriangleIcon className="h-3 w-3" />
            {t("execution.status.skipped")}
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200">
            {status}
          </span>
        )
    }
  }

  return (
    <Card padding="none">
      {forceShowActions && (
        <div className="border-b border-yellow-200 bg-yellow-50 px-6 py-2 text-xs text-yellow-900 dark:border-yellow-900/50 dark:bg-yellow-950/30 dark:text-yellow-200">
          {t("execution.actions.devModeHint")}
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-800">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t("execution.table.accountName")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t("execution.table.status")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t("execution.table.message")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t("execution.table.time")}
              </th>
              <th className="sticky right-0 z-20 border-l border-gray-200 bg-gray-50 px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
                {t("execution.table.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
            {results.map((result) => {
              const troubleshootingHintKey = getTroubleshootingHintKey(result)

              return (
                <tr
                  key={result.accountId}
                  className="group hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  <td className="px-6 py-4 text-sm font-medium whitespace-nowrap text-gray-900 dark:text-gray-100">
                    <AccountLinkButton
                      accountId={result.accountId}
                      accountName={result.accountName}
                    />
                  </td>
                  <td className="px-6 py-4 text-sm whitespace-nowrap">
                    {getStatusBadge(result.status)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                    <div className="space-y-1">
                      <div>{getResultMessage(result)}</div>
                      {troubleshootingHintKey && (
                        <div className="text-xs text-gray-400 dark:text-gray-500">
                          {t(troubleshootingHintKey)}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                    {formatTimestamp(result.timestamp)}
                  </td>
                  <td className="sticky right-0 z-10 border-l border-gray-200 bg-white px-6 py-4 text-sm text-gray-500 group-hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-400 dark:group-hover:bg-gray-800">
                    <div className="flex flex-wrap gap-2">
                      {onRetryAccount &&
                        (forceShowActions ||
                          result.status === CHECKIN_RESULT_STATUS.FAILED) && (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={retryingAccountId === result.accountId}
                            disabled={retryingAccountId === result.accountId}
                            onClick={() => onRetryAccount(result.accountId)}
                            leftIcon={<ArrowPathIcon className="h-3.5 w-3.5" />}
                          >
                            {t("execution.actions.retryAccount")}
                          </Button>
                        )}
                      {onOpenManualSignIn &&
                        (forceShowActions ||
                          result.status === CHECKIN_RESULT_STATUS.FAILED) && (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={
                              openingManualAccountId === result.accountId
                            }
                            disabled={
                              openingManualAccountId === result.accountId
                            }
                            onClick={() => onOpenManualSignIn(result.accountId)}
                            leftIcon={
                              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />
                            }
                          >
                            {t("execution.actions.openManual")}
                          </Button>
                        )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
