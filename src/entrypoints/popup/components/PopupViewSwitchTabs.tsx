import { Tabs, TabsList, TabsTrigger } from "~/components/ui/tabs"
import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { useProductAnalyticsActionTracking } from "~/hooks/useProductAnalyticsActionTracking"
import { cn } from "~/lib/utils"
import type { ProductAnalyticsScopedActionConfig } from "~/services/productAnalytics/actionConfig"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  type ProductAnalyticsActionId,
  type ProductAnalyticsFeatureId,
} from "~/services/productAnalytics/contracts"

import { POPUP_TEST_IDS } from "../testIds"

export type PopupViewType = "accounts" | "bookmarks" | "apiCredentialProfiles"

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
        "flex min-w-0 items-center justify-center truncate",
        "data-[state=active]:dark:bg-dark-bg-secondary data-[state=active]:dark:text-dark-text-primary data-[state=active]:bg-white data-[state=active]:text-gray-900 data-[state=active]:shadow-sm",
        "dark:text-dark-text-secondary dark:hover:text-dark-text-primary text-gray-500 hover:text-gray-700",
      )}
    >
      {label}
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
  getAnalyticsAction,
}: PopupViewSwitchTabsProps) {
  const baseClassName = cn(
    "rounded-md px-2 py-1 text-xs font-medium transition-colors",
    ANIMATIONS.transition.base,
  )
  const tabs = [
    {
      value: "accounts",
      label: accountsLabel,
      testId: POPUP_TEST_IDS.accountsTab,
      fallbackActionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectAccountsView,
    },
    {
      value: "apiCredentialProfiles",
      label: apiCredentialProfilesLabel,
      testId: POPUP_TEST_IDS.apiCredentialProfilesTab,
      fallbackActionId:
        PRODUCT_ANALYTICS_ACTION_IDS.SelectApiCredentialProfilesView,
    },
    {
      value: "bookmarks",
      label: bookmarksLabel,
      testId: POPUP_TEST_IDS.bookmarksTab,
      fallbackActionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectBookmarksView,
    },
  ] as const

  return (
    <Tabs
      className="min-w-0"
      value={value}
      onValueChange={(nextValue) => onChange(nextValue as PopupViewType)}
    >
      <TabsList
        className={cn(
          "inline-flex min-w-0 gap-1 rounded-lg p-1",
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
