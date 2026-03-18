import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"

import { getManagedSiteChannelStatusLabel, STATUS_VARIANTS } from "../constants"

/**
 * Renders the status badge for a channel row based on numeric status code.
 */
export default function StatusBadge({ status }: { status: number }) {
  const { t } = useTranslation("managedSiteChannels")
  const config = STATUS_VARIANTS[status] ?? STATUS_VARIANTS[0]
  return (
    <Badge
      variant={config.variant ?? "secondary"}
      className={cn("text-xs", config.className)}
    >
      {getManagedSiteChannelStatusLabel(t, status)}
    </Badge>
  )
}
