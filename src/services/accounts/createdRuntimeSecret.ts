import type { AccountSiteType } from "~/constants/siteType"
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
