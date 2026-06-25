import {
  buildGroupDefaultTokenRequest,
  resolvePreferredDefaultUserGroup,
} from "~/services/accounts/accountKeyAutoProvisioning/ensureDefaultToken"

export interface DefaultTokenCreatePrefill {
  modelId: string
  defaultName: string
  group: string
  allowedGroups: string[]
}

/**
 * Builds the AddTokenDialog prefill for constrained default-token creation.
 */
export function buildDefaultTokenCreatePrefill(
  allowedGroups: readonly string[] | null | undefined,
): DefaultTokenCreatePrefill | undefined {
  if (!allowedGroups || allowedGroups.length === 0) return undefined

  const group = resolvePreferredDefaultUserGroup(allowedGroups)
  const tokenRequest = buildGroupDefaultTokenRequest(group)

  return {
    modelId: "",
    defaultName: tokenRequest.name,
    group: tokenRequest.group,
    allowedGroups: [...allowedGroups],
  }
}
