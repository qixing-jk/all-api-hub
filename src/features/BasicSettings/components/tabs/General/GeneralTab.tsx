import ActionClickBehaviorSettings from "./ActionClickBehaviorSettings"
import AppearanceSettings from "./AppearanceSettings"
import ChangelogOnUpdateSettings from "./ChangelogOnUpdateSettings"
import DisplaySettings from "./DisplaySettings"
import LoggingSettings from "./LoggingSettings"
import ProductAnalyticsSettings from "./ProductAnalyticsSettings"
import ResetSettingsSection from "./ResetSettingsSection"
import SiteAnnouncementNotificationSettings from "./SiteAnnouncementNotificationSettings"

/**
 * General Basic Settings tab for everyday UI preferences, behavior,
 * site announcement polling, maintenance preferences, diagnostics, and reset actions.
 */
export default function GeneralTab() {
  return (
    <div className="space-y-6">
      <DisplaySettings />
      <AppearanceSettings />
      <ActionClickBehaviorSettings />
      <SiteAnnouncementNotificationSettings />
      <ChangelogOnUpdateSettings />
      <LoggingSettings />
      <ProductAnalyticsSettings />
      <section id="dangerous-zone">
        <ResetSettingsSection />
      </section>
    </div>
  )
}
