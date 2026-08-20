import type {
  OctopusCreateChannelInput,
  OctopusFetchModelInput,
  OctopusUpdateChannelInput,
} from "~/types/octopus"

export const OCTOPUS_API_OPERATIONS = {
  ListChannels: "list-channels",
  CreateChannel: "create-channel",
  UpdateChannel: "update-channel",
  DeleteChannel: "delete-channel",
  FetchRemoteModels: "fetch-remote-models",
  ListAvailableModels: "list-available-models",
  ListGroups: "list-groups",
} as const

export type OctopusApiOperation =
  | { kind: typeof OCTOPUS_API_OPERATIONS.ListChannels }
  | {
      kind: typeof OCTOPUS_API_OPERATIONS.CreateChannel
      input: OctopusCreateChannelInput
    }
  | {
      kind: typeof OCTOPUS_API_OPERATIONS.UpdateChannel
      input: OctopusUpdateChannelInput
    }
  | {
      kind: typeof OCTOPUS_API_OPERATIONS.DeleteChannel
      channelId: number
    }
  | {
      kind: typeof OCTOPUS_API_OPERATIONS.FetchRemoteModels
      input: OctopusFetchModelInput
    }
  | { kind: typeof OCTOPUS_API_OPERATIONS.ListAvailableModels }
  | { kind: typeof OCTOPUS_API_OPERATIONS.ListGroups }

export interface OctopusNativeRequest {
  endpoint: string
  init: RequestInit
}
