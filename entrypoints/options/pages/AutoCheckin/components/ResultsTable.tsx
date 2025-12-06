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
  CHECKIN_RESULT_STATUS,
  CheckinAccountResult,
} from "~/types/autoCheckin"

interface ResultsTableProps {
  results: CheckinAccountResult[]
  retryingAccountId?: string | null
  openingManualAccountId?: string | null
  onRetryAccount?: (accountId: string) => void | Promise<void>
  onOpenManualSignIn?: (accountId: string) => void | Promise<void>
}

/**
 * Renders auto-checkin execution results with status badges, timestamps, and action buttons.
 * @param props results list and callbacks controlling retry/manual sign-in states.
 */
export default function ResultsTable({
  results,
  retryingAccountId,
  openingManualAccountId,
  onRetryAccount,
  onOpenManualSignIn,
}: ResultsTableProps) {
  const { t } = useTranslation("autoCheckin")

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

  const formatTimestamp = (timestamp: number): string => {
    try {
      const date = new Date(timestamp)
      return date.toLocaleString()
    } catch {
      return "-"
    }
  }

  return (
    <Card padding="none">
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
              <th className="px-6 py-3 text-left text-xs font-medium tracking-wider text-gray-500 uppercase dark:text-gray-400">
                {t("execution.table.actions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
            {results.map((result) => (
              <tr
                key={result.accountId}
                className="hover:bg-gray-50 dark:hover:bg-gray-800"
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
                  {result.message}
                </td>
                <td className="px-6 py-4 text-sm whitespace-nowrap text-gray-500 dark:text-gray-400">
                  {formatTimestamp(result.timestamp)}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  <div className="flex flex-wrap gap-2">
                    {onRetryAccount &&
                      result.status === CHECKIN_RESULT_STATUS.FAILED && (
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
                      result.status === CHECKIN_RESULT_STATUS.FAILED && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={openingManualAccountId === result.accountId}
                          disabled={openingManualAccountId === result.accountId}
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
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
