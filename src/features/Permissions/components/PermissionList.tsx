import {
  Bell,
  Bookmark,
  ClipboardCheck,
  Cookie,
  Network,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react"
import type { ReactNode } from "react"

import { Badge } from "~/components/ui/badge"
import { CardItem } from "~/components/ui/CardItem"
import { CardList } from "~/components/ui/CardList"

const permissionIconMap: Partial<Record<string, ReactNode>> = {
  cookies: <Cookie className="text-link h-5 w-5" />,
  declarativeNetRequestWithHostAccess: (
    <SlidersHorizontal className="text-link h-5 w-5" />
  ),
  webRequest: <Network className="text-theme-500 h-5 w-5" />,
  webRequestBlocking: <ShieldAlert className="text-link h-5 w-5" />,
  clipboardRead: <ClipboardCheck className="text-theme-500 h-5 w-5" />,
  notifications: <Bell className="text-link h-5 w-5" />,
  bookmarks: <Bookmark className="text-link h-5 w-5" />,
}

export interface PermissionListItem {
  id: string
  icon?: ReactNode
  title: string
  titleContent?: ReactNode
  description: string
  status?: boolean | null
  statusLabel?: string
  rightContent: ReactNode
}

interface PermissionListProps {
  items: PermissionListItem[]
  children?: ReactNode
}

/**
 * Maps optional permission grant state to the matching status badge variant.
 */
function getStatusBadgeVariant(status: boolean | null | undefined) {
  if (status === true) return "success"
  if (status === false) return "warning"
  return "info"
}

/** Shared presentation for optional permissions and browser-owned access settings. */
export function PermissionRow({ item }: { item: PermissionListItem }) {
  return (
    <CardItem
      id={item.id}
      icon={item.icon ?? permissionIconMap[item.id]}
      title={item.title}
      titleContent={
        item.titleContent ??
        (item.statusLabel ? (
          <Badge variant={getStatusBadgeVariant(item.status)}>
            {item.statusLabel}
          </Badge>
        ) : undefined)
      }
      description={item.description}
      rightContent={item.rightContent}
    />
  )
}

/** Renders permission rows with shared icons, descriptions, badges and actions. */
export function PermissionList({ items, children }: PermissionListProps) {
  return (
    <CardList>
      {children}
      {items.map((item) => (
        <PermissionRow key={item.id} item={item} />
      ))}
    </CardList>
  )
}
