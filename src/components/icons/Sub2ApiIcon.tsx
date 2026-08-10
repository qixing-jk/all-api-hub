import sub2ApiLogo from "~/assets/sub2api-logo.svg"
import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/components/icons/iconSizes"
import { cn } from "~/lib/utils"

interface Sub2ApiIconProps {
  size?: IconSize
}

/** Sub2ApiIcon renders the Sub2API brand mark at a chosen size. */
export function Sub2ApiIcon({ size = "sm" }: Sub2ApiIconProps) {
  return (
    <img
      src={sub2ApiLogo}
      alt="Sub2API logo"
      className={cn(ICON_SIZE_CLASSNAME[size])}
      loading="lazy"
      decoding="async"
    />
  )
}
