import { MenuItem } from "@headlessui/react"
import React from "react"

interface AccountActionMenuItemProps {
  onClick: (e?: React.MouseEvent) => void
  icon: React.ComponentType<React.SVGProps<SVGSVGElement>>
  label: string
  isDestructive?: boolean
  disabled?: boolean
}

const menuItemClassName =
  "w-full px-3 py-2 text-left text-sm text-gray-700 dark:text-dark-text-secondary hover:text-gray-900 dark:hover:text-dark-text-primary data-focus:bg-gray-50 dark:data-focus:bg-dark-bg-tertiary flex items-center space-x-2"
const destructiveMenuItemClassName =
  "w-full px-3 py-2 text-left text-sm text-red-600 hover:text-red-700 data-focus:bg-red-50 dark:data-focus:bg-red-900/50 flex items-center space-x-2"
const disabledMenuItemClassName =
  "w-full px-3 py-2 text-left text-sm text-gray-400 dark:text-dark-text-tertiary flex items-center space-x-2 cursor-not-allowed"

export const AccountActionMenuItem: React.FC<AccountActionMenuItemProps> = ({
  onClick,
  icon: Icon,
  label,
  isDestructive = false,
  disabled = false,
}) => (
  <MenuItem disabled={disabled}>
    <button
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        onClick(e)
      }}
      disabled={disabled}
      className={
        disabled
          ? disabledMenuItemClassName
          : isDestructive
            ? destructiveMenuItemClassName
            : menuItemClassName
      }
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </button>
  </MenuItem>
)
