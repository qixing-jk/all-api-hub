import { MenuItem } from "@headlessui/react"
import React from "react"

interface AccountActionMenuItemProps {
  /** Click handler; receives the original click event (after propagation is stopped). */
  onClick: (e?: React.MouseEvent) => void
  /** Leading icon rendered to the left of the label. */
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  /** Visible label (also used by tests as the accessible name). */
  label: string
  /** Uses the destructive (red) palette. Prefer over `tone` when applicable. */
  isDestructive?: boolean
  /**
   * Non-destructive semantic tone for the menu item.
   * - `warning`: used for reversible, potentially risky actions (e.g., Disable).
   * - `success`: used for recovery/positive actions (e.g., Enable).
   */
  tone?: "default" | "warning" | "success"
  /** Disables the item and renders it with the disabled palette. */
  disabled?: boolean
}

const menuItemClassName =
  "w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary data-focus:bg-gray-50 dark:data-focus:bg-dark-bg-tertiary flex items-center space-x-2"
const warningMenuItemClassName =
  "w-full px-3 py-2 text-left text-sm text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300 data-focus:bg-amber-50 dark:data-focus:bg-amber-900/40 flex items-center space-x-2"
const successMenuItemClassName =
  "w-full px-3 py-2 text-left text-sm text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 data-focus:bg-emerald-50 dark:data-focus:bg-emerald-900/40 flex items-center space-x-2"
const destructiveMenuItemClassName =
  "w-full px-3 py-2 text-left text-sm text-red-600 hover:text-red-700 data-focus:bg-red-50 dark:data-focus:bg-red-900/50 flex items-center space-x-2"
const disabledMenuItemClassName =
  "w-full px-3 py-2 text-left text-sm text-gray-400 dark:text-dark-text-tertiary flex items-center space-x-2 cursor-not-allowed"

export const AccountActionMenuItem: React.FC<AccountActionMenuItemProps> = ({
  onClick,
  icon: Icon,
  label,
  isDestructive = false,
  tone = "default",
  disabled = false,
}) => (
  <MenuItem disabled={disabled}>
    {({ close, disabled: isMenuItemDisabled }) => (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (isMenuItemDisabled) return
          onClick(e)
          // Ensure the dropdown closes immediately after selection to avoid UI flicker
          // (e.g., Disable triggers a reload and would otherwise swap to Enable while still open).
          close()
        }}
        disabled={isMenuItemDisabled}
        className={
          isMenuItemDisabled
            ? disabledMenuItemClassName
            : isDestructive
              ? destructiveMenuItemClassName
              : tone === "warning"
                ? warningMenuItemClassName
                : tone === "success"
                  ? successMenuItemClassName
                  : menuItemClassName
        }
      >
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </button>
    )}
  </MenuItem>
)
