import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { AuthTypeEnum } from "~/types"

export interface AgentRouterPublicStatus {
  system_name?: string
  github_oauth?: boolean
  github_client_id?: string
  linuxdo_oauth?: boolean
  linuxdo_client_id?: string
}

export interface AgentRouterPublicStatusEnvelope {
  success?: boolean
  data?: AgentRouterPublicStatus
}

/**
 * Reads the public deployment identity used to admit AgentRouter login check-in.
 * Source: https://agentrouter.org/api/status
 */
export async function fetchAgentRouterPublicStatus(
  request: ApiServiceRequest,
  signal?: AbortSignal,
): Promise<AgentRouterPublicStatusEnvelope> {
  return await newApiFamilyRequests.envelope<AgentRouterPublicStatus>(
    {
      ...request,
      auth: { authType: AuthTypeEnum.None },
    },
    {
      endpoint: "/api/status",
      ...(signal ? { options: { signal } } : {}),
    },
  )
}
