import ActionClickBehaviorSettings from "./ActionClickBehaviorSettings"
import AppearanceSettings from "./AppearanceSettings"
import ChangelogOnUpdateSettings from "./ChangelogOnUpdateSettings"
import DisplaySettings from "./DisplaySettings"
import LoggingSettings from "./LoggingSettings"
import ResetSettingsSection from "./ResetSettingsSection"
import TaskNotificationSettings from "./TaskNotificationSettings"

/**
 * General Basic Settings tab for everyday UI preferences, behavior, notifications,
 * maintenance preferences, diagnostics, and reset actions.
 */
export default function GeneralTab() {
  return (
    <div className="space-y-6">
      <DisplaySettings />
      <AppearanceSettings />
      <ActionClickBehaviorSettings />
      <TaskNotificationSettings />
      <ChangelogOnUpdateSettings />
      <LoggingSettings />
      <section id="dangerous-zone">
        <ResetSettingsSection />
      </section>
    </div>
  )
}
