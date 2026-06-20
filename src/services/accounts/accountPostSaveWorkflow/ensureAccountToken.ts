import { generateDefaultTokenRequest } from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"
import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
  requireDisplayAccountTokenProvisioning,
} from "~/services/accounts/utils/apiServiceRequest"
import { resolveDefaultTokenCreationWithUserGroups } from "~/services/accounts/utils/tokenProvisioning"
import {
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_PROVISIONING_BLOCK_REASONS,
  TOKEN_PROVISIONING_WORKFLOWS,
  type DefaultTokenCreationDecision,
  type TokenProvisioningBlockReason,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
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

/**
 * Inspects whether the saved account already has a token and whether that
 * inventory value is usable as a secret for follow-up automation.
 */
export async function inspectAccountTokenInventory(params: {
  displaySiteData: DisplaySiteData
}): Promise<AccountTokenInventoryState> {
  const { displaySiteData } = params
  const context = createDisplayAccountApiContext(displaySiteData)
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    context.keyManagement,
  )
  const tokenProvisioning = requireDisplayAccountTokenProvisioning(
    displaySiteData,
    context.tokenProvisioning,
  )
  const tokens = await keyManagement.fetchTokens(context.request)
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
    hasUsableSecret: tokenProvisioning.isInventoryTokenUsable({
      workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
      token: existingToken,
    }),
  }
}

const blockPostSaveTokenCreation = (params?: {
  reason?: TokenProvisioningBlockReason
}): EnsureAccountTokenResult => {
  const reason = params?.reason

  if (
    reason === TOKEN_PROVISIONING_BLOCK_REASONS.OneTimeSecretRequired ||
    reason === TOKEN_PROVISIONING_BLOCK_REASONS.CreatedTokenSecretUnavailable
  ) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenSecretUnavailable,
      message: t("messages:aihubmix.createRequiresOneTimeKeyDialog"),
    }
  }

  if (reason === TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
      code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
      message: t("messages:sub2api.createRequiresAvailableGroup"),
    }
  }

  return {
    kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Blocked,
    code: ACCOUNT_POST_SAVE_WORKFLOW_ERROR_CODES.TokenCreationFailed,
    message: t("messages:accountOperations.createTokenFailed"),
  }
}

/**
 * Creates a default token and resolves the created token when the API omits it.
 */
async function createDefaultToken(params: {
  account: SiteAccount
  displaySiteData: DisplaySiteData
  decision: Extract<
    DefaultTokenCreationDecision,
    { kind: typeof DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create }
  >
  existingTokenIds: number[]
}): Promise<EnsureAccountTokenResult> {
  const { account, displaySiteData, decision, existingTokenIds } = params
  const context = createDisplayAccountApiContext(displaySiteData)
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    context.keyManagement,
  )
  const tokenProvisioning = requireDisplayAccountTokenProvisioning(
    displaySiteData,
    context.tokenProvisioning,
  )

  const created = await keyManagement.createToken(
    buildCreateRequest(account),
    decision.tokenData,
  )
  const createdTokenDecision = tokenProvisioning.classifyCreatedToken({
    workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
    result: created,
  })

  if (createdTokenDecision.kind === "usable") {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
      token: createdTokenDecision.token,
      created: true,
      oneTimeSecret: createdTokenDecision.oneTimeSecret,
    }
  }

  if (createdTokenDecision.kind === "failed") {
    return blockPostSaveTokenCreation({ reason: createdTokenDecision.reason })
  }

  if (createdTokenDecision.kind === "unavailable") {
    return blockPostSaveTokenCreation({ reason: createdTokenDecision.reason })
  }

  const updatedTokens = await keyManagement.fetchTokens(context.request)

  const sanitizedUpdatedTokens = sanitizeApiTokens(updatedTokens)

  const token =
    sanitizedUpdatedTokens.length > 0
      ? selectSingleNewApiTokenByIdDiff({
          existingTokenIds,
          tokens: sanitizedUpdatedTokens,
        })
      : null

  if (!token) {
    return blockPostSaveTokenCreation()
  }

  return {
    kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Created,
    token,
    created: true,
    oneTimeSecret: decision.oneTimeSecret,
  }
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

  const context = createDisplayAccountApiContext(displaySiteData)
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    context.keyManagement,
  )
  const tokenProvisioning = requireDisplayAccountTokenProvisioning(
    displaySiteData,
    context.tokenProvisioning,
  )
  const defaultTokenData = generateDefaultTokenRequest()
  const decision = await resolveDefaultTokenCreationWithUserGroups({
    keyManagement,
    tokenProvisioning,
    request: context.request,
    decisionRequest: {
      workflow: TOKEN_PROVISIONING_WORKFLOWS.PostSaveAutomation,
      defaultTokenData,
    },
    missingUserGroupsMessage: t(
      "messages:sub2api.createRequiresAvailableGroup",
    ),
  })

  if (
    decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired
  ) {
    return {
      kind: ENSURE_ACCOUNT_TOKEN_RESULT_KINDS.Sub2ApiSelectionRequired,
      allowedGroups: decision.allowedGroups,
      existingTokenIds,
    }
  }

  if (decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked) {
    return blockPostSaveTokenCreation({ reason: decision.reason })
  }

  if (decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups) {
    return blockPostSaveTokenCreation({
      reason: TOKEN_PROVISIONING_BLOCK_REASONS.AvailableGroupRequired,
    })
  }

  return createDefaultToken({
    account,
    displaySiteData,
    decision,
    existingTokenIds,
  })
}
