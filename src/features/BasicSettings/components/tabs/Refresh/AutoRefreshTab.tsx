import ShieldSettings from "~/features/BasicSettings/components/tabs/Refresh/protectionBypass/ShieldSettings"

import RefreshSettings from "./RefreshSettings"

/**
 * Basic Settings tab section combining auto-refresh and shield settings subpanels.
 */
export default function AutoRefreshTab() {
  return (
    <div className="space-y-density-6">
      <section id="auto-refresh">
        <RefreshSettings />
      </section>
      <ShieldSettings />
    </div>
  )
}
