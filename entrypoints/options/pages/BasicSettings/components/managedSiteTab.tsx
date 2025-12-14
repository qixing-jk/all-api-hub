import { NEW_API } from "~/constants/siteType"
import { useUserPreferencesContext } from "~/contexts/UserPreferencesContext"

import ManagedSiteModelSyncSettings from "./managedSiteModelSyncSettings"
import ManagedSiteSelector from "./ManagedSiteSelector"
import ModelRedirectSettings from "./ModelRedirectSettings"
import NewApiSettings from "./NewApiSettings"
import VeloeraSettings from "./VeloeraSettings"

/**
 * Basic Settings tab aggregating managed site selector, New API/Veloera settings,
 * model sync, and model redirect.
 */
export default function ManagedSiteTab() {
  const { managedSiteType } = useUserPreferencesContext()

  return (
    <div className="space-y-6">
      <section id="managed-site-selector">
        <ManagedSiteSelector />
      </section>

      {managedSiteType === NEW_API ? (
        <section id="new-api">
          <NewApiSettings />
        </section>
      ) : (
        <section id="veloera">
          <VeloeraSettings />
        </section>
      )}

      <section id="new-api-model-sync">
        <ManagedSiteModelSyncSettings />
      </section>

      <section id="model-redirect">
        <ModelRedirectSettings />
      </section>
    </div>
  )
}
