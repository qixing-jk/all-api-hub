// 格式化密钥显示
import { UI_CONSTANTS } from "~/constants/ui"
import {
  ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING,
  resolveAccountSiteCreatedTokenSecretHandling,
} from "~/services/accounts/accountSiteProfile"
import {
  hasUsableApiTokenKey,
  isMaskedApiTokenKey,
} from "~/services/apiService/common/apiKey"
import type { DisplaySiteData } from "~/types"
import { t } from "~/utils/i18n/core"

// 构建 token 在 UI 中的唯一标识 (accountId + tokenId)，避免跨账号 tokenId 冲突
export const buildTokenIdentityKey = (accountId: string, tokenId: number) =>
  `${accountId}:${tokenId}`

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

/**
 * AIHubMix may only expose the full API key secret in create responses; later
 * list/detail reads can be masked.
 *
 * Sources:
 * - https://docs.aihubmix.com/en/api/CliEndpoints/create-key
 * - https://github.com/Wei-Shaw/sub2api
 *
 * Sub2API also returns key DTOs from `/api/v1/keys`, but upstream exposes
 * list/get/create routes with the key value directly, so a create DTO is not a
 * one-time-only secret by itself.
 */
export const shouldShowOneTimeKeyDialogForAccount = (
  account: Pick<DisplaySiteData, "siteType">,
) =>
  resolveAccountSiteCreatedTokenSecretHandling(account) ===
  ACCOUNT_SITE_CREATED_TOKEN_SECRET_HANDLING.OneTimeSecretDialog

export const shouldShowOneTimeKeyDialogForCreatedToken = (
  account: Pick<DisplaySiteData, "siteType">,
  token: { key: string },
) =>
  shouldShowOneTimeKeyDialogForAccount(account) &&
  hasUsableApiTokenKey(token.key) &&
  !isMaskedApiTokenKey(token.key)
