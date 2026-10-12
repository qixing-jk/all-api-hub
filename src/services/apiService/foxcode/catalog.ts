import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

import { FOXCODE_ENDPOINTS } from "./constants"
import { invalidFoxCodeResponse, readFoxCode } from "./transport"

export type FoxCodeChannel = {
  key: string
  name: string
  enabled: boolean
  models: string[]
  aliases: string[]
  quotaMultiplier?: number
  complexPricing: boolean
  protocols: string[]
}

/** Resolve catalog identity while preserving the native alias used for writes. */
export function findFoxCodeChannel(
  channels: readonly FoxCodeChannel[],
  channelKey: string | null,
): FoxCodeChannel | undefined {
  return channels.find(
    (channel) =>
      channel.key === channelKey ||
      channel.aliases.includes(String(channelKey)),
  )
}

/** Public native channel configuration owns binding choices and model visibility. */
export async function fetchChannels(
  request: ApiServiceRequest,
): Promise<FoxCodeChannel[]> {
  const endpoint = FOXCODE_ENDPOINTS.Channels
  const data = await readFoxCode(request, endpoint)
  const config = isRecord(data.config) ? data.config : data
  if (!Array.isArray(config.channels)) throw invalidFoxCodeResponse(endpoint)
  const seen = new Set<string>()
  return config.channels.map((item) => {
    if (
      !isRecord(item) ||
      typeof item.key !== "string" ||
      !item.key ||
      seen.has(item.key) ||
      !Array.isArray(item.models) ||
      item.models.some((id) => typeof id !== "string" || !id)
    )
      throw invalidFoxCodeResponse(endpoint)
    seen.add(item.key)
    const groups = Array.isArray(item.groupKeys)
      ? item.groupKeys
      : [item.groupKey]
    const name =
      typeof item.name === "string"
        ? item.name
        : isRecord(item.name) && typeof item.name["zh-CN"] === "string"
          ? item.name["zh-CN"]
          : item.key
    return {
      key: item.key,
      name,
      enabled: item.enabled !== false,
      models: item.models as string[],
      aliases: Array.isArray(item.aliases)
        ? item.aliases.filter((id): id is string => typeof id === "string")
        : [],
      quotaMultiplier:
        typeof item.quotaMultiplier === "number" &&
        Number.isFinite(item.quotaMultiplier) &&
        item.quotaMultiplier > 0
          ? item.quotaMultiplier
          : undefined,
      complexPricing:
        isRecord(item.groupOverrides) &&
        Object.keys(item.groupOverrides).length > 0,
      protocols: [
        ...(groups.includes("anthropic") ? ["anthropic"] : []),
        ...(groups.includes("openai") ? ["openai"] : []),
        ...(groups.includes("google") ? ["gemini"] : []),
      ],
    }
  })
}

/** Use the website's selected default inference route, never the account-console origin. */
export async function fetchInferenceOrigin(
  request: ApiServiceRequest,
): Promise<string> {
  const endpoint = FOXCODE_ENDPOINTS.InferenceOrigin
  const data = await readFoxCode(request, endpoint)
  if (!Array.isArray(data.endpoints) || typeof data.defaultKey !== "string")
    throw invalidFoxCodeResponse(endpoint)
  const entry = data.endpoints.find(
    (item) =>
      isRecord(item) && item.key === data.defaultKey && item.enabled !== false,
  )
  if (!isRecord(entry) || typeof entry.baseUrl !== "string")
    throw invalidFoxCodeResponse(endpoint)
  let url: URL
  try {
    url = new URL(entry.baseUrl)
  } catch {
    throw invalidFoxCodeResponse(endpoint)
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  )
    throw invalidFoxCodeResponse(endpoint)
  return url.href.replace(/\/+$/, "")
}
