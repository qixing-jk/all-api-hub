import RefreshSettings from "./RefreshSettings"
import ShieldSettings from "./ShieldSettings"

export default function AutoRefreshTab() {
  return (
    <div className="space-y-6">
      <section id="auto-refresh">
        <RefreshSettings />
      </section>
      <section id="shield-settings">
        <ShieldSettings />
      </section>
    </div>
  )
}
