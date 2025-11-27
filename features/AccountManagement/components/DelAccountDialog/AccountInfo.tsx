import type { FC } from "react"
import { useTranslation } from "react-i18next"

import type { DisplaySiteData } from "~/types"

const AccountInfoDetail: FC<{
  label: string
  value: string
  isUrl?: boolean
}> = ({ label, value, isUrl }) => (
  <div className="flex items-center justify-between">
    <span className="dark:text-dark-text-secondary text-gray-500">
      {label}：
    </span>
    {isUrl ? (
      <span
        className="dark:text-dark-text-primary ml-2 max-w-48 truncate font-medium text-gray-900"
        title={value}>
        {value}
      </span>
    ) : (
      <span className="dark:text-dark-text-primary font-medium text-gray-900">
        {value}
      </span>
    )}
  </div>
)

export const AccountInfo: FC<{ account: DisplaySiteData }> = ({ account }) => {
  const { t } = useTranslation("ui")

  return (
    <div className="dark:bg-dark-bg-secondary mb-4 space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
      <AccountInfoDetail
        label={t("dialog.delete.siteName")}
        value={account.name}
      />
      <AccountInfoDetail
        label={t("dialog.delete.username")}
        value={account.username}
      />
      <AccountInfoDetail
        label={t("dialog.delete.siteUrl")}
        value={account.baseUrl}
        isUrl
      />
    </div>
  )
}
