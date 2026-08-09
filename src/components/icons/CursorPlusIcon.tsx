import cursorPlusLogo from "~/assets/cursor-plus-logo.svg"
import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/components/icons/iconSizes"
import { cn } from "~/lib/utils"

interface CursorPlusIconProps {
  size?: IconSize
  className?: string
}

/** Render the Cursor mark published by https://ccursor.cometix.dev/. */
export function CursorPlusIcon({
  size = "sm",
  className,
}: CursorPlusIconProps) {
  return (
    <img
      src={cursorPlusLogo}
      alt=""
      aria-hidden="true"
      className={cn(ICON_SIZE_CLASSNAME[size], className)}
      loading="lazy"
      decoding="async"
    />
  )
}
