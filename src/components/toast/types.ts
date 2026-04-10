export interface WarningToastAction {
  label: string
  onClick: () => void | Promise<void>
}
