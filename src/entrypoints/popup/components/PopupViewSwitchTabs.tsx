import { Tab } from "@headlessui/react"

import { ANIMATIONS, COLORS } from "~/constants/designTokens"
import { cn } from "~/lib/utils"

export type PopupViewType = "accounts" | "bookmarks" | "apiCredentialProfiles"

interface PopupViewSwitchTabsProps {
  value: PopupViewType
  onChange: (value: PopupViewType) => void
  accountsLabel: string
  bookmarksLabel: string
  apiCredentialProfilesLabel: string
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
}: PopupViewSwitchTabsProps) {
  const baseClassName = cn(
    "rounded-md px-2 py-1 text-xs font-medium transition-colors",
    ANIMATIONS.transition.base,
  )
  const activeClassName =
    "dark:bg-dark-bg-secondary dark:text-dark-text-primary bg-white text-gray-900 shadow-sm"
  const inactiveClassName =
    "dark:text-dark-text-secondary dark:hover:text-dark-text-primary text-gray-500 hover:text-gray-700"

  const tabs = [
    { value: "accounts", label: accountsLabel },
    { value: "bookmarks", label: bookmarksLabel },
    { value: "apiCredentialProfiles", label: apiCredentialProfilesLabel },
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
        {tabs.map((tab) => (
          <Tab
            key={tab.value}
            as="button"
            type="button"
            title={tab.label}
            className={({ selected }) =>
              cn(
                baseClassName,
                "flex min-w-0 items-center justify-center truncate",
                selected ? activeClassName : inactiveClassName,
              )
            }
          >
            {tab.label}
          </Tab>
        ))}
      </Tab.List>
    </Tab.Group>
  )
}
