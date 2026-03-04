import {
  ClipboardCheck,
  Cookie,
  Network,
  ShieldAlert,
  SlidersHorizontal,
} from "lucide-react"
import type { ReactNode } from "react"

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
}

export interface PermissionListItem {
  id: ManifestOptionalPermissions
  title: string
  description: string
  rightContent: ReactNode
}

interface PermissionListProps {
  items: PermissionListItem[]
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
          icon={permissionIconMap[item.id]}
          title={item.title}
          description={item.description}
          rightContent={item.rightContent}
        />
      ))}
    </CardList>
  )
}

export default PermissionList
