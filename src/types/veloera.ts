/** Fields consumed from Veloera's native channel inventory. */
type VeloeraChannelFields = {
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
  model_mapping: string
}

/**
 * Normalized inventory fields with all additional provider fields retained.
 * Veloera's channel model has no New API channel_info or settings fields.
 * @see https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/model/channel.go
 */
export type VeloeraChannel = VeloeraChannelFields & Record<string, unknown>

/** Raw provider detail before normalizing fields consumed by the product. */
export type VeloeraChannelRaw = Partial<
  Omit<VeloeraChannelFields, "id" | "status" | "priority" | "weight">
> & {
  id?: number | string
  status?: number | string
  priority?: number | string
  weight?: number | string
} & Record<string, unknown>

/** Veloera accepts a flat channel object when creating a resource. */
export type VeloeraCreateChannelPayload = Omit<
  Partial<VeloeraChannelFields>,
  "id"
> & { status: number } & Record<string, unknown>

/** Minimal channel update containing only fields intentionally changed by the editor. */
export type VeloeraUpdateChannelPayload = Partial<VeloeraChannelFields> & {
  id: number
} & Record<string, unknown>

export type VeloeraChannelListData = {
  items: VeloeraChannel[]
  total: number
  type_counts: Record<string, number>
}
