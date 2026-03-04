import { ExclamationTriangleIcon } from "@heroicons/react/24/outline"
import type { FC } from "react"
import { useTranslation } from "react-i18next"

interface WarningSectionProps {
  accountName?: string
}

export const WarningSection: FC<WarningSectionProps> = ({ accountName }) => {
  const { t } = useTranslation("ui")

  return (
    <div className="mb-4 flex items-start space-x-3">
      <div className="shrink-0">
        <ExclamationTriangleIcon
          className="h-6 w-6 text-red-500"
          aria-hidden="true"
        />
      </div>
      <div className="flex-1">
        <h3 className="dark:text-dark-text-primary mb-2 text-sm font-medium text-gray-900">
          {t("dialog.delete.confirmDeletion")}
        </h3>
        <p className="dark:text-dark-text-secondary text-sm text-gray-500">
          {t("dialog.delete.warning", { accountName: accountName })}
        </p>
      </div>
    </div>
  )
}
