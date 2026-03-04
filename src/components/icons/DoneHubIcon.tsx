import doneHubLogo from "~/src/assets/done-hub-logo.png"
import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/src/components/icons/iconSizes"
import { cn } from "~/src/lib/utils"

interface DoneHubIconProps {
  size?: IconSize
}

/**
 * DoneHubIcon renders the DoneHub brand mark at a chosen size.
 */
export function DoneHubIcon({ size = "sm" }: DoneHubIconProps) {
  return (
    <img
      src={doneHubLogo}
      alt="DoneHub logo"
      className={cn(ICON_SIZE_CLASSNAME[size])}
      loading="lazy"
      decoding="async"
    />
  )
}
