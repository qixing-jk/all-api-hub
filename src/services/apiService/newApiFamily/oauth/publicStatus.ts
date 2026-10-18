import { ACCOUNT_LOGIN_METHODS } from "~/constants/accountLogin"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { AuthTypeEnum } from "~/types/auth"

import type { NewApiOAuthProvider } from "./contracts"
import { discoverNewApiLoginMethods } from "./discovery"

/** Read-only public discovery for protocol-compatible deployments. */
export async function fetchNewApiLoginMethods(
  baseUrl: string,
  providers: readonly (
    | NewApiOAuthProvider
    | typeof ACCOUNT_LOGIN_METHODS.Password
  )[],
  matchesSystemName?: (value: unknown) => boolean,
) {
  const response = await newApiFamilyRequests.envelope<Record<string, unknown>>(
    { baseUrl, auth: { authType: AuthTypeEnum.None } },
    { endpoint: "/api/status" },
  )
  if (response.success !== true || !response.data)
    throw new Error("Login methods could not be discovered")
  if (matchesSystemName && !matchesSystemName(response.data.system_name))
    return []
  const methods: {
    provider: NewApiOAuthProvider | typeof ACCOUNT_LOGIN_METHODS.Password
    label: string
  }[] = discoverNewApiLoginMethods(
    response.data,
    providers.filter(
      (provider): provider is NewApiOAuthProvider =>
        provider !== ACCOUNT_LOGIN_METHODS.Password,
    ),
  ).map(({ provider, label }) => ({ provider, label }))
  if (
    providers.includes(ACCOUNT_LOGIN_METHODS.Password) &&
    response.data.password_login_enabled !== false
  )
    methods.push({
      provider: ACCOUNT_LOGIN_METHODS.Password,
      label: "Password",
    })
  return methods
}
