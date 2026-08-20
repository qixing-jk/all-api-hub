import { ChannelTypeNames } from "~/constants/newApi"
import type { ResourceOperationOptions } from "~/services/apiAdapters/contracts/managedResourceNative"
import type { ManagedSiteChannel } from "~/types/managedSite"
import { normalizeList, parseDelimitedList } from "~/utils/core/string"

/** Preserves the caller's cancellation reason at provider-owned async boundaries. */
export const throwIfNewApiResourceOperationAborted = (
  options?: ResourceOperationOptions,
) => {
  if (options?.signal?.aborted) {
    throw options.signal.reason ?? new DOMException("Aborted", "AbortError")
  }
}

/** Parses New API comma-delimited fields with native-resource deduplication. */
export const parseNewApiResourceList = (value?: string | null) =>
  normalizeList(parseDelimitedList(value))

/** Collects the safe provider facts shared by display projection and local search. */
export const getNewApiResourceSearchData = (channel: ManagedSiteChannel) => {
  const models = parseNewApiResourceList(channel.models)
  const groups = parseNewApiResourceList(channel.group)
  const channelType = String(channel.type)

  return {
    models,
    groups,
    channelType,
    searchValues: [
      String(channel.id),
      channelType,
      ChannelTypeNames[channel.type as keyof typeof ChannelTypeNames] ??
        channelType,
      channel.base_url ?? "",
      ...models,
      ...groups,
    ],
  }
}
