import {
  createDisplayAccountApiContext,
  requireDisplayAccountKeyManagement,
  requireDisplayAccountTokenProvisioning,
} from "~/services/accounts/utils/apiServiceRequest"
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import {
  CREATED_TOKEN_SECRET_DECISION_KINDS,
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  TOKEN_CREATION_SECRET_RECOVERY,
  TOKEN_PROVISIONING_WORKFLOWS,
  type DefaultTokenCreationDecision,
  type ResolveDefaultTokenCreationRequest,
  type TokenProvisioningCapability,
  type TokenProvisioningWorkflow,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { ApiToken, DisplaySiteData, SiteAccount } from "~/types"

import {
  DEFAULT_TOKEN_INVENTORY_STATE_KINDS,
  DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS,
  DEFAULT_TOKEN_LIFECYCLE_ERRORS,
  DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS,
  type DefaultTokenInventoryState,
  type DefaultTokenLifecycleBlockReason,
  type DefaultTokenLifecycleResult,
} from "./contracts"
import {
  createStoredAccountTokenRequest,
  generateDefaultTokenRequest,
  normalizeDefaultTokenRequestName,
} from "./requests"

const isApiTokenWithValidId = (value: unknown): value is ApiToken =>
  !!value &&
  typeof value === "object" &&
  typeof (value as Partial<ApiToken>).id === "number"

const sanitizeApiTokens = (tokens: unknown): ApiToken[] =>
  Array.isArray(tokens) ? tokens.filter(isApiTokenWithValidId) : []

const getTokenIds = (tokens: ApiToken[]): number[] =>
  tokens.map((token) => token.id)

class MissingUserGroupsCapabilityError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MissingUserGroupsCapabilityError"
  }
}

/**
 * Returns the single token created since the previous inventory snapshot.
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

const inspectDefaultTokenInventoryWithCapabilities = async (params: {
  workflow: TokenProvisioningWorkflow
  keyManagement: KeyManagementCapability
  tokenProvisioning: TokenProvisioningCapability
  request: ApiServiceRequest
}): Promise<DefaultTokenInventoryState> => {
  const { workflow, keyManagement, tokenProvisioning, request } = params
  const existingTokens = sanitizeApiTokens(
    await keyManagement.fetchTokens(request),
  )
  const existingTokenIds = getTokenIds(existingTokens)
  const existingToken = existingTokens.at(-1)

  if (!existingToken) {
    return {
      kind: DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Missing,
      existingTokenIds,
    }
  }

  return {
    kind: DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Present,
    token: existingToken,
    existingTokenIds,
    hasUsableSecret: tokenProvisioning.isInventoryTokenUsable({
      workflow,
      token: existingToken,
    }),
  }
}

/**
 * Fetches the current default-token inventory and evaluates policy usability.
 */
export async function inspectDefaultTokenInventory(params: {
  workflow: TokenProvisioningWorkflow
  displaySiteData: DisplaySiteData
}): Promise<DefaultTokenInventoryState> {
  const { workflow, displaySiteData } = params
  const context = createDisplayAccountApiContext(displaySiteData)
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    context.keyManagement,
  )
  const tokenProvisioning = requireDisplayAccountTokenProvisioning(
    displaySiteData,
    context.tokenProvisioning,
  )

  return inspectDefaultTokenInventoryWithCapabilities({
    workflow,
    keyManagement,
    tokenProvisioning,
    request: context.request,
  })
}

/**
 * Resolves default-token creation policy, fetching user groups only on demand.
 */
async function resolveDefaultTokenCreationWithUserGroups(params: {
  keyManagement: KeyManagementCapability
  tokenProvisioning: TokenProvisioningCapability
  request: ApiServiceRequest
  decisionRequest: ResolveDefaultTokenCreationRequest
  missingUserGroupsMessage?: string
}): Promise<DefaultTokenCreationDecision> {
  const decision = params.tokenProvisioning.resolveDefaultTokenCreation(
    params.decisionRequest,
  )

  if (decision.kind !== DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups) {
    return decision
  }

  if (!params.keyManagement.userGroups) {
    throw new MissingUserGroupsCapabilityError(
      params.missingUserGroupsMessage ??
        DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.MissingUserGroups,
    )
  }

  const userGroups = await params.keyManagement.userGroups.fetch(params.request)

  return params.tokenProvisioning.resolveDefaultTokenCreation({
    ...params.decisionRequest,
    userGroups,
  })
}

/**
 * Resolves the lifecycle-level default-token creation decision for a display account.
 */
export async function resolveDefaultTokenLifecycleDecision(params: {
  workflow: TokenProvisioningWorkflow
  displaySiteData: DisplaySiteData
  defaultTokenData?: ResolveDefaultTokenCreationRequest["defaultTokenData"]
  explicitGroup?: string
  missingUserGroupsMessage?: string
}): Promise<DefaultTokenCreationDecision> {
  const context = createDisplayAccountApiContext(params.displaySiteData)
  const keyManagement = requireDisplayAccountKeyManagement(
    params.displaySiteData,
    context.keyManagement,
  )
  const tokenProvisioning = requireDisplayAccountTokenProvisioning(
    params.displaySiteData,
    context.tokenProvisioning,
  )

  return resolveDefaultTokenCreationWithUserGroups({
    keyManagement,
    tokenProvisioning,
    request: context.request,
    decisionRequest: {
      workflow: params.workflow,
      defaultTokenData:
        params.defaultTokenData ?? generateDefaultTokenRequest(),
      explicitGroup: params.explicitGroup,
    },
    missingUserGroupsMessage: params.missingUserGroupsMessage,
  })
}

/**
 * Resolves default-token creation policy for callers that already own adapter
 * capabilities and request construction.
 */
export function resolveDefaultTokenLifecycleDecisionFromCapabilities(params: {
  workflow: TokenProvisioningWorkflow
  tokenProvisioning: TokenProvisioningCapability
  defaultTokenData?: ResolveDefaultTokenCreationRequest["defaultTokenData"]
  explicitGroup?: string
}): DefaultTokenCreationDecision {
  return params.tokenProvisioning.resolveDefaultTokenCreation({
    workflow: params.workflow,
    defaultTokenData: params.defaultTokenData ?? generateDefaultTokenRequest(),
    explicitGroup: params.explicitGroup,
  })
}

/**
 * Builds a blocked lifecycle result for create-token failures and policy blocks.
 */
const blockCreatedToken = (params: {
  reason: DefaultTokenLifecycleBlockReason
  existingTokenIds: number[]
  cause?: unknown
}) => {
  const result = {
    kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
    reason: params.reason,
    existingTokenIds: params.existingTokenIds,
  }

  return params.cause === undefined
    ? result
    : { ...result, cause: params.cause }
}

/**
 * Creates a default token and recovers the created token from response or inventory.
 */
export async function createDefaultTokenFromDecision(params: {
  workflow: TokenProvisioningWorkflow
  keyManagement: KeyManagementCapability
  tokenProvisioning: TokenProvisioningCapability
  createRequest: ApiServiceRequest
  inventoryRequest: ApiServiceRequest
  decision: Extract<
    DefaultTokenCreationDecision,
    { kind: typeof DEFAULT_TOKEN_CREATION_DECISION_KINDS.Create }
  >
  existingTokenIds: number[]
}): Promise<
  Extract<
    DefaultTokenLifecycleResult,
    | { kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created }
    | { kind: typeof DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked }
  >
> {
  const {
    workflow,
    keyManagement,
    tokenProvisioning,
    createRequest,
    inventoryRequest,
    decision,
    existingTokenIds,
  } = params
  const tokenData = normalizeDefaultTokenRequestName(decision.tokenData)

  let createResult: Awaited<ReturnType<KeyManagementCapability["createToken"]>>
  try {
    createResult = await keyManagement.createToken(createRequest, tokenData)
  } catch (error) {
    return blockCreatedToken({
      reason: DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.CreateTokenFailed,
      existingTokenIds,
      cause: error,
    })
  }

  const createdTokenDecision = tokenProvisioning.classifyCreatedToken({
    workflow,
    result: createResult,
  })

  if (
    createdTokenDecision.kind === CREATED_TOKEN_SECRET_DECISION_KINDS.Usable
  ) {
    return {
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created,
      token: createdTokenDecision.token,
      created: true,
      oneTimeSecret: createdTokenDecision.oneTimeSecret,
      existingTokenIds,
    }
  }

  if (
    createdTokenDecision.kind === CREATED_TOKEN_SECRET_DECISION_KINDS.Failed
  ) {
    return blockCreatedToken({
      reason: DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.CreateTokenFailed,
      existingTokenIds,
    })
  }

  if (
    createdTokenDecision.kind ===
    CREATED_TOKEN_SECRET_DECISION_KINDS.Unavailable
  ) {
    return blockCreatedToken({
      reason: createdTokenDecision.reason,
      existingTokenIds,
    })
  }

  const updatedTokens = sanitizeApiTokens(
    await keyManagement.fetchTokens(inventoryRequest),
  )
  const recoveredToken = selectSingleNewApiTokenByIdDiff({
    existingTokenIds,
    tokens: updatedTokens,
  })

  if (!recoveredToken) {
    const hasAnyNewToken = updatedTokens.some(
      (token) => !existingTokenIds.includes(token.id),
    )

    return blockCreatedToken({
      reason: hasAnyNewToken
        ? DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.AmbiguousCreatedToken
        : DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.TokenNotFound,
      existingTokenIds,
    })
  }

  return {
    kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Created,
    token: recoveredToken,
    created: true,
    oneTimeSecret: decision.oneTimeSecret,
    existingTokenIds,
  }
}

/**
 * Ensures a default token exists and is usable for workflows that can create one.
 */
export async function ensureDefaultTokenLifecycle(params: {
  workflow: TokenProvisioningWorkflow
  account: SiteAccount
  displaySiteData: DisplaySiteData
  defaultTokenData?: ResolveDefaultTokenCreationRequest["defaultTokenData"]
  explicitGroup?: string
  inspectInventory?: boolean
}): Promise<DefaultTokenLifecycleResult> {
  const { workflow, account, displaySiteData } = params

  if (workflow === TOKEN_PROVISIONING_WORKFLOWS.QuickCreateSelection) {
    throw new Error(
      DEFAULT_TOKEN_LIFECYCLE_ERRORS.QuickCreateSelectionIsDecisionOnly,
    )
  }

  let existingTokenIds: number[] = []

  const context = createDisplayAccountApiContext(displaySiteData)
  const keyManagement = requireDisplayAccountKeyManagement(
    displaySiteData,
    context.keyManagement,
  )
  const tokenProvisioning = requireDisplayAccountTokenProvisioning(
    displaySiteData,
    context.tokenProvisioning,
  )

  if (params.inspectInventory !== false) {
    const inventoryState = await inspectDefaultTokenInventoryWithCapabilities({
      workflow,
      keyManagement,
      tokenProvisioning,
      request: context.request,
    })
    existingTokenIds = inventoryState.existingTokenIds

    if (
      inventoryState.kind === DEFAULT_TOKEN_INVENTORY_STATE_KINDS.Present &&
      inventoryState.hasUsableSecret
    ) {
      return {
        kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Ready,
        token: inventoryState.token,
        created: false,
        existingTokenIds,
      }
    }
  }

  let decision: DefaultTokenCreationDecision
  try {
    decision = await resolveDefaultTokenCreationWithUserGroups({
      keyManagement,
      tokenProvisioning,
      request: context.request,
      decisionRequest: {
        workflow,
        defaultTokenData:
          params.defaultTokenData ?? generateDefaultTokenRequest(),
        explicitGroup: params.explicitGroup,
      },
    })
  } catch (error) {
    if (!(error instanceof MissingUserGroupsCapabilityError)) {
      throw error
    }

    return {
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
      reason: DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.MissingUserGroups,
      existingTokenIds,
      cause: error,
    }
  }

  if (
    decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.SelectionRequired
  ) {
    return {
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.SelectionRequired,
      allowedGroups: decision.allowedGroups,
      existingTokenIds,
    }
  }

  if (decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.Blocked) {
    return {
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
      reason: decision.reason,
      existingTokenIds,
    }
  }

  if (decision.kind === DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups) {
    return {
      kind: DEFAULT_TOKEN_LIFECYCLE_RESULT_KINDS.Blocked,
      reason: DEFAULT_TOKEN_LIFECYCLE_BLOCK_REASONS.MissingUserGroups,
      existingTokenIds,
    }
  }

  if (
    params.inspectInventory === false &&
    decision.recoverCreatedToken ===
      TOKEN_CREATION_SECRET_RECOVERY.InventoryRefetch &&
    existingTokenIds.length === 0
  ) {
    existingTokenIds = getTokenIds(
      sanitizeApiTokens(await keyManagement.fetchTokens(context.request)),
    )
  }

  const createResult = await createDefaultTokenFromDecision({
    workflow,
    keyManagement,
    tokenProvisioning,
    createRequest: createStoredAccountTokenRequest(account),
    inventoryRequest: context.request,
    decision,
    existingTokenIds,
  })

  return createResult
}
