import { Bookmark, UserRound, type LucideIcon } from "lucide-react"
import type { ComponentType } from "react"

import { ApiCredentialLibraryIcon } from "~/components/icons/productIcons"
import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { ANIMATIONS, COLORS, CORNERS } from "~/constants/designTokens"
import { useProductAnalyticsActionTracking } from "~/hooks/analytics/useProductAnalyticsActionTracking"
import { cn } from "~/lib/utils"
import type { ProductAnalyticsScopedActionConfig } from "~/services/productAnalytics/actionConfig"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  type ProductAnalyticsActionId,
  type ProductAnalyticsFeatureId,
} from "~/services/productAnalytics/contracts"

import { POPUP_TEST_IDS } from "../testIds"
import { POPUP_VIEW_TYPES, type PopupViewType } from "../viewTypes"

export type { PopupViewType } from "../viewTypes"

interface PopupViewSwitchTabsProps {
  value: PopupViewType
  onChange: (value: PopupViewType) => void
  accountsLabel: string
  bookmarksLabel: string
  apiCredentialProfilesLabel: string
  fullWidth?: boolean
  getAnalyticsAction?: (value: PopupViewType) => {
    featureId: ProductAnalyticsFeatureId
    actionId: ProductAnalyticsActionId
  }
}

interface PopupViewSwitchTabProps {
  analyticsAction: ProductAnalyticsScopedActionConfig
  baseClassName: string
  icon?:
    | LucideIcon
    | ComponentType<{
        className?: string
        "aria-hidden"?: boolean | "true" | "false"
      }>
  label: string
  testId: string
  value: PopupViewType
}

/**
 * Renders one tracked popup view tab without exposing translated labels to analytics.
 */
function PopupViewSwitchTab({
  analyticsAction,
  baseClassName,
  icon: Icon,
  label,
  testId,
  value,
}: PopupViewSwitchTabProps) {
  const analytics = useProductAnalyticsActionTracking({ analyticsAction })
  const trackingProps = analytics.getActionTrackingProps()

  return (
    <TabsTrigger
      type="button"
      value={value}
      title={label}
      data-testid={testId}
      onClick={trackingProps.onClick}
      className={cn(
        baseClassName,
        "gap-y-density-1 flex min-w-0 items-center justify-center gap-x-1.5 truncate",
        "data-[state=active]:dark:bg-card data-[state=active]:dark:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        "dark:text-secondary-foreground dark:hover:text-foreground text-muted-foreground hover:text-secondary-foreground",
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </TabsTrigger>
  )
}

/**
 * Popup view switch styled like the historical "StyledTab" control.
 * Renders a compact inline block instead of a full-width header row.
 */
export default function PopupViewSwitchTabs({
  value,
  onChange,
  accountsLabel,
  bookmarksLabel,
  apiCredentialProfilesLabel,
  fullWidth = false,
  getAnalyticsAction,
}: PopupViewSwitchTabsProps) {
  const baseClassName = cn(
    `${CORNERS.item} px-2 py-density-1 text-xs font-medium transition-colors`,
    ANIMATIONS.transition.base,
  )
  const tabs = [
    {
      value: POPUP_VIEW_TYPES.Accounts,
      label: accountsLabel,
      icon: UserRound,
      testId: POPUP_TEST_IDS.accountsTab,
      fallbackActionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectAccountsView,
    },
    {
      value: POPUP_VIEW_TYPES.ApiCredentialProfiles,
      label: apiCredentialProfilesLabel,
      icon: ApiCredentialLibraryIcon,
      testId: POPUP_TEST_IDS.apiCredentialProfilesTab,
      fallbackActionId:
        PRODUCT_ANALYTICS_ACTION_IDS.SelectApiCredentialProfilesView,
    },
    {
      value: POPUP_VIEW_TYPES.Bookmarks,
      label: bookmarksLabel,
      icon: Bookmark,
      testId: POPUP_TEST_IDS.bookmarksTab,
      fallbackActionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectBookmarksView,
    },
  ] as const

  return (
    <Tabs
      className={cn("min-w-0", fullWidth && "w-full")}
      value={value}
      onValueChange={(nextValue) => onChange(nextValue as PopupViewType)}
    >
      <TabsList
        className={cn(
          "corners-concentric gap-y-density-1 py-density-1 min-w-0 gap-x-1 rounded-md px-1 [--corner-inset:4px]",
          fullWidth ? "grid w-full grid-cols-3" : "inline-flex max-w-full",
          COLORS.background.tertiary,
        )}
      >
        {tabs.map((tab) => {
          const analyticsAction: ProductAnalyticsScopedActionConfig =
            getAnalyticsAction?.(tab.value) ?? tab.fallbackActionId

          return (
            <PopupViewSwitchTab
              key={tab.value}
              analyticsAction={analyticsAction}
              baseClassName={cn(baseClassName, fullWidth && "w-full")}
              icon={tab.icon}
              label={tab.label}
              testId={tab.testId}
              value={tab.value}
            />
          )
        })}
      </TabsList>
    </Tabs>
  )
}
