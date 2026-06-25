import {
  createDefaultTokenFromDecision,
  DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS,
  DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS,
  resolveDefaultTokenLifecycleDecisionFromCapabilities,
} from "~/services/accounts/defaultTokenLifecycle"
import {
  requireDisplayAccountKeyManagement,
  requireDisplayAccountTokenProvisioning,
} from "~/services/accounts/utils/apiServiceRequest"
import {
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_ERRORS,
  TOKEN_PROVISIONING_WORKFLOWS,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import type { CreateTokenRequest } from "~/services/apiService/common/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import {
  ACCOUNT_KEY_REPAIR_INVALID_TOKEN_REASONS,
  type AccountKeyRepairDeleteInvalidTokensResult,
  type AccountKeyRepairInvalidToken,
  type AccountKeyRepairRenamedToken,
} from "~/types/accountKeyAutoProvisioning"
import { t } from "~/utils/i18n/core"

import {
  buildGroupDefaultTokenRequest,
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
  renamedTokens: AccountKeyRepairRenamedToken[]
  renameFailedTokens: AccountKeyRepairRenamedToken[]
}

const normalizeGroupName = (value: unknown) =>
  typeof value === "string" ? value.trim() : ""

const AUTO_GROUP_TOKEN_NAME_PATTERN = /^(.+) group \(auto\)$/
type TokenRenameUpdateRequest = CreateTokenRequest & Pick<ApiToken, "models">

/**
 * Finds rename candidates that still look like extension-created template keys.
 */
function resolveAutoTemplateTokenRename(
  token: ApiToken,
): AccountKeyRepairRenamedToken | null {
  const group = normalizeGroupName(token.group)
  if (!group) return null

  const previousName = token.name.trim()
  if (
    previousName !== DEFAULT_AUTO_PROVISION_TOKEN_NAME &&
    !AUTO_GROUP_TOKEN_NAME_PATTERN.test(previousName)
  ) {
    return null
  }

  const nextName = buildGroupDefaultTokenRequest(group).name
  if (previousName === nextName) return null

  return {
    tokenId: token.id,
    group,
    previousName,
    nextName,
  }
}

/**
 * Reuses the current token settings while changing only the display name.
 */
function buildTokenUpdateRequest(
  token: ApiToken,
  nextName: string,
): TokenRenameUpdateRequest {
  return {
    name: nextName,
    remain_quota: token.remain_quota,
    expired_time: token.expired_time,
    unlimited_quota: token.unlimited_quota,
    model_limits_enabled: token.model_limits_enabled ?? false,
    model_limits: token.model_limits ?? "",
    models: token.models ?? "",
    allow_ips: token.allow_ips ?? "",
    group: normalizeGroupName(token.group),
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
  abortSignal?: AbortSignal,
): ApiServiceRequest {
  const accountId = displaySiteData.id || account.id

  return {
    baseUrl: displaySiteData.baseUrl || account.site_url,
    accountId,
    abortSignal,
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
  abortSignal?: AbortSignal
  renameAutoTemplateTokens?: boolean
}): Promise<AccountKeyCoverageResult> {
  const { account, displaySiteData, accountName, siteUrlOrigin, abortSignal } =
    params
  const adapter = getSiteAdapter(displaySiteData.siteType)
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    adapter.keyManagement,
  )
  const tokenProvisioning = requireDisplayAccountTokenProvisioning(
    displaySiteData,
    adapter.tokenProvisioning,
  )
  const request = createAccountApiRequest(account, displaySiteData, abortSignal)
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
        renamedTokens: [],
        renameFailedTokens: [],
      }
    }

    const decision = resolveDefaultTokenLifecycleDecisionFromCapabilities({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.Repair,
      tokenProvisioning,
      defaultTokenData: generateDefaultTokenRequest(),
    })

    if (decision.kind !== DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create) {
      if (
        decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked &&
        decision.reason ===
          TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired
      ) {
        throw new Error(t("messages:aihubmix.createRequiresOneTimeKeyDialog"))
      }

      throw new Error(t("messages:tokenProvisioning.createRequiresGroup"))
    }

    const createResult = await createDefaultTokenFromDecision({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.Repair,
      keyManagement,
      tokenProvisioning,
      createRequest: request,
      inventoryRequest: request,
      decision,
      existingTokenIds: [],
    })

    if (createResult.kind === DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked) {
      if (
        createResult.reason ===
        DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.CreateTokenFailed
      ) {
        throw new Error(TOKEN_PROVISIONING_ERRORS.CreateTokenFailed)
      }

      if (
        createResult.reason ===
          TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable ||
        createResult.reason ===
          TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired
      ) {
        throw new Error(t("messages:aihubmix.createRequiresOneTimeKeyDialog"))
      }

      if (
        createResult.reason ===
          DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.TokenNotFound ||
        createResult.reason ===
          DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.AmbiguousCreatedToken
      ) {
        throw new Error(TOKEN_PROVISIONING_ERRORS.TokenNotFound)
      }

      throw new Error(t("messages:tokenProvisioning.createRequiresGroup"))
    }

    return {
      created: true,
      availableGroups: [],
      coveredGroups: [],
      createdGroups: [decision.tokenData.group],
      missingGroups: [],
      invalidTokens: [],
      renamedTokens: [],
      renameFailedTokens: [],
    }
  }

  const availableGroupSet = new Set(uniqueGroups)
  const coveredGroupSet = new Set<string>()
  const invalidTokens: AccountKeyRepairInvalidToken[] = []
  const renamedTokens: AccountKeyRepairRenamedToken[] = []
  const renameFailedTokens: AccountKeyRepairRenamedToken[] = []

  for (const token of tokens) {
    const group = normalizeGroupName(token.group)
    if (!group) continue

    if (availableGroupSet.has(group)) {
      coveredGroupSet.add(group)
      if (params.renameAutoTemplateTokens !== false) {
        const rename = resolveAutoTemplateTokenRename(token)
        if (rename) {
          try {
            const updateResult = await keyManagement.updateToken({
              request,
              tokenId: token.id,
              tokenData: buildTokenUpdateRequest(token, rename.nextName),
            })
            if (updateResult === false) {
              renameFailedTokens.push(rename)
            } else {
              renamedTokens.push(rename)
            }
          } catch {
            renameFailedTokens.push(rename)
          }
        }
      }
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
    renamedTokens,
    renameFailedTokens,
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
