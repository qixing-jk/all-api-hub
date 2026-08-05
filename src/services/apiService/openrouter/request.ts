import { OPENROUTER_API_BASE_URL } from "~/services/accountSiteDefinitions/identifiers"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

import { OpenRouterManagementKeyRequiredError } from "./errors"

/**
 * OpenRouter Management API keys use `Authorization: Bearer <management-key>`.
 * https://openrouter.ai/docs/guides/overview/auth/management-api-keys
 */
export function createOpenRouterManagementRequest(
  request: ApiServiceRequest,
): ApiServiceRequest {
  const accessToken = request.auth.accessToken?.trim() ?? ""
  if (!accessToken) {
    throw new OpenRouterManagementKeyRequiredError()
  }

  return {
    ...request,
    baseUrl: OPENROUTER_API_BASE_URL,
    auth: {
      ...request.auth,
      authType: AuthTypeEnum.AccessToken,
      accessToken,
      userId: undefined,
    },
  }
}
