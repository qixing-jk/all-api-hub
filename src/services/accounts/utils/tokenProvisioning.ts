import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import type {
  DefaultTokenCreationDecision,
  ResolveDefaultTokenCreationRequest,
  TokenProvisioningCapability,
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

  if (decision.kind !== "needs_user_groups") {
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
