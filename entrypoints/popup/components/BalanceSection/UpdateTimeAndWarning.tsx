import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import Tooltip from "~/components/Tooltip"
import { Badge, Caption } from "~/components/ui"
import { UI_CONSTANTS } from "~/constants/ui"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import { formatFullTime, formatRelativeTime } from "~/utils/formatters"

export const UpdateTimeAndWarning = () => {
  const { t } = useTranslation("account")
  const { lastUpdateTime, detectedAccount, detectedSiteAccounts } =
    useAccountDataContext()
  const [, setTick] = useState(0)

  useEffect(() => {
    // 每隔一段时间更新 tick，以触发相对时间的重新计算
    // 这样可以确保 "更新于 X 分钟前" 这样的文本是动态更新的
    // 而不是仅在组件初次渲染时计算一次
    const timer = setInterval(
      () => setTick((t) => t + 1),
      UI_CONSTANTS.UPDATE_INTERVAL,
    )
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex items-center justify-between gap-2">
      <Tooltip content={formatFullTime(lastUpdateTime)}>
        <Caption className="cursor-help">
          {t("common:time.updatedAt", {
            time: formatRelativeTime(lastUpdateTime),
          })}
        </Caption>
      </Tooltip>
      {detectedSiteAccounts.length > 0 && (
        <Badge variant="warning" size="sm">
          {detectedAccount
            ? t("currentLoginAdded", { siteName: detectedAccount.site_name })
            : t("currentSiteAdded", {
                siteName: detectedSiteAccounts[0].site_name,
              })}
        </Badge>
      )}
    </div>
  )
}
