import type { FC } from "react"
import { useTranslation } from "react-i18next"

import type { DisplaySiteData } from "~/types"

const AccountInfoDetail: FC<{
  label: string
  value: string
  isUrl?: boolean
}> = ({ label, value, isUrl }) => (
  <div className="gap-y-density-1 sm:gap-y-density-3 flex flex-col gap-x-1 sm:flex-row sm:items-start sm:justify-between sm:gap-x-3">
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
    <div className="dark:bg-card bg-surface-subtle space-y-density-1 py-density-3 rounded-lg px-3 text-sm">
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
