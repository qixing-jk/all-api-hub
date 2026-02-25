import ldohLogo from "~/assets/ldoh-logo.svg"
import { cn } from "~/lib/utils"

import { ICON_SIZE_CLASSNAME, type IconSize } from "./iconSizes"

interface LdohIconProps {
  size?: IconSize
}

/**
 * LdohIcon renders the LDOH brand mark at a chosen size.
 */
export function LdohIcon({ size = "sm" }: LdohIconProps) {
  return (
    <img
      src={ldohLogo}
      alt="LDOH logo"
      className={cn(ICON_SIZE_CLASSNAME[size])}
      loading="lazy"
      decoding="async"
    />
  )
}
