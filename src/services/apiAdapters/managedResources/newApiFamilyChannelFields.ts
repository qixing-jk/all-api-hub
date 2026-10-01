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
  /**
   * Provider-side JSON blob. The gateway records `status_reason` and
   * `status_time` here when it disables a channel, and its own channel list
   * shows that reason in the status tooltip.
   * https://github.com/QuantumNous/new-api/blob/f116414284162ad15d8925f7bca494c109b83e93/model/channel.go
   */
  other_info?: string
}
