import OctopusLogo from "~/assets/OctopusLogo.png"
import { ICON_SIZE_CLASSNAME, IconSize } from "~/components/icons/iconSizes"
import { cn } from "~/lib/utils"

interface OctopusIconProps {
  size?: IconSize
  className?: string
}

/**
 * Octopus icon for the Octopus managed site type.
 * Uses the official Octopus logo.
 */
export function OctopusIcon({ size = "sm", className }: OctopusIconProps) {
  return (
    <img
      src={OctopusLogo}
      alt="Octopus"
      className={cn(
        ICON_SIZE_CLASSNAME[size],
        "inline-flex items-center justify-center object-contain",
        className,
      )}
    />
  )
}
