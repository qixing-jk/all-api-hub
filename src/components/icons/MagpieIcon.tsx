import magpieLogo from "~/assets/magpie-logo.svg"
import {
  ICON_SIZE_CLASSNAME,
  type IconSize,
} from "~/components/icons/iconSizes"
import { cn } from "~/lib/utils"

/** Official MIT-licensed Magpie mark; attribution is retained in the asset. */
export function MagpieIcon({ size = "sm" }: { size?: IconSize }) {
  return (
    <img
      src={magpieLogo}
      alt="MAGPIE logo"
      className={cn(ICON_SIZE_CLASSNAME[size], "dark:invert")}
      loading="lazy"
      decoding="async"
    />
  )
}
