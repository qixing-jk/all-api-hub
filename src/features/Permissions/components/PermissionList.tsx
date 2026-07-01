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
import type { ManifestOptionalPermissions } from "~/services/permissions/permissionManager"

export const permissionIconMap: Partial<
  Record<ManifestOptionalPermissions, ReactNode>
> = {
  cookies: <Cookie className="h-5 w-5 text-amber-500" />,
  declarativeNetRequestWithHostAccess: (
    <SlidersHorizontal className="h-5 w-5 text-emerald-500" />
  ),
  webRequest: <Network className="h-5 w-5 text-blue-500" />,
  webRequestBlocking: <ShieldAlert className="h-5 w-5 text-purple-500" />,
  clipboardRead: <ClipboardCheck className="h-5 w-5 text-indigo-500" />,
  notifications: <Bell className="h-5 w-5 text-teal-500" />,
  bookmarks: <Bookmark className="h-5 w-5 text-rose-500" />,
}

export interface PermissionListItem {
  id: ManifestOptionalPermissions
  title: string
  titleContent?: ReactNode
  description: string
  status?: boolean | null
  statusLabel?: string
  rightContent: ReactNode
}

interface PermissionListProps {
  items: PermissionListItem[]
}

/**
 * Maps optional permission grant state to the matching status badge variant.
 */
function getStatusBadgeVariant(status: boolean | null | undefined) {
  if (status === true) return "success"
  if (status === false) return "warning"
  return "info"
}

/**
 * Renders a list of optional permissions with icons, descriptions, and actions.
 */
export function PermissionList({ items }: PermissionListProps) {
  return (
    <CardList>
      {items.map((item) => (
        <CardItem
          key={item.id}
          id={item.id}
          icon={permissionIconMap[item.id]}
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
      ))}
    </CardList>
  )
}

export default PermissionList
