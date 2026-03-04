// 格式化密钥显示
import { t } from "i18next"

import { UI_CONSTANTS } from "~/constants/ui"

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
