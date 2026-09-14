import type { FC } from "react"
import { useTranslation } from "react-i18next"

import type { DisplaySiteData } from "~/types"

const AccountInfoDetail: FC<{
  label: string
  value: string
  isUrl?: boolean
}> = ({ label, value, isUrl }) => (
  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
    <span className="dark:text-secondary-foreground text-muted-foreground shrink-0">
      {label}：
    </span>
    {isUrl ? (
      <span
        className="text-foreground min-w-0 font-medium break-all"
        title={value}
      >
        {value}
      </span>
    ) : (
      <span className="text-foreground min-w-0 font-medium [overflow-wrap:anywhere]">
        {value}
      </span>
    )}
  </div>
)

export const AccountInfo: FC<{ account: DisplaySiteData }> = ({ account }) => {
  const { t } = useTranslation("ui")

  return (
    <div className="dark:bg-card bg-surface-subtle space-y-1 rounded-lg p-3 text-sm">
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
