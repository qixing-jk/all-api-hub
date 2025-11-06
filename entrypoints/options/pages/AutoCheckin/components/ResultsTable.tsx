import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline"
import { useTranslation } from "react-i18next"

import { Card } from "~/components/ui"
import type { CheckinAccountResult } from "~/types/autoCheckin"

interface ResultsTableProps {
  results: CheckinAccountResult[]
}

export default function ResultsTable({ results }: ResultsTableProps) {
  const { t } = useTranslation("autoCheckin")

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "success":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
            <CheckCircleIcon className="h-3 w-3" />
            {t("execution.status.success")}
          </span>
        )
      case "already_checked":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
            <CheckCircleIcon className="h-3 w-3" />
            {t("execution.status.alreadyChecked")}
          </span>
        )
      case "failed":
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800 dark:bg-red-900 dark:text-red-200">
            <XCircleIcon className="h-3 w-3" />
            {t("execution.status.failed")}
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
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t("execution.table.accountName")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t("execution.table.status")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t("execution.table.message")}
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                {t("execution.table.time")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 bg-white dark:divide-gray-700 dark:bg-gray-900">
            {results.map((result) => (
              <tr
                key={result.accountId}
                className="hover:bg-gray-50 dark:hover:bg-gray-800">
                <td className="whitespace-nowrap px-6 py-4 text-sm font-medium text-gray-900 dark:text-gray-100">
                  {result.accountName}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm">
                  {getStatusBadge(result.status)}
                </td>
                <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {result.message}
                </td>
                <td className="whitespace-nowrap px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                  {formatTimestamp(result.timestamp)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
