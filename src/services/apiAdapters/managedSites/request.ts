import { AuthTypeEnum } from "~/types"

/**
 * Converts persisted managed-site admin config into an API-service request.
 */
export function toManagedSiteApiServiceRequest(
  config: {
    baseUrl: string
    adminToken: string
    userId: string
  },
  options?: { bypassSiteRequestLimit?: boolean },
) {
  return {
    baseUrl: config.baseUrl,
    auth: {
      authType: AuthTypeEnum.AccessToken,
      accessToken: config.adminToken,
      userId: config.userId,
    },
    ...(options?.bypassSiteRequestLimit
      ? { bypassSiteRequestLimit: true }
      : {}),
  }
}
