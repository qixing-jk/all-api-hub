import type { CreateTokenRequest } from "~/services/apiService/common/type"

export const DEFAULT_AUTO_PROVISION_TOKEN_NAME = "user group (auto)"
export const DEFAULT_USER_GROUP_NAME = "default"

/**
 * Selects the preferred default user group from a constrained group list.
 */
export function resolvePreferredDefaultUserGroup(
  allowedGroups: readonly string[],
): string {
  const normalizedGroups = allowedGroups
    .map((group) => group.trim())
    .filter(Boolean)

  if (normalizedGroups.includes(DEFAULT_USER_GROUP_NAME)) {
    return DEFAULT_USER_GROUP_NAME
  }

  return normalizedGroups[0] ?? DEFAULT_USER_GROUP_NAME
}

/**
 * Generates the default token payload used by key auto-provisioning flows.
 */
export function generateDefaultTokenRequest(): CreateTokenRequest {
  return {
    name: DEFAULT_AUTO_PROVISION_TOKEN_NAME,
    unlimited_quota: true,
    expired_time: -1,
    remain_quota: 0,
    allow_ips: "",
    model_limits_enabled: false,
    model_limits: "",
    group: "",
  }
}
/**
 * Builds the default auto-provision token payload for one user group.
 */
export function buildGroupDefaultTokenRequest(
  group: string,
): CreateTokenRequest {
  const normalizedGroup = group.trim()

  return {
    ...generateDefaultTokenRequest(),
    name:
      normalizedGroup && normalizedGroup !== DEFAULT_USER_GROUP_NAME
        ? `${normalizedGroup} group (auto)`
        : DEFAULT_AUTO_PROVISION_TOKEN_NAME,
    group: normalizedGroup,
  }
}

/**
 * Applies the group-aware default name only to auto-generated default-token names.
 */
export function normalizeDefaultTokenRequestName(
  tokenData: CreateTokenRequest,
): CreateTokenRequest {
  const normalizedGroup = tokenData.group.trim()
  const groupDefaultTokenData = buildGroupDefaultTokenRequest(normalizedGroup)

  return {
    ...tokenData,
    name:
      tokenData.name === DEFAULT_AUTO_PROVISION_TOKEN_NAME
        ? groupDefaultTokenData.name
        : tokenData.name,
    group: normalizedGroup,
  }
}
