import type {
  RelayForAnnouncement,
  RelayForCheckInCampaign,
  RelayForCheckInClaimResult,
  RelayForModelListResponse,
  RelayForOverview,
  RelayForToken,
  RelayForUser,
} from "~/services/apiService/relayfor/type"

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const toOptionalFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return undefined
}

export const toFiniteNumber = (value: unknown, fallback = 0): number =>
  toOptionalFiniteNumber(value) ?? fallback

export const toOptionalString = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed ? trimmed : undefined
  }
  return undefined
}

export const toStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean)
}

/** Native IP/model restrictions accept an array or comma/newline-separated text. */
export const readRelayForStringList = (value: unknown): string[] =>
  toStringArray(typeof value === "string" ? value.split(/[\n,]/) : value)

export const isRelayForUser = (value: unknown): value is RelayForUser => {
  if (!isRecord(value)) return false
  return typeof value.id === "number" && typeof value.username === "string"
}

export const isRelayForOverview = (
  value: unknown,
): value is RelayForOverview => {
  if (!isRecord(value)) return false
  return (
    isRelayForUser(value.user) &&
    typeof value.user.quota === "number" &&
    Number.isFinite(value.user.quota) &&
    isRecord(value.today)
  )
}

export const isRelayForToken = (value: unknown): value is RelayForToken => {
  if (!isRecord(value)) return false
  return (
    typeof value.id === "number" &&
    typeof value.name === "string" &&
    typeof value.key === "string"
  )
}

export const isRelayForTokenList = (
  value: unknown,
): value is RelayForToken[] => {
  if (!Array.isArray(value)) return false
  return value.every(isRelayForToken)
}

export const isRelayForModelList = (
  value: unknown,
): value is RelayForModelListResponse => {
  if (!isRecord(value)) return false
  return Array.isArray(value.items)
}

export const isRelayForCheckInCampaignList = (
  value: unknown,
): value is RelayForCheckInCampaign[] => {
  if (!Array.isArray(value)) return false
  return value.every(
    (item) =>
      isRecord(item) && item.id !== undefined && item.name !== undefined,
  )
}

export const isRelayForCheckInClaimResult = (
  value: unknown,
): value is RelayForCheckInClaimResult => {
  if (!isRecord(value)) return false
  return typeof value.is_makeup === "boolean"
}

export const isRelayForAnnouncement = (
  value: unknown,
): value is RelayForAnnouncement => {
  if (!isRecord(value)) return false
  return (
    (value.title === undefined || typeof value.title === "string") &&
    typeof value.content === "string"
  )
}
