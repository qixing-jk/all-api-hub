import type { LucideIcon } from "lucide-react"
import { useRef, useState, type ReactNode } from "react"

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
  const triggerRef = useRef<HTMLDivElement>(null)
  const [sideOffset, setSideOffset] = useState(0)

  return (
    <DropdownMenuSub
      onOpenChange={(open) => {
        if (!open || !triggerRef.current) return
        const bounds = triggerRef.current.getBoundingClientRect()
        const available = Math.max(
          bounds.left,
          window.innerWidth - bounds.right,
        )
        // Overlap the parent only when neither side has room for readable labels.
        setSideOffset(Math.min(0, available - 192 - 8))
      }}
    >
      <DropdownMenuSubTrigger ref={triggerRef} className="gap-2 px-3 py-2">
        <Icon className="h-4 w-4" />
        {label}
      </DropdownMenuSubTrigger>
      <DropdownMenuPortal>
        <DropdownMenuSubContent
          collisionPadding={8}
          sideOffset={sideOffset}
          className="max-h-(--radix-dropdown-menu-content-available-height) max-w-(--radix-dropdown-menu-content-available-width) min-w-48 overflow-y-auto"
        >
          {children}
        </DropdownMenuSubContent>
      </DropdownMenuPortal>
    </DropdownMenuSub>
  )
}
