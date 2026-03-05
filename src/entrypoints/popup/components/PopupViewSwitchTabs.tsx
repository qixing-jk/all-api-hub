import { ANIMATIONS, COLORS } from "~/constants/designTokens"

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
  const baseClassName = `rounded-md px-2 py-1 text-xs font-medium transition-colors ${ANIMATIONS.transition.base}`
  const activeClassName =
    "dark:bg-dark-bg-secondary dark:text-dark-text-primary bg-white text-gray-900 shadow-sm"
  const inactiveClassName =
    "dark:text-dark-text-secondary dark:hover:text-dark-text-primary text-gray-500 hover:text-gray-700"

  const tabs = [
    { value: "accounts", label: accountsLabel },
    { value: "bookmarks", label: bookmarksLabel },
    { value: "apiCredentialProfiles", label: apiCredentialProfilesLabel },
  ] as const

  return (
    <div
      className={`flex min-w-0 flex-1 gap-1 ${COLORS.background.tertiary} rounded-lg p-1`}
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          aria-pressed={value === tab.value}
          onClick={() => onChange(tab.value)}
          title={tab.label}
          className={`${baseClassName} flex min-w-0 flex-1 items-center justify-center truncate ${
            value === tab.value ? activeClassName : inactiveClassName
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
