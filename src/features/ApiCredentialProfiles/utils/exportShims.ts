import {
  AuthTypeEnum,
  SiteHealthStatus,
  type ApiToken,
  type DisplaySiteData,
} from "~/types"
import type { ApiCredentialProfile } from "~/types/apiCredentialProfiles"

/**
 * Derive a stable numeric id from an arbitrary string.
 *
 * Used to adapt string-based profile ids to numeric ids expected by token-based
 * export dialogs (form ids, etc.).
 */
function stableStringHash(value: string) {
  let hash = 0
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0
  }
  return Math.abs(hash) || 1
}

/**
 * Build a DisplaySiteData shim from a credential profile for integrations that
 * expect an (account, token) pair (e.g. Cherry Studio / CC Switch exports).
 */
export function createExportAccount(
  profile: ApiCredentialProfile,
): DisplaySiteData {
  return {
    id: `api-credential-profile:${profile.id}`,
    name: profile.name,
    username: "api-credential-profile",
    balance: { USD: 0, CNY: 0 },
    todayConsumption: { USD: 0, CNY: 0 },
    todayIncome: { USD: 0, CNY: 0 },
    todayTokens: { upload: 0, download: 0 },
    health: { status: SiteHealthStatus.Healthy },
    siteType: "default",
    baseUrl: profile.baseUrl,
    token: "",
    userId: 0,
    notes: profile.notes,
    tagIds: profile.tagIds ?? [],
    authType: AuthTypeEnum.None,
    checkIn: {
      enableDetection: false,
    },
  }
}

/**
 * Build an ApiToken shim from a credential profile for integrations that
 * expect an (account, token) pair.
 */
export function createExportToken(profile: ApiCredentialProfile): ApiToken {
  const id = stableStringHash(profile.id)
  return {
    id,
    user_id: 0,
    key: profile.apiKey,
    status: 1,
    name: profile.name,
    created_time: profile.createdAt,
    accessed_time: profile.updatedAt,
    expired_time: 0,
    remain_quota: 0,
    unlimited_quota: true,
    used_quota: 0,
  }
}
