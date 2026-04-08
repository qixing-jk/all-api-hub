import { useCallback } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionButton } from "~/components/ui"
import {
  openManagedSiteChannelsForChannel,
  openManagedSiteChannelsPage,
} from "~/utils/navigation"

interface ManagedSiteChannelLinkButtonProps {
  channelName: string
  channelId?: number
  search?: string
  className?: string
}

/**
 * A link-style button that opens channel management filtered to a channel ID.
 */
export default function ManagedSiteChannelLinkButton({
  channelName,
  channelId,
  search,
  className,
}: ManagedSiteChannelLinkButtonProps) {
  const { t } = useTranslation(["managedSiteModelSync"])

  const handleClick = useCallback(async () => {
    if (channelId != null) {
      await openManagedSiteChannelsForChannel(channelId)
      return
    }

    if (search) {
      await openManagedSiteChannelsPage({ search })
    }
  }, [channelId, search])

  return (
    <WorkflowTransitionButton
      variant="link"
      className={className}
      onClick={handleClick}
      disabled={channelId == null && !search}
      aria-label={`${t("managedSiteModelSync:execution.table.manageChannel")}: ${channelName}`}
    >
      <span className="truncate">{channelName}</span>
    </WorkflowTransitionButton>
  )
}
