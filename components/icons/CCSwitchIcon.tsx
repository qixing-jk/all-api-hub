import ccSwitchLogo from "~/assets/cc-switch-logo.png"
import { cn } from "~/lib/utils"

import { ICON_SIZE_CLASSNAME, type IconSize } from "./iconSizes"

interface CCSwitchIconProps {
  size?: IconSize
}

/**
 * CCSwitchIcon renders the CC Switch brand mark at a chosen size.
 */
export function CCSwitchIcon({ size = "sm" }: CCSwitchIconProps) {
  return (
    <img
      src={ccSwitchLogo}
      alt="CC Switch logo"
      className={cn(ICON_SIZE_CLASSNAME[size])}
      loading="lazy"
      decoding="async"
    />
  )
}
