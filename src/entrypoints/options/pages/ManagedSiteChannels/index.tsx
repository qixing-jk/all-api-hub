import { useCallback } from "react"

import { MENU_ITEM_IDS } from "~/constants/optionsMenuIds"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"
import { ManagedSiteChannelsRoute } from "~/features/ManagedSiteChannels"
import { navigateWithinOptionsPage } from "~/utils/navigation"

type ManagedSiteChannelsPageProps = {
  refreshKey?: number
  routeParams?: Record<string, string>
}

/** Options-page boundary that selects the site-type controller implementation. */
export default function ManagedSiteChannelsPage({
  refreshKey,
  routeParams,
}: ManagedSiteChannelsPageProps) {
  const { managedSiteType } = useUserPreferencesContext()
  const onReplaceRouteQuery = useCallback(
    (query: Record<string, string | undefined>) => {
      navigateWithinOptionsPage(
        `#${MENU_ITEM_IDS.MANAGED_SITE_CHANNELS}`,
        query,
      )
    },
    [],
  )

  return (
    <ManagedSiteChannelsRoute
      siteType={managedSiteType}
      refreshKey={refreshKey}
      routeParams={routeParams}
      onReplaceRouteQuery={onReplaceRouteQuery}
    />
  )
}
