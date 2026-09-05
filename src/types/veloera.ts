import type { ManagedSiteChannel, UpdateChannelPayload } from "./managedSite"

/**
 * Provider-owned Veloera fields that are not part of New API's channel shape.
 * @see https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/model/channel.go
 */
export type VeloeraManagedSiteChannel = ManagedSiteChannel & {
  model_prefix?: string | null
  system_prompt?: string | null
}

/** Veloera accepts its provider-owned fields on full channel updates. */
export type VeloeraUpdateChannelPayload = UpdateChannelPayload &
  Partial<Pick<VeloeraManagedSiteChannel, "model_prefix" | "system_prompt">>
