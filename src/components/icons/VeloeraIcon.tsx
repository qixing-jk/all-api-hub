import veloeraLogo from "~/src/assets/veloera-logo.png"
import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/src/components/icons/iconSizes"
import { cn } from "~/src/lib/utils"

interface VeloeraIconProps {
  size?: IconSize
}

/**
 * VeloeraIcon renders the Veloera brand mark at a chosen size.
 */
export function VeloeraIcon({ size = "sm" }: VeloeraIconProps) {
  return (
    <img
      src={veloeraLogo}
      alt="Veloera logo"
      className={cn(ICON_SIZE_CLASSNAME[size])}
      loading="lazy"
      decoding="async"
    />
  )
}
