import ldohLogo from "~/src/assets/ldoh-logo.svg"
import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/src/components/icons/iconSizes"
import { cn } from "~/src/lib/utils"

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
