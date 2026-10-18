import {
  ACCOUNT_LOGIN_METHODS,
  isAccountLoginProvider,
} from "~/constants/accountLogin"
import { normalizePasswordCredentials } from "~/services/accountLogin/passwordCredentials"
import type { SiteAccount } from "~/types"
import type { AccountLoginConfiguration } from "~/types/accountLogin"
import { isRecord } from "~/utils/core/object"

/** Normalizes adapter-owned method IDs without inventing a default login. */
export function normalizeAccountLogin(
  value: unknown,
): AccountLoginConfiguration | undefined {
  if (
    !isRecord(value) ||
    typeof value.methodId !== "string" ||
    !value.methodId.trim()
  )
    return undefined
  const methodId = value.methodId.trim()
  const credentials =
    methodId === ACCOUNT_LOGIN_METHODS.Password
      ? normalizePasswordCredentials(value.credentials)
      : undefined
  return { methodId, ...(credentials ? { credentials } : {}) }
}

/** Read compatibility for released check-in settings and the first password schema. */
export function resolveAccountLogin(
  account: Partial<Pick<SiteAccount, "login" | "checkIn" | "passwordAuth">>,
): AccountLoginConfiguration | undefined {
  if (Object.prototype.hasOwnProperty.call(account, "login"))
    return normalizeAccountLogin(account.login)
  const methodId = account.checkIn?.loginCheckIn?.provider
  return normalizeAccountLogin(
    methodId === ACCOUNT_LOGIN_METHODS.Password ||
      isAccountLoginProvider(methodId)
      ? { methodId, credentials: account.passwordAuth }
      : undefined,
  )
}
