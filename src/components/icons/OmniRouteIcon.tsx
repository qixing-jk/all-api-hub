import omniRouteLogo from "~/assets/omniroute-logo.svg"
import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/components/icons/iconSizes"
import { cn } from "~/lib/utils"

interface OmniRouteIconProps {
  size?: IconSize
}

/**
 * OmniRouteIcon renders the OmniRoute brand mark at a chosen size.
 *
 * The mark is the gateway's own app icon, vendored from the MIT-licensed
 * upstream repository: https://github.com/diegosouzapw/OmniRoute/blob/release/v3.8.51/public/icon-192.svg
 */
export function OmniRouteIcon({ size = "sm" }: OmniRouteIconProps) {
  return (
    <img
      src={omniRouteLogo}
      alt="OmniRoute logo"
      className={cn(ICON_SIZE_CLASSNAME[size])}
      loading="lazy"
      decoding="async"
    />
  )
}
