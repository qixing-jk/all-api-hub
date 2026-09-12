import type { NewApiFamilyChannelCommand } from "~/types/newApiFamilyChannelEditor"

/** Only edited advanced fields are carried to the latest-detail update planner. */
export type DoneHubChannelCommand = NewApiFamilyChannelCommand & {
  advanced?: Partial<{
    compatible_response: boolean
    responses_path: string
    model_mapping: string
    proxy: string
    test_model: string
    model_headers: string
    custom_parameter: string
    allow_extra_body: boolean
    disabled_stream: string[]
  }>
}

/** Fields consumed from DoneHub's native channel inventory. */
type DoneHubChannelFields = {
  id: number
  type: number
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

/** Normalized inventory fields with all additional provider fields retained. */
export type DoneHubChannel = DoneHubChannelFields & Record<string, unknown>

/** Raw detail is retained for DoneHub's full-object updates. */
export type DoneHubChannelRaw = Partial<
  Omit<DoneHubChannelFields, "id" | "type" | "status" | "priority" | "weight">
> & {
  id?: number | string
  type?: number | string
  status?: number | string
  priority?: number | string
  weight?: number | string
} & Record<string, unknown>

export type DoneHubChannelListData = {
  items: DoneHubChannel[]
  total: number
  type_counts: Record<string, number>
}

/** Flat native create payload; DoneHub does not use New API's mode wrapper. */
export type DoneHubCreateChannelPayload = Omit<
  Partial<DoneHubChannelFields>,
  "id"
> & { status: number } & Record<string, unknown>

export type DoneHubUpdateChannelPayload = Partial<DoneHubChannelFields> & {
  id: number
} & Record<string, unknown>
