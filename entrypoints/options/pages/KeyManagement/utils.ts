// 格式化密钥显示
import { t } from "i18next"

import { UI_CONSTANTS } from "~/constants/ui"

export const formatKey = (
  key: string,
  tokenId: number,
  visibleKeys: Set<number>,
) => {
  if (visibleKeys.has(tokenId)) {
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
