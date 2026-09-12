import type { FC } from "react"
import { useTranslation } from "react-i18next"

import type { DisplaySiteData } from "~/types"

const AccountInfoDetail: FC<{
  label: string
  value: string
  isUrl?: boolean
}> = ({ label, value, isUrl }) => (
  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
    <span className="dark:text-dark-text-secondary shrink-0 text-gray-500">
      {label}：
    </span>
    {isUrl ? (
      <span
        className="dark:text-dark-text-primary min-w-0 font-medium break-all text-gray-900"
        title={value}
      >
        {value}
      </span>
    ) : (
      <span className="dark:text-dark-text-primary min-w-0 font-medium [overflow-wrap:anywhere] text-gray-900">
        {value}
      </span>
    )}
  </div>
)

export const AccountInfo: FC<{ account: DisplaySiteData }> = ({ account }) => {
  const { t } = useTranslation("ui")

  return (
    <div className="dark:bg-dark-bg-secondary space-y-1 rounded-lg bg-gray-50 p-3 text-sm">
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
