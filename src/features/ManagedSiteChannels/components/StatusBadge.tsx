import type { TFunction } from "i18next"
import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"

export const STATUS_VARIANTS: Record<
  number,
  {
    className: string
    variant?: "secondary" | "destructive" | "outline"
  }
> = {
  0: { className: "", variant: "secondary" },
  1: {
    className: "border-emerald-200 text-emerald-700",
    variant: "secondary",
  },
  2: {
    className: "border-amber-200 text-amber-800",
    variant: "outline",
  },
  3: {
    className: "",
    variant: "destructive",
  },
}

/**
 * Resolve the localized label for a managed-site channel status code.
 */
function getManagedSiteChannelStatusLabel(t: TFunction, status: number) {
  switch (status) {
    case 1:
      return t("managedSiteChannels:statusLabels.enabled")
    case 2:
      return t("managedSiteChannels:statusLabels.manualPause")
    case 3:
      return t("managedSiteChannels:statusLabels.autoDisabled")
    case 0:
    default:
      return t("managedSiteChannels:statusLabels.unknown")
  }
}

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
