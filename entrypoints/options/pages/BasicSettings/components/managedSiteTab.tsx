import { DONE_HUB, NEW_API, OCTOPUS, VELOERA } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"

import DoneHubSettings from "./DoneHubSettings"
import ManagedSiteModelSyncSettings from "./managedSiteModelSyncSettings"
import ManagedSiteSelector from "./ManagedSiteSelector"
import ModelRedirectSettings from "./ModelRedirectSettings"
import NewApiSettings from "./NewApiSettings"
import OctopusSettings from "./OctopusSettings"
import VeloeraSettings from "./VeloeraSettings"

/**
 * Basic Settings tab aggregating managed site selector, managed site settings,
 * model sync, and model redirect.
 */
export default function ManagedSiteTab() {
  const { managedSiteType } = useUserPreferencesContext()

  const renderSiteSettings = () => {
    switch (managedSiteType) {
      case OCTOPUS:
        return <OctopusSettings />
      case DONE_HUB:
        return <DoneHubSettings />
      case VELOERA:
        return <VeloeraSettings />
      case NEW_API:
      default:
        return <NewApiSettings />
    }
  }

  return (
    <div className="space-y-6">
      <ManagedSiteSelector />

      {renderSiteSettings()}

      <ManagedSiteModelSyncSettings />

      <ModelRedirectSettings />
    </div>
  )
}
