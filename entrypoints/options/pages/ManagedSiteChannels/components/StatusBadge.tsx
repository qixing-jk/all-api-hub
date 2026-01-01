import { useTranslation } from "react-i18next"

import { Badge } from "~/components/ui/badge"
import { cn } from "~/lib/utils"

export const STATUS_VARIANTS: Record<
  number,
  {
    labelKey: string
    className: string
    variant?: "secondary" | "destructive" | "outline"
  }
> = {
  0: { labelKey: "statusLabels.unknown", className: "", variant: "secondary" },
  1: {
    labelKey: "statusLabels.enabled",
    className: "border-emerald-200 text-emerald-700",
    variant: "secondary",
  },
  2: {
    labelKey: "statusLabels.manualPause",
    className: "border-amber-200 text-amber-800",
    variant: "outline",
  },
  3: {
    labelKey: "statusLabels.autoDisabled",
    className: "",
    variant: "destructive",
  },
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
      {t(config.labelKey)}
    </Badge>
  )
}
