import { SITE_TYPES } from "~/constants/siteType"
import { getApiService } from "~/services/apiService"
import { API_ERROR_CODES } from "~/services/apiService/common/errors"
import type { CreateTokenRequest } from "~/services/apiService/common/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { DisplaySiteData, SiteAccount } from "~/types"
import type {
  AccountKeyRepairDeleteInvalidTokensResult,
  AccountKeyRepairInvalidToken,
} from "~/types/accountKeyAutoProvisioning"
import { t } from "~/utils/i18n/core"

import {
  DEFAULT_AUTO_PROVISION_TOKEN_NAME,
  generateDefaultTokenRequest,
} from "./ensureDefaultToken"

interface AccountKeyCoverageResult {
  created: boolean
  availableGroups: string[]
  coveredGroups: string[]
  createdGroups: string[]
  missingGroups: string[]
  invalidTokens: AccountKeyRepairInvalidToken[]
}

const normalizeGroupName = (value: unknown) =>
  typeof value === "string" ? value.trim() : ""

const isFeatureUnsupportedError = (error: unknown) =>
  !!error &&
  typeof error === "object" &&
  "code" in error &&
  (error as { code?: unknown }).code === API_ERROR_CODES.FEATURE_UNSUPPORTED

/**
 * Builds the default auto-provision token payload for one user group.
 */
export function buildGroupDefaultTokenRequest(
  group: string,
): CreateTokenRequest {
  return {
    ...generateDefaultTokenRequest(),
    name:
      group && group !== "default"
        ? `${group} group (auto)`
        : DEFAULT_AUTO_PROVISION_TOKEN_NAME,
    group,
  }
}

/**
 * Builds the normalized API-service request for account key audit calls.
 *
 * This helper accepts the stored account too so repair fallback paths can still
 * build a request when display data is missing URL/id fields.
 */
function createAccountApiRequest(
  account: SiteAccount,
  displaySiteData: DisplaySiteData,
): ApiServiceRequest {
  return {
    baseUrl: displaySiteData.baseUrl || account.site_url,
    accountId: displaySiteData.id || account.id,
    auth: {
      authType: displaySiteData.authType,
      userId: displaySiteData.userId,
      accessToken: displaySiteData.token,
      cookie: displaySiteData.cookieAuthSessionCookie,
    },
  }
}

/**
 * Ensures one account has API keys for every currently available user group.
 */
export async function ensureAccountKeysForAvailableGroups(params: {
  account: SiteAccount
  displaySiteData: DisplaySiteData
  accountName: string
  siteUrlOrigin: string
}): Promise<AccountKeyCoverageResult> {
  const { account, displaySiteData, accountName, siteUrlOrigin } = params
  const service = getApiService(displaySiteData.siteType)
  const request = createAccountApiRequest(account, displaySiteData)

  const tokens = await service.fetchAccountTokens(request)
  let groups: string[]

  try {
    const groupsData = await service.fetchUserGroups(request)
    groups = Object.keys(groupsData).map(normalizeGroupName).filter(Boolean)
  } catch (error) {
    if (!isFeatureUnsupportedError(error)) {
      throw error
    }
    groups = []
  }

  const uniqueGroups = Array.from(new Set(groups))

  if (uniqueGroups.length === 0) {
    if (tokens.length > 0) {
      return {
        created: false,
        availableGroups: [],
        coveredGroups: [],
        createdGroups: [],
        missingGroups: [],
        invalidTokens: [],
      }
    }

    if (displaySiteData.siteType === SITE_TYPES.SUB2API) {
      throw new Error(t("messages:sub2api.createRequiresGroup"))
    }

    if (displaySiteData.siteType === SITE_TYPES.AIHUBMIX) {
      throw new Error(t("messages:aihubmix.createRequiresOneTimeKeyDialog"))
    }

    await service.createApiToken(request, generateDefaultTokenRequest())
    return {
      created: true,
      availableGroups: [],
      coveredGroups: [],
      createdGroups: [""],
      missingGroups: [],
      invalidTokens: [],
    }
  }

  const availableGroupSet = new Set(uniqueGroups)
  const coveredGroupSet = new Set<string>()
  const invalidTokens: AccountKeyRepairInvalidToken[] = []

  for (const token of tokens) {
    const group = normalizeGroupName(token.group)
    if (!group) continue

    if (availableGroupSet.has(group)) {
      coveredGroupSet.add(group)
      continue
    }

    invalidTokens.push({
      accountId: displaySiteData.id,
      accountName,
      siteType: displaySiteData.siteType,
      siteUrlOrigin,
      tokenId: token.id,
      tokenName: token.name,
      group,
      reason: "groupUnavailable",
    })
  }

  const createdGroups: string[] = []
  const missingGroups: string[] = []

  for (const group of uniqueGroups) {
    if (coveredGroupSet.has(group)) continue

    try {
      await service.createApiToken(
        request,
        buildGroupDefaultTokenRequest(group),
      )
      coveredGroupSet.add(group)
      createdGroups.push(group)
    } catch {
      missingGroups.push(group)
    }
  }

  return {
    created: createdGroups.length > 0,
    availableGroups: uniqueGroups,
    coveredGroups: uniqueGroups.filter((group) => coveredGroupSet.has(group)),
    createdGroups,
    missingGroups,
    invalidTokens,
  }
}

/**
 * Deletes one invalid account token and returns the typed deletion record.
 */
export async function deleteInvalidAccountToken(params: {
  token: AccountKeyRepairInvalidToken
  account: SiteAccount
  displaySiteData: DisplaySiteData
}): Promise<AccountKeyRepairDeleteInvalidTokensResult["deleted"][number]> {
  const { token, account, displaySiteData } = params
  const service = getApiService(displaySiteData.siteType)
  const request = createAccountApiRequest(account, displaySiteData)
  await service.deleteApiToken(request, token.tokenId)
  return {
    ...token,
    deletedAt: Date.now(),
  }
}
