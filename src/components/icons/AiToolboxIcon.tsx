import { Wrench } from "lucide-react"

import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/components/icons/iconSizes"
import { cn } from "~/lib/utils"

interface AiToolboxIconProps {
  size?: IconSize
  className?: string
}

/**
 * Neutral tool mark standing in for the AI Toolbox desktop client.
 * The project does not ship a brand asset for it, so the shared sizing token
 * keeps it visually consistent with the other integration icons.
 */
export function AiToolboxIcon({ size = "sm", className }: AiToolboxIconProps) {
  return (
    <Wrench
      aria-hidden="true"
      className={cn(ICON_SIZE_CLASSNAME[size], className)}
    />
  )
}
