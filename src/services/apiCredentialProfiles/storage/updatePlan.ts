import {
  coerceApiCredentialTelemetryConfig,
  coerceOptionalTimestamp,
  createNextConfig,
  dedupeProfiles,
  getIdentityKey,
  isSameTelemetryConfig,
  normalizeProfileBaseUrl,
  normalizeSourceUrl,
  normalizeTagIdList,
} from "~/services/apiCredentialProfiles/storage/configCodec"
import type { ApiCredentialProfileUpdateInput } from "~/services/apiCredentialProfiles/storage/contracts"
import { normalizeHeaderOverrides } from "~/services/apiTransport/headerOverrides"
import type {
  ApiCredentialProfile,
  ApiCredentialProfilesConfig,
} from "~/types/apiCredentialProfiles"
import { API_CREDENTIAL_PROFILE_LINK_STATES } from "~/types/apiCredentialProfiles"

/** Plans a credential edit and its dependent owner changes without writing storage. */
export function planApiCredentialProfileUpdate(
  config: ApiCredentialProfilesConfig,
  id: string,
  updates: ApiCredentialProfileUpdateInput,
) {
  const profiles = Array.isArray(config.profiles) ? config.profiles : []
  const current = profiles.find((p) => p.id === id)
  if (!current) {
    throw new Error("Profile not found.")
  }

  const nextName =
    typeof updates.name === "string" ? updates.name.trim() : current.name
  if (!nextName) {
    throw new Error("Profile name cannot be empty.")
  }

  const nextApiKey =
    typeof updates.apiKey === "string" ? updates.apiKey.trim() : current.apiKey
  if (!nextApiKey) {
    throw new Error("API key cannot be empty.")
  }

  const nextApiType =
    typeof updates.apiType === "string" ? updates.apiType : current.apiType

  const rawBaseUrl =
    typeof updates.baseUrl === "string" ? updates.baseUrl : current.baseUrl
  const nextBaseUrl = normalizeProfileBaseUrl(nextApiType, rawBaseUrl)
  if (!nextBaseUrl) {
    throw new Error("Base URL is invalid.")
  }

  const shouldReCoerceTelemetryConfig =
    updates.telemetryConfig !== undefined ||
    nextApiType !== current.apiType ||
    nextBaseUrl !== current.baseUrl
  const currentTelemetryConfig = coerceApiCredentialTelemetryConfig(
    current.telemetryConfig,
    { baseUrl: current.baseUrl },
  )
  const nextTelemetryConfig = shouldReCoerceTelemetryConfig
    ? coerceApiCredentialTelemetryConfig(
        updates.telemetryConfig !== undefined
          ? updates.telemetryConfig
          : current.telemetryConfig,
        { baseUrl: nextBaseUrl },
      )
    : currentTelemetryConfig
  const hasTelemetryConfigChanged = !isSameTelemetryConfig(
    nextTelemetryConfig,
    currentTelemetryConfig,
  )
  const nextRequestHeaders = normalizeHeaderOverrides(
    updates.requestHeaders ?? current.requestHeaders,
  )
  const hasRequestHeadersChanged =
    JSON.stringify(nextRequestHeaders) !==
    JSON.stringify(normalizeHeaderOverrides(current.requestHeaders))
  const nextExpiresAt =
    updates.expiresAt !== undefined
      ? coerceOptionalTimestamp(updates.expiresAt)
      : current.expiresAt
  const { expiresAt: _currentExpiresAt, ...currentWithoutExpiresAt } = current

  const next: ApiCredentialProfile = {
    ...currentWithoutExpiresAt,
    name: nextName,
    apiType: nextApiType,
    baseUrl: nextBaseUrl,
    apiKey: nextApiKey,
    ...(updates.requestHeaders !== undefined || current.requestHeaders
      ? { requestHeaders: nextRequestHeaders }
      : {}),
    tagIds:
      updates.tagIds !== undefined
        ? normalizeTagIdList(updates.tagIds)
        : current.tagIds,
    notes:
      typeof updates.notes === "string" ? updates.notes.trim() : current.notes,
    ...(typeof updates.sourceUrl === "string"
      ? {
          sourceUrl:
            updates.sourceUrl.trim() === ""
              ? undefined
              : normalizeSourceUrl(updates.sourceUrl) ?? current.sourceUrl,
        }
      : {}),
    ...(nextExpiresAt !== undefined ? { expiresAt: nextExpiresAt } : {}),
    telemetryConfig: nextTelemetryConfig,
    telemetrySnapshot:
      nextApiType !== current.apiType ||
      nextBaseUrl !== current.baseUrl ||
      nextApiKey !== current.apiKey ||
      hasTelemetryConfigChanged ||
      hasRequestHeadersChanged
        ? undefined
        : current.telemetrySnapshot,
    updatedAt: Date.now(),
  }

  const merged = profiles.map((p) => (p.id === id ? next : p))
  const { profiles: dedupedProfiles, profileIdRemap } = dedupeProfiles(merged)
  const hasCredentialIdentityChanged =
    nextApiType !== current.apiType ||
    nextBaseUrl !== current.baseUrl ||
    nextApiKey !== current.apiKey
  const links = config.links.map((link) => ({
    ...link,
    profileId: profileIdRemap.get(link.profileId) ?? link.profileId,
    state:
      hasCredentialIdentityChanged && link.profileId === id
        ? API_CREDENTIAL_PROFILE_LINK_STATES.NeedsConfirmation
        : link.state,
  }))
  const nextConfig = createNextConfig({
    current: config,
    profiles: dedupedProfiles,
    links,
    now: Date.now(),
  })

  const resolveSaved = (): ApiCredentialProfile => {
    const saved = dedupedProfiles.find((p) => p.id === id)
    if (saved) {
      return saved
    }

    // If dedupe merged this profile into another identity twin, return the
    // newest profile for that identity.
    const identityKey = getIdentityKey(next)
    const winner = dedupedProfiles.find(
      (p) => getIdentityKey(p) === identityKey,
    )
    if (winner) {
      return winner
    }

    return next
  }

  return {
    config: nextConfig,
    profile: resolveSaved(),
    reconciliation: {
      removeProfileIds:
        hasCredentialIdentityChanged || hasRequestHeadersChanged ? [id] : [],
      remapProfileIds: profileIdRemap,
    },
  }
}
