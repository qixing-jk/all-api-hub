import { SITE_TYPES } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"

import AxonHubSettings from "./AxonHubSettings"
import ClaudeCodeHubSettings from "./ClaudeCodeHubSettings"
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
      case SITE_TYPES.OCTOPUS:
        return <OctopusSettings />
      case SITE_TYPES.DONE_HUB:
        return <DoneHubSettings />
      case SITE_TYPES.VELOERA:
        return <VeloeraSettings />
      case SITE_TYPES.AXON_HUB:
        return <AxonHubSettings />
      case SITE_TYPES.CLAUDE_CODE_HUB:
        return <ClaudeCodeHubSettings />
      case SITE_TYPES.NEW_API:
      default:
        return <NewApiSettings />
    }
  }

  return (
    <div className="space-y-6">
      <ManagedSiteSelector />

      {renderSiteSettings()}

      {/* AxonHub and Claude Code Hub do not expose New-API-style model sync or
          redirect controls. */}
      {managedSiteType !== SITE_TYPES.AXON_HUB &&
        managedSiteType !== SITE_TYPES.CLAUDE_CODE_HUB && (
          <>
            <ManagedSiteModelSyncSettings />
            <ModelRedirectSettings />
          </>
        )}
    </div>
  )
}
