/**
 * gpt-load credential boundary.
 *
 * The group credential list is always masked (`mask: "sk-p…0001"`), so every
 * projection built here drops the value entirely and keeps only a secret
 * state. The one plaintext read this integration performs is the explicit
 * per-row `POST .../reveal` in `groups.ts`, always driven by a user action.
 */

import { hasUsableManagedSiteChannelKey } from "~/services/managedSites/utils/channelKeys"
import type { GptLoadGroup } from "~/types/gptLoad"

export const GPT_LOAD_SECRET_STATES = {
  Available: "available",
  Masked: "masked",
  Unavailable: "unavailable",
} as const

export type GptLoadSecretState =
  (typeof GPT_LOAD_SECRET_STATES)[keyof typeof GPT_LOAD_SECRET_STATES]

/**
 * A group reduced to secret-free display facts.
 *
 * There is deliberately no field for credential values: `secretState` is the
 * only thing that crosses this boundary.
 */
export interface GptLoadSanitizedGroup {
  id: number
  name: string
  channelId: string
  channelName: string
  baseUrl: string
  enabled: boolean
  /** Classic-route status or modern-route availability, as reported. */
  status: string
  models: readonly string[]
  modelCount: number
  credentialCount: number
  priceMultiplier: string
  weight: number | null
  secretState: GptLoadSecretState
}

const readString = (value: unknown): string =>
  typeof value === "string" ? value.trim() : ""

/** Reads the group's channel-level base URL param, when the channel has one. */
export function readGptLoadGroupBaseUrl(group: GptLoadGroup): string {
  const params = group.params
  if (typeof params !== "object" || params === null) return ""
  return readString((params as Record<string, unknown>).base_url)
}

/** Counts the credentials a list row reports without reading any of them. */
function readCredentialCount(group: GptLoadGroup): number {
  const counts = group.credential_counts
  if (counts && typeof counts.total === "number") return counts.total
  const credentials = group.credentials
  if (
    typeof credentials === "object" &&
    credentials !== null &&
    typeof (credentials as { total?: unknown }).total === "number"
  ) {
    return (credentials as { total: number }).total
  }
  return 0
}

/** Classifies a group's credential state without retaining any value. */
function toGptLoadSecretState(
  count: number,
  maskedSample: string,
): GptLoadSecretState {
  if (count <= 0) return GPT_LOAD_SECRET_STATES.Unavailable
  if (!maskedSample) return GPT_LOAD_SECRET_STATES.Masked
  return hasUsableManagedSiteChannelKey(maskedSample)
    ? GPT_LOAD_SECRET_STATES.Available
    : GPT_LOAD_SECRET_STATES.Masked
}

/**
 * Reduces a raw group to secret-free display facts.
 *
 * `maskedSample` is the gateway's masked representation when the caller already
 * read the credential page; the list projection normally has only a count, in
 * which case the state is `masked` (never `available`).
 */
export function toGptLoadSanitizedGroup(
  group: GptLoadGroup,
  maskedSample = "",
): GptLoadSanitizedGroup {
  const models = Array.isArray(group.model_names)
    ? group.model_names.filter(
        (value): value is string => typeof value === "string" && !!value.trim(),
      )
    : []
  const credentialCount = readCredentialCount(group)
  const status = readString(group.status) || readString(group.availability)

  return {
    id: group.id,
    name: readString(group.name),
    channelId: readString(group.channel_id),
    channelName: readString(group.channel_name),
    baseUrl: readGptLoadGroupBaseUrl(group) || readString(group.endpoint),
    enabled: group.enabled !== false,
    status,
    models,
    modelCount:
      typeof group.model_count === "number" ? group.model_count : models.length,
    credentialCount,
    priceMultiplier: readString(group.price_multiplier) || "1",
    weight: typeof group.weight === "number" ? group.weight : null,
    secretState: toGptLoadSecretState(credentialCount, maskedSample),
  }
}
