import kelivoLogo from "~/assets/kelivo-logo.png"
import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/components/icons/iconSizes"
import { cn } from "~/lib/utils"

interface KelivoIconProps {
  size?: IconSize
}

/**
 * KelivoIcon renders the Kelivo brand mark at a chosen size.
 */
export function KelivoIcon({ size = "sm" }: KelivoIconProps) {
  return (
    <img
      src={kelivoLogo}
      alt="Kelivo logo"
      className={cn(ICON_SIZE_CLASSNAME[size])}
      loading="lazy"
      decoding="async"
    />
  )
}
