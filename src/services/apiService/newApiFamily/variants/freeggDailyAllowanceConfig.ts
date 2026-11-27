/** Pure metadata for the verified FreeGG daily-allowance deployment. */
import { FREEGG_DAILY_ALLOWANCE_HOSTNAMES } from "~/services/accountSiteDefinitions/identifiers"
import { API_OPERATION_SEMANTICS } from "~/services/apiTransport/type"

export const FREEGG_DAILY_ALLOWANCE_ORIGINS =
  FREEGG_DAILY_ALLOWANCE_HOSTNAMES.map((hostname) => `https://${hostname}`)
export const FREEGG_ALLOWANCE_LOG_ENDPOINT = "/api/log/self"
export const FREEGG_ALLOWANCE_TRIGGER_ENDPOINT = "/api/user/self"
export const FREEGG_ALLOWANCE_RESET_TIME_ZONE = "Asia/Shanghai"

/** Match only the verified deployment, without embedded URL credentials. */
export function isFreeggUrl(value: string | undefined): boolean {
  try {
    const url = new URL(value ?? "")
    return (
      !url.username &&
      !url.password &&
      FREEGG_DAILY_ALLOWANCE_ORIGINS.includes(url.origin)
    )
  } catch {
    return false
  }
}

/** Even ordinary account reads can grant once on this verified deployment. */
export function freeggSelfRequestPolicy(baseUrl: string) {
  return isFreeggUrl(baseUrl)
    ? {
        operationSemantics: API_OPERATION_SEMANTICS.Mutation,
        credentialRecovery: undefined,
        tempWindowFallback: { codes: [], statusCodes: [] },
      }
    : {}
}
