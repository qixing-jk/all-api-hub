import React from "react"

import { CardItem } from "~/components/ui"
import { useDevice } from "~/contexts/DeviceContext"
import AccountActionButtons from "~/features/AccountManagement/components/AccountActionButtons"
import type { SearchResultWithHighlight } from "~/features/AccountManagement/components/AccountList/filtering/useAccountSearch"
import BalanceDisplay from "~/features/AccountManagement/components/AccountList/rows/BalanceDisplay"
import SiteInfo from "~/features/AccountManagement/components/AccountList/rows/SiteInfo"
import { getAccountManagementListItemTestId } from "~/features/AccountManagement/testIds"
import type { DisplaySiteData } from "~/types"

interface AccountListItemProps {
  site: DisplaySiteData
  highlights?: SearchResultWithHighlight["highlights"]
  onCopyKey: (site: DisplaySiteData) => void
  onDeleteWithDialog: (site: DisplaySiteData) => void
  showContextBoost?: boolean
  showCreatedAt?: boolean
}

const AccountListItem: React.FC<AccountListItemProps> = React.memo(
  ({
    site,
    highlights,
    onCopyKey,
    onDeleteWithDialog,
    showCreatedAt,
    showContextBoost,
  }) => {
    const { isTouchDevice } = useDevice()

    // 触摸设备始终显示按钮，PC端根据hover状态显示
    const revealButtonsClass = isTouchDevice
      ? ""
      : "opacity-0 pointer-events-none group-hover:opacity-100 group-focus-within:opacity-100 group-hover:pointer-events-auto group-focus-within:pointer-events-auto"

    return (
      <CardItem
        padding="none"
        className="group @container/account-row touch-manipulation transition-all"
        data-testid={getAccountManagementListItemTestId(site.id)}
        data-site-url={site.baseUrl}
        data-site-type={site.siteType}
        data-disabled={site.disabled ? "true" : undefined}
      >
        <div className="grid w-full min-w-0 grid-cols-[0.5rem_minmax(0,1fr)_minmax(0,1.55fr)] items-center gap-x-2 gap-y-1 @sm/account-row:flex @sm/account-row:gap-density-2">
          {/* 左侧：站点信息 - 可压缩 */}
          {/* Clip long names horizontally without creating a vertical scroll container for status/pin controls. */}
          <div className="contents @sm/account-row:block @sm/account-row:min-w-[80px] @sm/account-row:flex-1 @sm/account-row:overflow-x-clip">
            <SiteInfo
              site={site}
              highlights={highlights}
              showCreatedAt={showCreatedAt}
              showContextBoost={showContextBoost}
            />
          </div>

          {/* 中间：操作按钮 */}
          <div
            className={`col-start-3 row-start-2 min-w-0 shrink-0 justify-self-end transition-opacity duration-200 @max-sm/account-row:self-start ${revealButtonsClass}`}
          >
            <AccountActionButtons
              className="@max-sm/account-row:flex @max-sm/account-row:flex-nowrap @max-sm/account-row:gap-x-1 @max-sm/account-row:gap-y-0 @max-sm/account-row:[&_button]:text-muted-foreground @max-sm/account-row:[&_button:hover]:text-foreground"
              site={site}
              onDeleteAccount={onDeleteWithDialog}
              onCopyKey={onCopyKey}
            />
          </div>

          {/* 右侧：余额显示 - 可压缩 */}
          <div className="contents @sm/account-row:block @sm/account-row:min-w-[80px] @sm/account-row:flex-1">
            <BalanceDisplay site={site} />
          </div>
        </div>
      </CardItem>
    )
  },
)

AccountListItem.displayName = "AccountListItem"

export default AccountListItem
