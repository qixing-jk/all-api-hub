import React from "react"

import { CardItem } from "~/components/ui"
import { useDevice } from "~/contexts/DeviceContext"
import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"
import { useAccountListItem } from "~/features/AccountManagement/components/AccountList/hooks/useAccountListItem"
import { useAccountDataContext } from "~/features/AccountManagement/hooks/AccountDataContext"
import type { SearchResultWithHighlight } from "~/features/AccountManagement/hooks/useAccountSearch"
import type { DisplaySiteData } from "~/types"

import BalanceDisplay from "./BalanceDisplay"
import SiteInfo from "./SiteInfo"

interface AccountListItemProps {
  site: DisplaySiteData
  highlights?: SearchResultWithHighlight["highlights"]
  onCopyKey: (site: DisplaySiteData) => void
  onDeleteWithDialog: (site: DisplaySiteData) => void
}

const AccountListItem: React.FC<AccountListItemProps> = React.memo(
  ({ site, highlights, onCopyKey, onDeleteWithDialog }) => {
    const { detectedAccount } = useAccountDataContext()
    const { handleMouseEnter, handleMouseLeave } = useAccountListItem()
    const { isTouchDevice } = useDevice()

    // 触摸设备始终显示按钮，PC端根据hover状态显示
    const revealButtonsClass = isTouchDevice
      ? ""
      : "opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-focus-within:pointer-events-auto"

    const isDetected = site.id === detectedAccount?.id

    return (
      <CardItem
        padding="none"
        className={`group touch-manipulation transition-all ${
          isDetected
            ? "border-l-4 border-l-blue-500 bg-blue-50 dark:border-l-blue-400 dark:bg-blue-900/50"
            : ""
        }`}
        onMouseEnter={() => handleMouseEnter(site.id)}
        onMouseLeave={handleMouseLeave}
      >
        <div className="flex w-full min-w-0 items-center gap-1 sm:gap-2">
          {/* 左侧：站点信息 - 可压缩 */}
          <div className="min-w-[60px] flex-1 sm:min-w-[80px]">
            <SiteInfo site={site} highlights={highlights} />
          </div>

          {/* 中间：操作按钮 */}
          <div
            className={`shrink-0 transition-opacity duration-200 ${revealButtonsClass}`}
          >
            <AccountActionButtons
              site={site}
              onDeleteAccount={onDeleteWithDialog}
              onCopyKey={onCopyKey}
            />
          </div>

          {/* 右侧：余额显示 - 可压缩 */}
          <div className="min-w-[60px] flex-1 sm:min-w-[80px]">
            <BalanceDisplay site={site} />
          </div>
        </div>
      </CardItem>
    )
  },
)

AccountListItem.displayName = "AccountListItem"

export default AccountListItem
