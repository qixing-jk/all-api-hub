import type { AccountSiteType } from "~/constants/siteType"
import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"
import { API_TYPES } from "~/services/verification/aiApiVerification"

type CreatedRuntimeSecretCorrelation =
  | {
      readonly kind: "legacy-create"
      readonly accountId: string
    }
  | {
      readonly kind: "account-key-resource"
      readonly ref: {
        readonly accountId: string
        readonly siteType: AccountSiteType
        readonly scopeKey: string
        readonly resourceId: string
      }
    }
  | {
      readonly kind: "account-runtime-key"
      readonly locator: AccountRuntimeKeyLocator
    }

type CreatedRuntimeSecretCredential = {
  readonly accountName: string
  readonly fallbackAccountName?: string
  readonly apiType: ApiVerificationApiType
  readonly baseUrl: string
  readonly siteType?: AccountSiteType | string
  readonly tagIds: readonly string[]
}

/** A response-only secret returned during a successful key creation mutation. */
export type CreatedRuntimeSecret = {
  readonly correlation: CreatedRuntimeSecretCorrelation
  readonly displayName: string
  readonly secret: string
  readonly secretAvailability: "create-response-only"
  readonly credential: CreatedRuntimeSecretCredential
}

type RuntimeSecretAccount = {
  id: string
  name: string
  baseUrl: string
  siteType?: AccountSiteType | string
  tagIds?: readonly string[]
}

type RuntimeSecretToken = {
  name: string
  key: string
}

const requireNonBlankString = (value: string, field: string): string => {
  const normalized = value.trim()
  if (!normalized) throw new Error(`Created runtime secret requires ${field}`)
  return normalized
}

const requireUsableSecret = (value: string): string => {
  const normalized = value.trim()
  if (!hasUsableApiTokenKey(normalized)) {
    throw new Error("Created runtime secret requires a usable secret")
  }
  return normalized
}

const createCreatedRuntimeSecret = (params: {
  correlation: CreatedRuntimeSecretCorrelation
  displayName: string
  secret: string
  credential: CreatedRuntimeSecretCredential
}): CreatedRuntimeSecret => ({
  correlation: params.correlation,
  displayName: params.displayName,
  secret: requireUsableSecret(params.secret),
  secretAvailability: "create-response-only",
  credential: params.credential,
})

const requireAccountRuntimeKeyLocator = (
  locator: AccountRuntimeKeyLocator,
): AccountRuntimeKeyLocator => {
  if (locator.source === ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource) {
    const { ref } = locator
    if (
      !ref.accountId.trim() ||
      !ref.siteType.trim() ||
      !ref.scopeKey.trim() ||
      !ref.resourceId.trim()
    ) {
      throw new Error("Created runtime secret requires a valid locator")
    }
    return locator
  }

  if (!locator.accountId.trim() || !locator.siteType.trim()) {
    throw new Error("Created runtime secret requires a valid locator")
  }
  if (
    locator.source === ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken &&
    (!Number.isSafeInteger(locator.tokenId) || locator.tokenId <= 0)
  ) {
    throw new Error("Created runtime secret requires a valid locator")
  }
  if (
    locator.source === ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential &&
    !locator.service.trim()
  ) {
    throw new Error("Created runtime secret requires a valid locator")
  }
  return locator
}

/** Returns the provider-neutral key locator observed during creation, if any. */
export const getCreatedRuntimeSecretLocator = (
  result: CreatedRuntimeSecret,
): AccountRuntimeKeyLocator | undefined => {
  switch (result.correlation.kind) {
    case "account-key-resource":
      return {
        source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountKeyResource,
        ref: result.correlation.ref,
      }
    case "account-runtime-key":
      return result.correlation.locator
    case "legacy-create":
      return undefined
  }
}

/** Builds a one-time secret with an exact account-runtime-key correlation. */
export const createAccountRuntimeKeyCreatedRuntimeSecret = ({
  locator,
  displayName,
  secret,
  credential,
}: {
  locator: AccountRuntimeKeyLocator
  displayName: string
  secret: string
  credential: CreatedRuntimeSecretCredential
}): CreatedRuntimeSecret =>
  createCreatedRuntimeSecret({
    correlation: {
      kind: "account-runtime-key",
      locator: requireAccountRuntimeKeyLocator(locator),
    },
    displayName,
    secret,
    credential,
  })

/** Builds a one-time secret from a legacy token-create response. */
export const createLegacyCreatedRuntimeSecret = ({
  account,
  token,
  apiType = API_TYPES.OPENAI_COMPATIBLE,
}: {
  account: RuntimeSecretAccount
  token: RuntimeSecretToken
  apiType?: ApiVerificationApiType
}): CreatedRuntimeSecret =>
  createCreatedRuntimeSecret({
    correlation: {
      kind: "legacy-create",
      accountId: requireNonBlankString(account.id, "an account id"),
    },
    displayName: token.name,
    secret: token.key,
    credential: {
      accountName: account.name,
      apiType,
      baseUrl: account.baseUrl,
      siteType: account.siteType,
      tagIds: account.tagIds ?? [],
    },
  })

/** Builds a one-time secret from an account-key-resource create result. */
export const createAccountKeyResourceCreatedRuntimeSecret = ({
  ref,
  displayName,
  secret,
  credential,
}: {
  ref: Extract<
    CreatedRuntimeSecretCorrelation,
    { kind: "account-key-resource" }
  >["ref"]
  displayName: string
  secret: string
  credential: CreatedRuntimeSecretCredential
}): CreatedRuntimeSecret => {
  if (
    !ref.accountId.trim() ||
    !ref.siteType.trim() ||
    !ref.scopeKey.trim() ||
    !ref.resourceId.trim()
  ) {
    throw new Error(
      "Created runtime secret requires a valid account key resource ref",
    )
  }

  return createCreatedRuntimeSecret({
    correlation: { kind: "account-key-resource", ref },
    displayName,
    secret,
    credential,
  })
}
