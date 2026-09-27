import ActionClickBehaviorSettings from "./ActionClickBehaviorSettings"
import AppearanceSettings from "./AppearanceSettings"
import ChangelogOnUpdateSettings from "./ChangelogOnUpdateSettings"
import DisplaySettings from "./DisplaySettings"
import LoggingSettings from "./LoggingSettings"
import ProductAnalyticsSettings from "./ProductAnalyticsSettings"
import ResetSettingsSection from "./ResetSettingsSection"

/**
 * General Basic Settings tab for everyday UI preferences, behavior,
 * maintenance preferences, diagnostics, and reset actions.
 */
export default function GeneralTab() {
  return (
    <div className="space-y-density-6">
      <DisplaySettings />
      <AppearanceSettings />
      <ActionClickBehaviorSettings />
      <ChangelogOnUpdateSettings />
      <LoggingSettings />
      <ProductAnalyticsSettings />
      <section id="dangerous-zone">
        <ResetSettingsSection />
      </section>
    </div>
  )
}
