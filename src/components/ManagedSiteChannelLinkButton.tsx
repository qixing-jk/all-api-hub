import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline"
import { useCallback } from "react"

import { Button } from "~/components/ui"
import { openManagedSiteChannelsForChannel } from "~/utils/navigation"

interface ManagedSiteChannelLinkButtonProps {
  channelId: number
  channelName: string
  className?: string
}

/**
 * A link-style button that opens channel management filtered to a channel ID.
 */
export default function ManagedSiteChannelLinkButton({
  channelId,
  channelName,
  className,
}: ManagedSiteChannelLinkButtonProps) {
  const handleClick = useCallback(async () => {
    await openManagedSiteChannelsForChannel(channelId)
  }, [channelId])

  return (
    <Button
      variant="link"
      className={className}
      onClick={handleClick}
      aria-label={`Manage channel ${channelName}`}
      rightIcon={
        <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
      }
    >
      <span className="truncate">{channelName}</span>
    </Button>
  )
}
