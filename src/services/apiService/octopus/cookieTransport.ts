import { OCTOPUS_LOGIN_PATH } from "~/constants/octopus"
import { type OctopusAuthSession } from "~/services/apiService/octopus/auth"
import {
  createOctopusRequestHeaders,
  resolveOctopusProtectionExecution,
  throwIfOctopusRequestAborted,
} from "~/services/apiService/octopus/requestContext"
import { tempWindowOctopusApiFetch } from "~/services/apiService/octopus/tempContextClient"
import { type ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import type { OctopusConfig } from "~/types/octopusConfig"
import {
  type OctopusApiResourceBinding,
  type TempWindowFetch,
} from "~/types/tempWindowFetch"
import { safeRandomUUID } from "~/utils/core/identifier"

/** Runs the current Octopus cookie contract in its same-origin browser context. */
export const fetchOctopusCookieApi = async (params: {
  config: OctopusConfig
  session: Extract<OctopusAuthSession, { mode: "cookie" }>
  baseUrl: string
  endpoint: string
  fetchOptions: RequestInit
  protectionBypassExecution?: ProtectionBypassExecution
  resourceBinding?: OctopusApiResourceBinding
}): Promise<TempWindowFetch> => {
  const execution = resolveOctopusProtectionExecution(
    params.protectionBypassExecution,
  )
  const perform = async (endpoint: string, init: RequestInit) => {
    throwIfOctopusRequestAborted(params.fetchOptions.signal ?? undefined)
    return await tempWindowOctopusApiFetch({
      originUrl: params.baseUrl,
      resourceUsername: params.config.username,
      fetchUrl: `${params.baseUrl}${endpoint}`,
      fetchOptions: {
        ...init,
        credentials: "include",
        headers: createOctopusRequestHeaders(params.session, init.headers),
      },
      requestId: safeRandomUUID(`octopus-${endpoint}`),
      resourceBinding: params.resourceBinding,
      protectionBypassExecution: execution,
    })
  }

  let response = await perform(params.endpoint, params.fetchOptions)
  if (response.status !== 401) return response

  throwIfOctopusRequestAborted(params.fetchOptions.signal ?? undefined)
  const login = await perform(OCTOPUS_LOGIN_PATH, {
    method: "POST",
    body: JSON.stringify({
      username: params.config.username,
      password: params.config.password,
    }),
  })
  if (!login.success) {
    throw new Error(login.error || "Octopus cookie login failed")
  }
  const loginData = login.data
  if (
    typeof loginData !== "object" ||
    loginData === null ||
    Array.isArray(loginData) ||
    loginData.code !== 200
  ) {
    const message =
      typeof loginData === "object" &&
      loginData !== null &&
      "message" in loginData &&
      typeof loginData.message === "string"
        ? loginData.message
        : "Octopus cookie login failed"
    throw new Error(message)
  }
  throwIfOctopusRequestAborted(params.fetchOptions.signal ?? undefined)
  response = await perform(params.endpoint, params.fetchOptions)
  return response
}
