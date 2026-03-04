import { ANIMATIONS, COLORS } from "~/constants/designTokens"

export type PopupViewType = "accounts" | "bookmarks"

interface PopupViewSwitchTabsProps {
  value: PopupViewType
  onChange: (value: PopupViewType) => void
  accountsLabel: string
  bookmarksLabel: string
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
}: PopupViewSwitchTabsProps) {
  const baseClassName = `rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${ANIMATIONS.transition.base}`
  const activeClassName =
    "dark:bg-dark-bg-secondary dark:text-dark-text-primary bg-white text-gray-900 shadow-sm"
  const inactiveClassName =
    "dark:text-dark-text-secondary dark:hover:text-dark-text-primary text-gray-500 hover:text-gray-700"

  return (
    <div
      className={`flex space-x-1 ${COLORS.background.tertiary} w-fit rounded-lg p-1`}
    >
      <button
        type="button"
        aria-pressed={value === "accounts"}
        onClick={() => onChange("accounts")}
        className={`${baseClassName} ${
          value === "accounts" ? activeClassName : inactiveClassName
        }`}
      >
        {accountsLabel}
      </button>
      <button
        type="button"
        aria-pressed={value === "bookmarks"}
        onClick={() => onChange("bookmarks")}
        className={`${baseClassName} ${
          value === "bookmarks" ? activeClassName : inactiveClassName
        }`}
      >
        {bookmarksLabel}
      </button>
    </div>
  )
}
