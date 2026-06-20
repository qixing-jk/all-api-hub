import {
  requireDisplayAccountKeyManagement,
  requireDisplayAccountTokenProvisioning,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_ERRORS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import type { CreateTokenRequest } from "~/services/apiService/common/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { DisplaySiteData, SiteAccount } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS,
  type AccountKeyRepairDeleteInvalidTokensResult,
  type AccountKeyRepairInvalidToken,
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
  const accountId = displaySiteData.id || account.id

  return {
    baseUrl: displaySiteData.baseUrl || account.site_url,
    accountId,
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
  const adapter = getSiteAdapter(displaySiteData.siteType)
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    adapter.keyManagement,
  )
  const tokenProvisioning = requireDisplayAccountTokenProvisioning(
    displaySiteData,
    adapter.tokenProvisioning,
  )
  const request = createAccountApiRequest(account, displaySiteData)
  const accountId = displaySiteData.id || account.id

  const tokens = await keyManagement.fetchTokens(request)
  const groupsData = keyManagement.userGroups
    ? await keyManagement.userGroups.fetch(request)
    : {}
  const groups = Object.keys(groupsData).map(normalizeGroupName).filter(Boolean)

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

    const decision = tokenProvisioning.resolveDefaultTokenCreation({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.Repair,
      defaultTokenData: generateDefaultTokenRequest(),
    })

    if (decision.kind !== "create") {
      if (
        decision.kind === "blocked" &&
        decision.reason ===
          TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired
      ) {
        throw new Error(t("messages:aihubmix.createRequiresOneTimeKeyDialog"))
      }

      throw new Error(t("messages:sub2api.createRequiresGroup"))
    }

    const createResult = await keyManagement.createToken(
      request,
      decision.tokenData,
    )
    const createdTokenDecision = tokenProvisioning.classifyCreatedToken({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.Repair,
      result: createResult,
    })

    if (createdTokenDecision.kind === "failed") {
      throw new Error(TOKEN_PROVISIONING_ERRORS.CreateTokenFailed)
    }

    return {
      created: true,
      availableGroups: [],
      coveredGroups: [],
      createdGroups: [decision.tokenData.group],
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
      accountId,
      accountName,
      siteType: displaySiteData.siteType,
      siteUrlOrigin,
      tokenId: token.id,
      tokenName: token.name,
      group,
      reason: ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS.GroupUnavailable,
    })
  }

  const createdGroups: string[] = []
  const missingGroups: string[] = []

  for (const group of uniqueGroups) {
    if (coveredGroupSet.has(group)) continue

    try {
      await keyManagement.createToken(
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
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    getSiteAdapter(displaySiteData.siteType).keyManagement,
  )
  const request = createAccountApiRequest(account, displaySiteData)
  await keyManagement.deleteToken({
    request,
    tokenId: token.tokenId,
  })
  return {
    ...token,
    deletedAt: Date.now(),
  }
}
