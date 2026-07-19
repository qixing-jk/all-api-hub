export interface WarningToastAction {
  label: string
  pendingLabel?: string
  onClick: () => void | Promise<void>
}
