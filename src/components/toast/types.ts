export interface NotificationAction {
  label: string
  pendingLabel?: string
  onClick: () => void | Promise<void>
}
