import type { AccountSiteType } from "~/constants/siteType"
import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  type AccountRuntimeKeyLocator,
} from "~/services/accounts/accountRuntimeKeys"
import { hasUsableApiTokenKey } from "~/services/accountTokens/apiTokenKey"
import type { ApiVerificationApiType } from "~/services/verification/aiApiVerification"

type CreatedRuntimeSecretCorrelation =
  | {
      readonly kind: "account-create"
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
    case "account-create":
      return undefined
  }
}

/** Retain a confirmed create secret when the provider has not supplied an attributable ID. */
export const createUnattributedAccountCreatedRuntimeSecret = (params: {
  accountId: string
  displayName: string
  secret: string
  credential: CreatedRuntimeSecretCredential
}): CreatedRuntimeSecret =>
  createCreatedRuntimeSecret({
    correlation: {
      kind: "account-create",
      accountId: requireNonBlankString(params.accountId, "an account id"),
    },
    displayName: params.displayName,
    secret: params.secret,
    credential: params.credential,
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
