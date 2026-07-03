import { UI_CONSTANTS } from "~/constants/ui"
import {
  ACCOUNT_RUNTIME_KEY_SOURCES,
  accountRuntimeKeyToLegacyAccountToken,
  buildAccountTokenRuntimeKey,
  buildServiceCredentialRuntimeKey,
  type ServiceCredentialRuntimeKey,
} from "~/services/accounts/accountRuntimeKeys"
import type { KeyManagementCapability } from "~/services/apiAdapters/contracts/keyManagement"
import type {
  AccountServiceCredential,
  ServiceCredentialCapability,
} from "~/services/apiAdapters/contracts/serviceCredential"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import type { AccountToken, DisplaySiteData } from "~/types"
import { t } from "~/utils/i18n/core"

import type { KeyManagementEntry, ServiceCredentialState } from "./types"

// 构建 token 在 UI 中的唯一标识 (accountId + tokenId)，避免跨账号 tokenId 冲突
export const buildTokenIdentityKey = (accountId: string, tokenId: number) =>
  `${accountId}:${tokenId}`

export const buildAccountRuntimeKeyEntryIdentityKey = (runtimeKeyId: string) =>
  ["runtime_key", runtimeKeyId].join(":")

const buildAccountRuntimeKeyEntryIdentityPrefix = (
  source: (typeof ACCOUNT_RUNTIME_KEY_SOURCES)[keyof typeof ACCOUNT_RUNTIME_KEY_SOURCES],
  accountId: string,
) => buildAccountRuntimeKeyEntryIdentityKey(`${source}:${accountId}:`)

export interface ManagedSiteStatusCheckTargetInput {
  identityKey: string
  account: DisplaySiteData
  token: AccountToken
}

export const isManagedSiteStatusIdentityForAccount = (
  identityKey: string,
  accountId: string,
) =>
  identityKey.startsWith(`${accountId}:`) ||
  identityKey.startsWith(
    buildAccountRuntimeKeyEntryIdentityPrefix(
      ACCOUNT_RUNTIME_KEY_SOURCES.AccountToken,
      accountId,
    ),
  ) ||
  identityKey.startsWith(
    buildAccountRuntimeKeyEntryIdentityPrefix(
      ACCOUNT_RUNTIME_KEY_SOURCES.ServiceCredential,
      accountId,
    ),
  )

export const buildAccountTokenKeyManagementEntry = (
  account: DisplaySiteData,
  token: AccountToken,
): KeyManagementEntry => {
  const runtimeKey = buildAccountTokenRuntimeKey(account, token)

  return {
    id: buildAccountRuntimeKeyEntryIdentityKey(runtimeKey.id),
    runtimeKey,
    uiState: {},
  }
}

export const buildServiceCredentialKeyManagementEntry = (params: {
  account: DisplaySiteData
  serviceCredential: ServiceCredentialState | undefined
  canRotate: boolean
}): KeyManagementEntry | null => {
  const { account, serviceCredential, canRotate } = params
  if (serviceCredential?.status !== "loaded" || !serviceCredential.credential) {
    return null
  }

  const runtimeKey = buildServiceCredentialRuntimeKey(
    account,
    serviceCredential.credential,
    { canRotate },
  )

  return {
    id: buildAccountRuntimeKeyEntryIdentityKey(runtimeKey.id),
    runtimeKey,
    uiState: {
      isRotating: serviceCredential.isRotating === true,
    },
  }
}

export const toLegacyAccountTokenForKeyManagementEntry = (
  entry: Pick<KeyManagementEntry, "runtimeKey">,
): AccountToken => accountRuntimeKeyToLegacyAccountToken(entry.runtimeKey)

export const buildServiceCredentialManagedSiteStatusTarget = (
  account: DisplaySiteData,
  runtimeKey: ServiceCredentialRuntimeKey,
): ManagedSiteStatusCheckTargetInput => {
  const statusAccount = {
    ...account,
    baseUrl: runtimeKey.baseUrl,
  }

  return {
    identityKey: buildAccountRuntimeKeyEntryIdentityKey(runtimeKey.id),
    account: statusAccount,
    token: accountRuntimeKeyToLegacyAccountToken({
      ...runtimeKey,
      account: statusAccount,
    }),
  }
}

export const loadServiceCredentialKeyManagementRuntimeKey = async (params: {
  account: DisplaySiteData
  keyManagement: KeyManagementCapability | undefined
  serviceCredential: ServiceCredentialCapability | undefined
  request: ApiServiceRequest
  onBeforeFetch?: () => void
}): Promise<{
  credential: AccountServiceCredential
  runtimeKey: ServiceCredentialRuntimeKey
} | null> => {
  const { account, keyManagement, serviceCredential, request, onBeforeFetch } =
    params
  if (keyManagement || !serviceCredential) return null

  onBeforeFetch?.()
  const credential = await serviceCredential.fetch(request)
  return {
    credential,
    runtimeKey: buildServiceCredentialRuntimeKey(account, credential, {
      canRotate: typeof serviceCredential.rotate === "function",
    }),
  }
}

export const formatKey = (
  key: string,
  tokenIdentityKey: string,
  visibleKeys: Set<string>,
) => {
  if (visibleKeys.has(tokenIdentityKey)) {
    return key
  }
  if (key.length < 12) {
    return "******"
  }
  return `${key.substring(0, 8)}${"*".repeat(16)}${key.substring(
    key.length - 4,
  )}`
}

// 格式化额度
export const formatQuota = (quota: number, unlimited: boolean) => {
  if (unlimited || quota < 0) return t("keyManagement:dialog.unlimitedQuota")
  return `$${(quota / UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR).toFixed(2)}`
}
