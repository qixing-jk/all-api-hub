import type {
  NewApiTokenCapabilities,
  NewApiTokenVerification,
} from "~/services/apiService/newApiFamily/accessTokens/creation"
import {
  NEW_API_TOKEN_VERIFICATION_METHODS as METHODS,
  NEW_API_TOKEN_VALIDATION_STATUSES as VALIDATION_STATUSES,
} from "~/services/apiService/newApiFamily/accessTokens/protocol"

type Method = NewApiTokenVerification["method"]
type Verification = NewApiTokenCapabilities["verification"]

export const NEW_API_TOKEN_RECOVERY_REASONS = {
  MISSING: "missing",
  INVALID: VALIDATION_STATUSES.INVALID,
  IDENTITY_MISMATCH: VALIDATION_STATUSES.IDENTITY_MISMATCH,
} as const

export type NewApiTokenRecoveryReason =
  (typeof NEW_API_TOKEN_RECOVERY_REASONS)[keyof typeof NEW_API_TOKEN_RECOVERY_REASONS]

export const DEFAULT_TOKEN_VERIFICATION_INPUT: {
  method: Method
  secret: string
} = {
  method: METHODS.PASSWORD,
  secret: "",
}

const supportedMethods = Object.values(METHODS)

/** Resolves only the methods the extension can complete. */
function getSupportedTokenMethod(method: string): Method | undefined {
  return supportedMethods.find((supported) => supported === method)
}

/** Resolve advertised methods once for both factor selection and submission. */
export function describeTokenMethods(verification: Verification) {
  return verification.methods.map((option) => {
    const kind = getSupportedTokenMethod(option.method)
    return {
      ...option,
      kind,
      canVerify:
        option.available &&
        kind !== undefined &&
        (kind !== METHODS.OAUTH || verification.oauth_providers.length > 0),
    }
  })
}

/** Checks whether the selected factor has its required user input. */
export function hasVerificationInput(
  method: Method,
  secret: string,
  provider: string,
) {
  if (method === METHODS.PASSWORD || method === METHODS.TWO_FACTOR)
    return Boolean(secret)
  return method !== METHODS.OAUTH || Boolean(provider)
}

/** Builds the request payload for the selected factor. */
export function buildVerificationInput(
  method: Method,
  secret: string,
  provider: string,
): NewApiTokenVerification {
  switch (method) {
    case METHODS.PASSWORD:
      return { method, password: secret }
    case METHODS.TWO_FACTOR:
      return { method, code: secret }
    case METHODS.OAUTH:
      return { method, provider }
    case METHODS.PASSKEY:
      return { method }
  }
}

/** Lists verification methods that can complete with this site's options. */
export function availableTokenMethods(verification: Verification) {
  return describeTokenMethods(verification).flatMap(({ canVerify, kind }) =>
    canVerify && kind ? [kind] : [],
  )
}
