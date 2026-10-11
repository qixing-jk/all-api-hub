/** Display names are local metadata, not part of Dahl's server key schema. */
import { DAHL_WEB_ORIGIN } from "~/services/accountSiteDefinitions/identifiers"
import { isDahlKeyName } from "~/services/apiService/dahl/keyName"
import type { ApiServiceRequest } from "~/services/apiTransport/type"

export const isValidDahlKeyName = (value: unknown) =>
  value === undefined || isDahlKeyName(value)

/** Website localStorage is profile-local; pending edits must share that boundary. */
export function dahlKeyNameOwner(request: ApiServiceRequest): string {
  if (
    new URL(request.baseUrl).origin !== DAHL_WEB_ORIGIN ||
    typeof request.auth.userId !== "string" ||
    !request.auth.userId.trim()
  )
    throw new Error("Dahl key names require a bound console account")
  return JSON.stringify([
    DAHL_WEB_ORIGIN,
    request.auth.userId,
    Boolean(request.fetchContext?.incognito),
    request.fetchContext?.cookieStoreId ?? "",
  ])
}
