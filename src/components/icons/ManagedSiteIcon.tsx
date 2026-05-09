import { NewAPI } from "@lobehub/icons"

import { AxonHubIcon } from "~/components/icons/AxonHubIcon"
import { ClaudeCodeHubIcon } from "~/components/icons/ClaudeCodeHubIcon"
import { DoneHubIcon } from "~/components/icons/DoneHubIcon"
import { ICON_SIZE_CLASSNAME, IconSize } from "~/components/icons/iconSizes"
import { OctopusIcon } from "~/components/icons/OctopusIcon"
import { VeloeraIcon } from "~/components/icons/VeloeraIcon"
import { ManagedSiteType, SITE_TYPES } from "~/constants/siteType"
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
  if (siteType === SITE_TYPES.OCTOPUS) {
    return <OctopusIcon size={size} />
  }

  if (siteType === SITE_TYPES.VELOERA) {
    return <VeloeraIcon size={size} />
  }

  if (siteType === SITE_TYPES.DONE_HUB) {
    return <DoneHubIcon size={size} />
  }

  if (siteType === SITE_TYPES.AXON_HUB) {
    return <AxonHubIcon size={size} />
  }

  if (siteType === SITE_TYPES.CLAUDE_CODE_HUB) {
    return <ClaudeCodeHubIcon size={size} />
  }

  return <NewAPI.Color className={cn(ICON_SIZE_CLASSNAME[size])} />
}
