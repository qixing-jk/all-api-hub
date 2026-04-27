import axonHubLogo from "~/assets/axonhub-logo.jpg"
import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/components/icons/iconSizes"
import { cn } from "~/lib/utils"

interface AxonHubIconProps {
  size?: IconSize
}

/**
 * AxonHubIcon renders the AxonHub brand mark at a chosen size.
 */
export function AxonHubIcon({ size = "sm" }: AxonHubIconProps) {
  return (
    <img
      src={axonHubLogo}
      alt="AxonHub logo"
      className={cn(ICON_SIZE_CLASSNAME[size])}
      loading="lazy"
      decoding="async"
    />
  )
}
