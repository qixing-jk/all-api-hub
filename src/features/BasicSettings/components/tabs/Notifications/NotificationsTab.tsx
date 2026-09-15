import TaskNotificationSettings from "./TaskNotificationSettings"

/**
 * Notification settings tab for scheduled task alerts.
 */
export default function NotificationsTab() {
  return (
    <div className="space-y-density-6">
      <TaskNotificationSettings />
    </div>
  )
}
