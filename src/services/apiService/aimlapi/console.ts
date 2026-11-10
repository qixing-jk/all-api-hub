import {
  AIMLAPI_CONSOLE_ENDPOINTS,
  AIMLAPI_CONSOLE_ORIGIN,
} from "~/services/accountSiteDefinitions/identifiers"
import { bindApiTransportRequest } from "~/services/apiTransport/recovery"
import { fetchApiResponse } from "~/services/apiTransport/request"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"
import { isRecord } from "~/utils/core/object"

import { AIMLAPI_ONBOARDING_ERRORS as errors } from "./constants"

/** Console wire protocol only; callers own authorization, issuance ordering and retry admission. */
export function createAimlApiConsoleClient(
  token: string,
  options: Pick<ApiServiceRequest, "protectionBypassExecution">,
) {
  const request: ApiServiceRequest = bindApiTransportRequest(
    {
      baseUrl: AIMLAPI_CONSOLE_ORIGIN,
      auth: { authType: AuthTypeEnum.AccessToken, accessToken: token },
      protectionBypassExecution: options.protectionBypassExecution,
    },
    API_DIRECT_REQUEST_REASONS.CallerManaged,
  )
  const consoleJson = async (endpoint: string, body?: unknown) => {
    const response = await fetchApiResponse<unknown>(request, {
      endpoint,
      responseType: "json",
      currentTabTransport: "disabled",
      tempWindowFallback: { codes: [], statusCodes: [] },
      options: {
        method: body ? "POST" : "GET",
        credentials: "omit",
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    })
    if (!response.ok) throw new Error(errors.ConsoleRequestFailed)
    return response.body
  }
  return {
    async verifyIdentity(userId: string): Promise<void> {
      const live = await consoleJson(AIMLAPI_CONSOLE_ENDPOINTS.Identity)
      if (!isRecord(live) || String(live.id) !== userId)
        throw new Error(errors.IdentityMismatch)
    },
    async createConnectionKey(input: {
      userId: string
      name: string
      isManagement: boolean
    }) {
      const created = await consoleJson(AIMLAPI_CONSOLE_ENDPOINTS.Keys, {
        name: input.name,
        isManagement: input.isManagement,
      })
      if (
        !isRecord(created) ||
        String(created.userId) !== input.userId ||
        created.isManagement !== input.isManagement ||
        typeof created.key !== "string" ||
        !created.key ||
        typeof created.id !== "string" ||
        typeof created.prefix !== "string"
      )
        throw new Error(errors.IssuanceUnconfirmed)
      return { key: created.key, id: created.id, prefix: created.prefix }
    },
  }
}
