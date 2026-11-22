import { Bookmark, type LucideIcon } from "lucide-react"
import type { ComponentType } from "react"

import {
  AccountManagementIcon,
  ApiCredentialLibraryIcon,
} from "~/components/icons/productIcons"
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
        "min-h-0 gap-x-1 gap-y-density-1 truncate",
        "text-muted-foreground hover:text-secondary-foreground dark:text-secondary-foreground dark:hover:text-foreground",
      )}
    >
      {Icon ? <Icon aria-hidden="true" className="size-3.5 shrink-0" /> : null}
      <span className="truncate">{label}</span>
    </TabsTrigger>
  )
}

/**
 * Uses the same full-width tab strip for every popup view.
 */
export default function PopupViewSwitchTabs({
  value,
  onChange,
  accountsLabel,
  bookmarksLabel,
  apiCredentialProfilesLabel,
  getAnalyticsAction,
}: PopupViewSwitchTabsProps) {
  const baseClassName = cn(
    `${CORNERS.item} w-full px-1 py-density-1 text-xs font-medium transition-colors`,
    ANIMATIONS.transition.base,
  )
  const tabs = [
    {
      value: POPUP_VIEW_TYPES.Accounts,
      label: accountsLabel,
      icon: AccountManagementIcon,
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
      className="w-full min-w-0"
      value={value}
      onValueChange={(nextValue) => onChange(nextValue as PopupViewType)}
    >
      <TabsList
        variant="default"
        className={cn(
          "grid w-full grid-cols-3 rounded-md",
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
              baseClassName={baseClassName}
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
