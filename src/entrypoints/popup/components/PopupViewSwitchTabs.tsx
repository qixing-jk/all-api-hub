import { Tab } from "@headlessui/react"

import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { useProductAnalyticsActionTracking } from "~/hooks/useProductAnalyticsActionTracking"
import { cn } from "~/lib/utils"
import type { ProductAnalyticsScopedActionConfig } from "~/services/productAnalytics/actionConfig"
import {
  PRODUCT_ANALYTICS_ACTION_IDS,
  type ProductAnalyticsActionId,
  type ProductAnalyticsFeatureId,
} from "~/services/productAnalytics/events"

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
}

/**
 * Renders one tracked popup view tab without exposing translated labels to analytics.
 */
function PopupViewSwitchTab({
  analyticsAction,
  baseClassName,
  label,
}: PopupViewSwitchTabProps) {
  const analytics = useProductAnalyticsActionTracking({ analyticsAction })
  const trackingProps = analytics.getActionTrackingProps()

  return (
    <Tab
      as="button"
      type="button"
      title={label}
      onClick={trackingProps.onClick}
      className={({ selected }) =>
        cn(
          baseClassName,
          "flex min-w-0 items-center justify-center truncate",
          selected
            ? "dark:bg-dark-bg-secondary dark:text-dark-text-primary bg-white text-gray-900 shadow-sm"
            : "dark:text-dark-text-secondary dark:hover:text-dark-text-primary text-gray-500 hover:text-gray-700",
        )
      }
    >
      {label}
    </Tab>
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
      fallbackActionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectAccountsView,
    },
    {
      value: "bookmarks",
      label: bookmarksLabel,
      fallbackActionId: PRODUCT_ANALYTICS_ACTION_IDS.SelectBookmarksView,
    },
    {
      value: "apiCredentialProfiles",
      label: apiCredentialProfilesLabel,
      fallbackActionId:
        PRODUCT_ANALYTICS_ACTION_IDS.SelectApiCredentialProfilesView,
    },
  ] as const

  const selectedIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.value === value),
  )

  return (
    <Tab.Group
      className="min-w-0"
      selectedIndex={selectedIndex}
      onChange={(index) => {
        const nextValue = tabs[index]?.value
        if (nextValue) {
          onChange(nextValue)
        }
      }}
    >
      <Tab.List
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
            />
          )
        })}
      </Tab.List>
    </Tab.Group>
  )
}
