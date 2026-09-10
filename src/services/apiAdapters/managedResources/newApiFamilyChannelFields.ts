/** Fields shared by the New API, Veloera, and DoneHub editors and display policies. */
export interface NewApiFamilyChannelFields {
  id: number
  type: number | string
  name: string
  key: string
  base_url: string
  models: string
  group: string
  status: number
  priority: number
  weight: number
}
