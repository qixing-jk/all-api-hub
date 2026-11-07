import {
  ACCOUNT_LOGIN_CONFIGURATION_KINDS,
  ACCOUNT_LOGIN_METHODS,
  isAccountLoginProvider,
} from "~/constants/accountLogin"
import { normalizePasswordCredentials } from "~/services/accountLogin/passwordCredentials"
import type { AccountLoginMethodDefinition } from "~/services/apiAdapters/contracts/accountLogin"
import type { SiteAccount } from "~/types"
import type { AccountLoginConfiguration } from "~/types/accountLogin"
import { isRecord } from "~/utils/core/object"

/** Whether the account-owned login has enough information to run. */
export function isAccountLoginConfigured(
  login: AccountLoginConfiguration | undefined,
  methods: readonly AccountLoginMethodDefinition[],
): boolean {
  const method = methods.find((candidate) => candidate.id === login?.methodId)
  return Boolean(
    login &&
      method &&
      (method.configuration.kind === ACCOUNT_LOGIN_CONFIGURATION_KINDS.Password
        ? normalizePasswordCredentials(login.credentials)
        : true),
  )
}

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
  // The adapter owns the method ID; normalization only owns the persisted input shape.
  const credentials = normalizePasswordCredentials(value.credentials)
  return {
    methodId,
    ...(credentials ? { credentials } : {}),
    ...(typeof value.automaticRecovery === "boolean"
      ? { automaticRecovery: value.automaticRecovery }
      : {}),
  }
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
      ? {
          methodId,
          ...(methodId === ACCOUNT_LOGIN_METHODS.Password
            ? { credentials: account.passwordAuth }
            : {}),
        }
      : undefined,
  )
}
