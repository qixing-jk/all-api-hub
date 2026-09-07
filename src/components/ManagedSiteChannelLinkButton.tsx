import { useCallback } from "react"
import { useTranslation } from "react-i18next"

import { WorkflowTransitionButton } from "~/components/ui"
import type { ManagedResourceRef } from "~/services/apiAdapters/contracts/managedResourceNative"
import { openManagedSiteChannelsPage } from "~/utils/navigation"

interface ManagedSiteChannelLinkButtonProps {
  channelName: string
  resourceRef?: ManagedResourceRef
  search?: string
  className?: string
  testId?: string
}

/**
 * Opens channel management with a scoped resource reference or search filter.
 */
export default function ManagedSiteChannelLinkButton({
  channelName,
  resourceRef,
  search,
  className,
  testId,
}: ManagedSiteChannelLinkButtonProps) {
  const { t } = useTranslation(["managedSiteModelSync"])

  const handleClick = useCallback(async () => {
    if (resourceRef) {
      await openManagedSiteChannelsPage({ resourceRef })
      return
    }
    if (search) {
      await openManagedSiteChannelsPage({ search })
    }
  }, [resourceRef, search])

  return (
    <WorkflowTransitionButton
      variant="link"
      className={className}
      onClick={handleClick}
      disabled={!resourceRef && !search}
      aria-label={`${t("managedSiteModelSync:execution.table.manageChannel")}: ${channelName}`}
      data-testid={testId}
    >
      <span className="truncate">{channelName}</span>
    </WorkflowTransitionButton>
  )
}
