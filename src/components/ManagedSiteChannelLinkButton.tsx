import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline"
import { useCallback } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "~/components/ui"
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
    <Button
      variant="link"
      className={className}
      onClick={handleClick}
      disabled={channelId == null && !search}
      aria-label={`${t("actions.manageChannel")}: ${channelName}`}
      rightIcon={
        <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
      }
    >
      <span className="truncate">{channelName}</span>
    </Button>
  )
}
