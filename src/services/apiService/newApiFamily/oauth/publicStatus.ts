import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { AuthTypeEnum } from "~/types/auth"

import type { NewApiOAuthProvider } from "./contracts"
import { discoverNewApiLoginMethods } from "./discovery"

/** Read-only public discovery for protocol-compatible deployments. */
export async function fetchNewApiLoginMethods(
  baseUrl: string,
  providers: readonly NewApiOAuthProvider[],
  systemName?: string,
) {
  const response = await newApiFamilyRequests.envelope<Record<string, unknown>>(
    { baseUrl, auth: { authType: AuthTypeEnum.None } },
    { endpoint: "/api/status" },
  )
  if (response.success !== true || !response.data)
    throw new Error("Login methods could not be discovered")
  if (systemName && response.data.system_name !== systemName) return []
  return discoverNewApiLoginMethods(response.data, providers).map(
    ({ provider, label }) => ({ provider, label }),
  )
}
