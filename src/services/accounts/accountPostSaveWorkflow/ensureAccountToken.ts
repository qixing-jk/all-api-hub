import { SITE_TYPES } from "~/constants/siteType"
import { generateDefaultTokenRequest } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import { resolveSub2ApiQuickCreateResolution } from "~/services/accounts/accountOperations"
import { requireDisplayAccountKeyManagement } from "~/services/accounts/utils/apiServiceRequest"
import { getSiteAdapter } from "~/services/apiAdapters/registry"
import {
  hasUsableApiTokenKey,
  isMaskedApiTokenKey,
} from "~/services/apiService/common/apiKey"
import type { ApiServiceRequest } from "~/services/apiService/common/type"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"
import { t } from "~/utils/i18n/core"

import {
  ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES,
  ACCOUNT_TOKEN_INVENTORY_STATE_KINDS,
  ENSURE_ACCOUNT_TOKEN_RESULT_KINDS,
  type AccountTokenInventoryState,
  type EnsureAccountTokenResult,
} from "./constants"

const isCreatedApiToken = (value: unknown): value is ApiToken =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Partial<ApiToken>).id === "number" &&
  typeof (value as Partial<ApiToken>).key === "string"

const hasUsableFullTokenSecret = (token: ApiToken): boolean =>
  hasUsableApiTokenKey(token.key) && !isMaskedApiTokenKey(token.key)

const isApiTokenWithValidId = (value: unknown): value is ApiToken =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Partial<ApiToken>).id === "number"

const sanitizeApiTokens = (tokens: unknown): ApiToken[] =>
  Array.isArray(tokens) ? tokens.filter(isApiTokenWithValidId) : []

const getTokenIds = (tokens: ApiToken[]): number[] =>
  tokens.map((token) => token.id)

/**
 * Selects the single token that appeared after token creation by comparing ids.
 */
export function selectSingleNewApiTokenByIdDiff(params: {
  existingTokenIds: number[]
  tokens: unknown[]
}): ApiToken | null {
  const existingTokenIdSet = new Set(params.existingTokenIds)
  const newTokens = sanitizeApiTokens(params.tokens).filter(
    (token) => !existingTokenIdSet.has(token.id),
  )

  return newTokens.length === 1 ? newTokens[0] : null
}

const buildCreateRequest = (account: SiteAccount): ApiServiceRequest => ({
  baseUrl: account.site_url,
  accountId: account.id,
  auth: {
    authType: account.authType,
    userId: account.account_info.id,
    accessToken: account.account_info.access_token,
    cookie: account.cookieAuth?.sessionCookie,
  },
})

const buildDisplayAccountRequest = (
  displaySiteData: DisplaySiteData,
): ApiServiceRequest => ({
  baseUrl: displaySiteData.baseUrl,
  accountId: displaySiteData.id,
  auth: {
    authType: displaySiteData.authType,
    userId: displaySiteData.userId,
    accessToken: displaySiteData.token,
    cookie: displaySiteData.cookieAuthSessionCookie,
  },
})

/**
 * Inspects whether the saved account already has a token and whether that
 * inventory value is usable as a secret for follow-up automation.
 */
export async function inspectAccountTokenInventory(params: {
  displaySiteData: DisplaySiteData
}): Promise<AccountTokenInventoryState> {
  const { displaySiteData } = params
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    getSiteAdapter(displaySiteData.siteType).keyManagement,
  )
  const tokens = await keyManagement.fetchTokens(
    buildDisplayAccountRequest(displaySiteData),
  )
  const existingTokens = sanitizeApiTokens(tokens)
  const existingTokenIds = getTokenIds(existingTokens)
  const existingToken = existingTokens.at(-1)

  if (!existingToken) {
    return {
      kind: ACCOUNT_TOKEN_INVENTORY_STATE_KINDS.Missing,
      existingTokenIds,
    }
  }

  return {
    kind: ACCOUNT_TOKEN_INVENTORY_STATE_KINDS.Present,
    token: existingToken,
    existingTokenIds,
    hasUsableSecret:
      displaySiteData.siteType !== SITE_TYPES.AIHUBMIX ||
      hasUsableFullTokenSecret(existingToken),
  }
}

/**
 * Creates a default token and resolves the created token when the API omits it.
 */
async function createDefaultToken(params: {
  account: SiteAccount
  displaySiteData: DisplaySiteData
  group?: string
  existingTokenIds: number[]
}): Promise<ApiToken | null> {
  const { account, displaySiteData, group, existingTokenIds } = params
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    getSiteAdapter(displaySiteData.siteType).keyManagement,
  )
  const tokenData = generateDefaultTokenRequest()
  if (typeof group === "string") {
    tokenData.group = group
  }

  const created = await keyManagement.createToken(
    buildCreateRequest(account),
    tokenData,
  )

  if (!created) {
    return null
  }

  if (isCreatedApiToken(created)) {
    return created
  }

  if (displaySiteData.siteType === SITE_TYPES.AIHUBMIX) {
    return null
  }

  const updatedTokens = await keyManagement.fetchTokens(
    buildDisplayAccountRequest(displaySiteData),
  )

  const sanitizedUpdatedTokens = sanitizeApiTokens(updatedTokens)

  return sanitizedUpdatedTokens.length > 0
    ? selectSingleNewApiTokenByIdDiff({
        existingTokenIds,
        tokens: sanitizedUpdatedTokens,
      })
    : null
}

/**
 * Ensures a saved account has a token that can be used by post-save automation.
 */
export async function ensureAccountTokenForPostSaveWorkflow(params: {
  account: SiteAccount
  displaySiteData: DisplaySiteData
}): Promise<EnsureAccountTokenResult> {
  const { account, displaySiteData } = params
  const inventoryState = await inspectAccountTokenInventory({ displaySiteData })
  const existingTokenIds = inventoryState.existingTokenIds

  if (
    inventoryState.kind === ACCOUNT_TOKEN_INVENTORY_STATE_KINDS.Present &&
    inventoryState.hasUsableSecret
  ) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Ready,
      token: inventoryState.token,
      created: false,
    }
  }

  if (displaySiteData.siteType === SITE_TYPES.SUB2API) {
    const resolution =
      await resolveSub2ApiQuickCreateResolution(displaySiteData)

    if (resolution.kind === "blocked") {
      return {
        kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
        code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
        message: resolution.message,
      }
    }

    if (resolution.kind === "selection_required") {
      return {
        kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
        allowedGroups: resolution.allowedGroups,
        existingTokenIds,
      }
    }

    const token = await createDefaultToken({
      account,
      displaySiteData,
      group: resolution.group,
      existingTokenIds,
    })

    if (!token) {
      return {
        kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
        code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
        message: t("messages:accountOperations.createTokenFailed"),
      }
    }

    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token,
      created: true,
      oneTimeSecret: false,
    }
  }

  const token = await createDefaultToken({
    account,
    displaySiteData,
    existingTokenIds,
  })

  if (!token) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code:
        displaySiteData.siteType === SITE_TYPES.AIHUBMIX
          ? ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable
          : ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
      message:
        displaySiteData.siteType === SITE_TYPES.AIHUBMIX
          ? t("messages:aihubmix.createRequiresOneTimeKeyDialog")
          : t("messages:accountOperations.createTokenFailed"),
    }
  }

  if (
    displaySiteData.siteType === SITE_TYPES.AIHUBMIX &&
    !hasUsableFullTokenSecret(token)
  ) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable,
      message: t("messages:aihubmix.createRequiresOneTimeKeyDialog"),
    }
  }

  return {
    kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
    token,
    created: true,
    oneTimeSecret: displaySiteData.siteType === SITE_TYPES.AIHUBMIX,
  }
}
