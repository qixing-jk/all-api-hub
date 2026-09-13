import type { LucideIcon } from "lucide-react"
import type { ReactNode } from "react"

import {
  DropdownMenuPortal,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "~/components/ui/dropdown-menu"

/** Shares keyboard navigation and viewport bounds for account action groups. */
export function AccountActionSubmenu({
  icon: Icon,
  label,
  children,
}: {
  icon: LucideIcon
  label: string
  children: ReactNode
}) {
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2 px-3 py-2">
        <Icon className="h-4 w-4" />
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent className="max-h-(--radix-dropdown-menu-content-available-height) max-w-[calc(100vw-1rem)] overflow-y-auto">
          {children}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}
