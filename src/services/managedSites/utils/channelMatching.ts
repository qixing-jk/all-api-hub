import type { ManagedSiteChannel } from "~/types/managedSite"
import { isArraysEqual } from "~/utils"
import { normalizeList, parseDelimitedList } from "~/utils/core/string"

interface FindManagedSiteChannelByComparableInputsParams {
  channels: ManagedSiteChannel[]
  accountBaseUrl: string
  models: string[]
  key?: string
}

interface FindManagedSiteChannelByBaseUrlParams {
  channels: ManagedSiteChannel[]
  accountBaseUrl: string
}

interface FindManagedSiteChannelsByBaseUrlAndModelsParams {
  channels: ManagedSiteChannel[]
  accountBaseUrl: string
  models: string[]
}

/**
 * Filters managed-site channels by normalized base URL and models.
 */
export function findManagedSiteChannelsByBaseUrlAndModels(
  params: FindManagedSiteChannelsByBaseUrlAndModelsParams,
): ManagedSiteChannel[] {
  const { channels, accountBaseUrl, models } = params
  const normalizedDesiredModels = normalizeList(models)

  return channels.filter((channel) => {
    if (channel.base_url !== accountBaseUrl) {
      return false
    }

    return isArraysEqual(
      parseDelimitedList(channel.models),
      normalizedDesiredModels,
    )
  })
}

/**
 * Finds a managed-site channel using the same comparable inputs used by the
 * existing import-time duplicate checks.
 */
export function findManagedSiteChannelByComparableInputs(
  params: FindManagedSiteChannelByComparableInputsParams,
): ManagedSiteChannel | null {
  const { channels, accountBaseUrl, models, key } = params
  const normalizedDesiredKey = (key ?? "").trim()
  const shouldMatchKey = normalizedDesiredKey.length > 0
  const comparableChannels = findManagedSiteChannelsByBaseUrlAndModels({
    channels,
    accountBaseUrl,
    models,
  })

  return (
    comparableChannels.find((channel) => {
      if (!shouldMatchKey) {
        return true
      }

      const candidates = (channel.key ?? "")
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean)

      return candidates.includes(normalizedDesiredKey)
    }) ?? null
  )
}

/**
 * Finds a managed-site channel by normalized base URL only.
 */
export function findManagedSiteChannelByBaseUrl(
  params: FindManagedSiteChannelByBaseUrlParams,
): ManagedSiteChannel | null {
  const { channels, accountBaseUrl } = params

  return channels.find((channel) => channel.base_url === accountBaseUrl) ?? null
}
