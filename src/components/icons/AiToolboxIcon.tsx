import aiToolboxLogo from "~/assets/ai-toolbox-logo.png"
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
 * AiToolboxIcon renders the AI Toolbox brand mark at a chosen size.
 * Source: https://github.com/coulsontl/ai-toolbox (tauri/icons/128x128.png).
 */
export function AiToolboxIcon({ size = "sm", className }: AiToolboxIconProps) {
  return (
    <img
      src={aiToolboxLogo}
      alt="AI Toolbox logo"
      className={cn(ICON_SIZE_CLASSNAME[size], className)}
      loading="lazy"
      decoding="async"
    />
  )
}
