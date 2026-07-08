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

type DefaultTokenGroupSelectionData = {
  group: string
  name: string
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

/**
 * Applies a token group change while keeping extension-generated auto names in sync.
 */
export function applyDefaultTokenCreateGroupSelection<
  T extends DefaultTokenGroupSelectionData,
>(formData: T, nextGroup: string): T {
  const normalizedGroup = nextGroup.trim()
  const previousAutoName = buildGroupDefaultTokenRequest(formData.group).name
  const nextAutoName = buildGroupDefaultTokenRequest(normalizedGroup).name

  return {
    ...formData,
    group: normalizedGroup,
    name: formData.name === previousAutoName ? nextAutoName : formData.name,
  }
}
