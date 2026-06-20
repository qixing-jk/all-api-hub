import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import {
  DEFAULT_TOKEN_CREATION_DECISION_KINDS,
  type DefaultTokenCreationDecision,
  type ResolveDefaultTokenCreationRequest,
  type TokenProvisioningCapability,
} from "~/services/apiAdapters/contracts/tokenProvisioning"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

/**
 * Resolves default-token creation, fetching user groups only when the policy
 * requires them for a second pass.
 */
export async function resolveDefaultTokenCreationWithUserGroups(params: {
  keyManagement: KeyManagementCapability
  tokenProvisioning: TokenProvisioningCapability
  request: ApiServiceRequest
  decisionRequest: ResolveDefaultTokenCreationRequest
  missingUserGroupsMessage: string
}): Promise<DefaultTokenCreationDecision> {
  const decision = params.tokenProvisioning.resolveDefaultTokenCreation(
    params.decisionRequest,
  )

  if (decision.kind !== DEFAULT_TOKEN_CREATION_DECISION_KINDS.NeedsUserGroups) {
    return decision
  }

  if (!params.keyManagement.userGroups) {
    throw new Error(params.missingUserGroupsMessage)
  }

  const userGroups = await params.keyManagement.userGroups.fetch(params.request)

  return params.tokenProvisioning.resolveDefaultTokenCreation({
    ...params.decisionRequest,
    userGroups,
  })
}
