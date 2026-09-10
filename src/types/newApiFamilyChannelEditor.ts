/** Editable fields shared by the native New API, Veloera, and DoneHub editors. */
export interface NewApiFamilyChannelCommand {
  name: string
  type: number | string
  key: string
  base_url: string
  models: string[]
  groups: string[]
  priority: number
  weight: number
  /** Provider-native status, including unchanged future upstream values. */
  status: number
}
