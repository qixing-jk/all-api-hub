import type { AccountSiteType } from "~/constants/siteType"
import { formatOptionalSkPrefixSiteToken } from "~/services/accountTokens/apiTokenKey"
import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"
import type { AccountToken, ApiToken, DisplaySiteData } from "~/types"

export const ACCOUNT_RUNTIME_KEY_SOURCES = {
  AccountToken: "account_token",
  ServiceCredential: "service_credential",
} as const

type AccountRuntimeKeySource =
  (typeof ACCOUNT_RUNTIME_KEY_SOURCES)[keyof typeof ACCOUNT_RUNTIME_KEY_SOURCES]

export const ACCOUNT_RUNTIME_KEY_STATUSES = {
  Active: "active",
  Inactive: "inactive",
  Unknown: "unknown",
} as const

type AccountRuntimeKeyStatus =
  (typeof ACCOUNT_RUNTIME_KEY_STATUSES)[keyof typeof ACCOUNT_RUNTIME_KEY_STATUSES]

type AccountRuntimeKeyAccount = Pick<
  DisplaySiteData,
  | "authType"
  | "baseUrl"
  | "cookieAuthSessionCookie"
  | "id"
  | "name"
  | "siteType"
  | "tagIds"
  | "token"
  | "userId"
>

type AccountRuntimeKeyAccountSource = Omit<
  AccountRuntimeKeyAccount,
  "name" | "tagIds"
> &
  Partial<Pick<AccountRuntimeKeyAccount, "name" | "tagIds">>

type AccountRuntimeKeyCapabilities = {
  copy: boolean
  export: boolean
  verify: boolean
  fetchRuntimeModels: boolean
  rotate: boolean
  updateToken: boolean
  deleteToken: boolean
}

type AccountRuntimeKeyBase = {
  id: string
  source: AccountRuntimeKeySource
  account: AccountRuntimeKeyAccount
  accountId: string
  accountName: string
  siteType: AccountSiteType
  label: string
  secret: string
  baseUrl: string
  status: AccountRuntimeKeyStatus
  capabilities: AccountRuntimeKeyCapabilities
}

export type AccountTokenRuntimeKey = AccountRuntimeKeyBase & {
  source: typeof ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken
  tokenId: number
  token: AccountToken
}

export type ServiceCredentialRuntimeKey = AccountRuntimeKeyBase & {
  source: typeof ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential
  service: AccountServiceCredential["service"]
  credential: AccountServiceCredential
}

export type AccountRuntimeKey =
  | AccountTokenRuntimeKey
  | ServiceCredentialRuntimeKey

export const ACCOUNT_RUNTIME_KEY_LEGACY_TOKEN_ID = -1

export const buildAccountTokenRuntimeKeyId = (
  accountId: string,
  tokenId: number,
) => `${ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken}:${accountId}:${tokenId}`

export const buildServiceCredentialRuntimeKeyId = (
  accountId: string,
  service: AccountServiceCredential["service"],
) => `${ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential}:${accountId}:${service}`

export const buildAccountRuntimeKeyAccount = (
  account: AccountRuntimeKeyAccountSource,
): AccountRuntimeKeyAccount => ({
  ...account,
  name: account.name || account.id,
  tagIds: account.tagIds ?? [],
})

export const deriveServiceCredentialRuntimeKeyFields = (
  credential: AccountServiceCredential,
  fallbackBaseUrl: string,
) => ({
  secret: credential.isAuthenticated ? credential.key : "",
  baseUrl: credential.baseUrl || fallbackBaseUrl,
  status: credential.isAuthenticated
    ? ACCOUNT_RUNTIME_KEY_STATUSES.Active
    : ACCOUNT_RUNTIME_KEY_STATUSES.Inactive,
})

export const isAccountTokenRuntimeKey = (
  runtimeKey: AccountRuntimeKey,
): runtimeKey is AccountTokenRuntimeKey =>
  runtimeKey.source === ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken

export const isServiceCredentialRuntimeKey = (
  runtimeKey: AccountRuntimeKey,
): runtimeKey is ServiceCredentialRuntimeKey =>
  runtimeKey.source === ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential

export const hasUsableAccountRuntimeKeySecret = (
  runtimeKey: Pick<AccountRuntimeKey, "secret" | "status">,
) =>
  runtimeKey.status === ACCOUNT_RUNTIME_KEY_STATUSES.Active &&
  runtimeKey.secret.trim().length > 0

export const isActiveAccountRuntimeKey = (
  runtimeKey: Pick<AccountRuntimeKey, "status">,
) => runtimeKey.status === ACCOUNT_RUNTIME_KEY_STATUSES.Active

export const isSelectableAccountRuntimeKey = (runtimeKey: AccountRuntimeKey) =>
  isAccountTokenRuntimeKey(runtimeKey) ||
  hasUsableAccountRuntimeKeySecret(runtimeKey)

export const sortAccountRuntimeKeysActiveFirst = <
  TRuntimeKey extends Pick<AccountRuntimeKey, "status">,
>(
  runtimeKeys: TRuntimeKey[],
) =>
  [...runtimeKeys].sort(
    (a, b) =>
      Number(!isActiveAccountRuntimeKey(a)) -
      Number(!isActiveAccountRuntimeKey(b)),
  )

export const findDefaultSelectableAccountRuntimeKey = (
  runtimeKeys: AccountRuntimeKey[],
) =>
  runtimeKeys.find(
    (runtimeKey) =>
      isActiveAccountRuntimeKey(runtimeKey) &&
      isSelectableAccountRuntimeKey(runtimeKey),
  ) ??
  runtimeKeys.find(isAccountTokenRuntimeKey) ??
  null

const accountTokenStatusToRuntimeKeyStatus = (
  status: AccountToken["status"],
): AccountRuntimeKeyStatus => {
  if (status === 1) return ACCOUNT_RUNTIME_KEY_STATUSES.Active
  if (status === 2) return ACCOUNT_RUNTIME_KEY_STATUSES.Inactive
  return ACCOUNT_RUNTIME_KEY_STATUSES.Unknown
}

const accountRuntimeKeyStatusToLegacyTokenStatus = (
  status: AccountRuntimeKeyStatus,
): ApiToken["status"] =>
  status === ACCOUNT_RUNTIME_KEY_STATUSES.Active ? 1 : 2

const getAccountRuntimeKeyBase = (
  account: AccountRuntimeKeyAccount,
  fields: Pick<AccountRuntimeKeyBase, "id" | "label" | "secret"> & {
    baseUrl?: string
    status: AccountRuntimeKeyStatus
    capabilities: AccountRuntimeKeyCapabilities
  },
): Omit<AccountRuntimeKeyBase, "source"> => ({
  ...fields,
  account,
  accountId: account.id,
  accountName: account.name,
  siteType: account.siteType,
  baseUrl: fields.baseUrl || account.baseUrl,
})

const ACCOUNT_RUNTIME_KEY_BASE_CAPABILITIES = {
  copy: true,
  export: true,
  verify: true,
  fetchRuntimeModels: true,
} as const

export const buildAccountTokenRuntimeKey = (
  account: AccountRuntimeKeyAccount,
  token: AccountToken,
): AccountTokenRuntimeKey => ({
  ...getAccountRuntimeKeyBase(account, {
    id: buildAccountTokenRuntimeKeyId(account.id, token.id),
    label: token.name,
    secret: token.key,
    status: accountTokenStatusToRuntimeKeyStatus(token.status),
    capabilities: {
      ...ACCOUNT_RUNTIME_KEY_BASE_CAPABILITIES,
      rotate: false,
      updateToken: true,
      deleteToken: true,
    },
  }),
  source: ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
  tokenId: token.id,
  token,
})

export const buildDisplayAccountTokenRuntimeKey = (
  account: AccountRuntimeKeyAccountSource,
  token: ApiToken | AccountToken,
): AccountTokenRuntimeKey => {
  const runtimeKeyAccount = buildAccountRuntimeKeyAccount(account)
  return buildAccountTokenRuntimeKey(runtimeKeyAccount, {
    ...token,
    accountId:
      "accountId" in token && typeof token.accountId === "string"
        ? token.accountId
        : runtimeKeyAccount.id,
    accountName:
      "accountName" in token && typeof token.accountName === "string"
        ? token.accountName
        : runtimeKeyAccount.name,
  })
}

export const buildServiceCredentialRuntimeKey = (
  account: AccountRuntimeKeyAccount,
  credential: AccountServiceCredential,
  options: { canRotate?: boolean } = {},
): ServiceCredentialRuntimeKey => ({
  ...getAccountRuntimeKeyBase(account, {
    id: buildServiceCredentialRuntimeKeyId(account.id, credential.service),
    label: credential.label,
    ...deriveServiceCredentialRuntimeKeyFields(credential, account.baseUrl),
    capabilities: {
      ...ACCOUNT_RUNTIME_KEY_BASE_CAPABILITIES,
      rotate: options.canRotate === true,
      updateToken: false,
      deleteToken: false,
    },
  }),
  source: ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential,
  service: credential.service,
  credential,
})

export const accountRuntimeKeyToLegacyApiToken = (
  runtimeKey: AccountRuntimeKey,
): ApiToken => {
  if (isAccountTokenRuntimeKey(runtimeKey)) {
    return runtimeKey.token
  }

  return {
    id: ACCOUNT_RUNTIME_KEY_LEGACY_TOKEN_ID,
    user_id: 0,
    key: runtimeKey.secret,
    status: accountRuntimeKeyStatusToLegacyTokenStatus(runtimeKey.status),
    name: runtimeKey.label,
    created_time: 0,
    accessed_time: 0,
    expired_time: -1,
    remain_quota: 0,
    unlimited_quota: true,
    used_quota: 0,
    models: "",
  }
}

export const accountRuntimeKeyToLegacyAccountToken = (
  runtimeKey: AccountRuntimeKey,
): AccountToken =>
  isAccountTokenRuntimeKey(runtimeKey)
    ? runtimeKey.token
    : {
        ...accountRuntimeKeyToLegacyApiToken(runtimeKey),
        accountId: runtimeKey.accountId,
        accountName: runtimeKey.accountName,
      }

export const formatAccountRuntimeKeySecretForSite = <
  TRuntimeKey extends AccountRuntimeKey,
>(
  runtimeKey: TRuntimeKey,
): TRuntimeKey => ({
  ...runtimeKey,
  secret: formatOptionalSkPrefixSiteToken(
    accountRuntimeKeyToLegacyApiToken(runtimeKey),
    runtimeKey.siteType,
  ).key,
})

const isCollectedRuntimeKeySecret = (
  value: string | undefined,
): value is string => value !== undefined && value !== ""

export const collectAccountRuntimeKeySecrets = (
  runtimeKeys: AccountRuntimeKey[],
) => [
  ...new Set(
    runtimeKeys
      .flatMap((runtimeKey) => [
        runtimeKey.secret,
        isServiceCredentialRuntimeKey(runtimeKey)
          ? runtimeKey.credential.key
          : undefined,
        runtimeKey.account.token,
        runtimeKey.account.cookieAuthSessionCookie,
      ])
      .filter(isCollectedRuntimeKeySecret),
  ),
]
