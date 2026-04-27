import {
  AXON_HUB,
  DONE_HUB,
  NEW_API,
  OCTOPUS,
  VELOERA,
} from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"

import AxonHubSettings from "./AxonHubSettings"
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
      case AXON_HUB:
        return <AxonHubSettings />
      case NEW_API:
      default:
        return <NewApiSettings />
    }
  }

  return (
    <div className="space-y-6">
      <ManagedSiteSelector />

      {renderSiteSettings()}

      {/* AxonHub channel management is GraphQL-only and does not expose the
          New-API-style model sync or redirect controls. */}
      {managedSiteType !== AXON_HUB && (
        <>
          <ManagedSiteModelSyncSettings />
          <ModelRedirectSettings />
        </>
      )}
    </div>
  )
}
