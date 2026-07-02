import { UI_CONSTANTS } from "~/constants/ui"
import type { AccountServiceCredential } from "~/services/apiAdapters/contracts/serviceCredential"
import type { AccountToken, DisplaySiteData } from "~/types"
import { t } from "~/utils/i18n/core"

import { KEY_MANAGEMENT_ENTRY_KINDS } from "./types"

// 构建 token 在 UI 中的唯一标识 (accountId + tokenId)，避免跨账号 tokenId 冲突
export const buildTokenIdentityKey = (accountId: string, tokenId: number) =>
  `${accountId}:${tokenId}`

export const buildAccountTokenEntryIdentityKey = (
  accountId: string,
  tokenId: number,
) =>
  [
    KEY_MANAGEMENT_ENTRY_KINDS.AccountToken,
    buildTokenIdentityKey(accountId, tokenId),
  ].join(":")

export const buildServiceCredentialEntryIdentityKey = (
  accountId: string,
  service: AccountServiceCredential["service"],
) =>
  [KEY_MANAGEMENT_ENTRY_KINDS.ServiceCredential, accountId, service].join(":")

const SERVICE_CREDENTIAL_TRANSIENT_TOKEN_ID = -1

export const buildServiceCredentialTransientToken = (
  account: DisplaySiteData,
  credential: AccountServiceCredential,
): AccountToken => ({
  id: SERVICE_CREDENTIAL_TRANSIENT_TOKEN_ID,
  user_id: 0,
  key: credential.key,
  status: credential.isAuthenticated ? 1 : 2,
  name: credential.label,
  created_time: 0,
  accessed_time: 0,
  expired_time: 0,
  remain_quota: 0,
  unlimited_quota: true,
  used_quota: 0,
  accountId: account.id,
  accountName: account.name,
})

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
