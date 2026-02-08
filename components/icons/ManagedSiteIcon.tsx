import { NewAPI } from "@lobehub/icons"

import { ICON_SIZE_CLASSNAME, IconSize } from "~/components/icons/iconSizes"
import { OctopusIcon } from "~/components/icons/OctopusIcon"
import { VeloeraIcon } from "~/components/icons/VeloeraIcon"
import type { ManagedSiteType } from "~/constants/siteType"
import { OCTOPUS, VELOERA } from "~/constants/siteType"
import { cn } from "~/lib/utils"

interface ManagedSiteIconProps {
  siteType: ManagedSiteType
  size?: IconSize
}

/**
 * ManagedSiteIcon renders the correct brand icon for the selected managed site type.
 */
export function ManagedSiteIcon({
  siteType,
  size = "sm",
}: ManagedSiteIconProps) {
  if (siteType === OCTOPUS) {
    return <OctopusIcon size={size} />
  }

  if (siteType === VELOERA) {
    return <VeloeraIcon size={size} />
  }

  return <NewAPI.Color className={cn(ICON_SIZE_CLASSNAME[size])} />
}
