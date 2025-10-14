import dayjs from "dayjs"
import relativeTime from "dayjs/plugin/relativeTime"

import "dayjs/locale/zh-cn"

import { CURRENCY_SYMBOLS, UI_CONSTANTS } from "~/constants/ui"
import type {
  AccountStats,
  ApiToken,
  CurrencyType,
  DisplaySiteData,
  SortOrder
} from "~/types"

// 初始化 dayjs
dayjs.extend(relativeTime)
dayjs.locale("zh-cn")

/**
 * 格式化 Token 数量
 */
export const formatTokenCount = (count: number): string => {
  if (count >= UI_CONSTANTS.TOKEN.MILLION_THRESHOLD) {
    return (count / UI_CONSTANTS.TOKEN.MILLION_THRESHOLD).toFixed(1) + "M"
  } else if (count >= UI_CONSTANTS.TOKEN.THOUSAND_THRESHOLD) {
    return (count / UI_CONSTANTS.TOKEN.THOUSAND_THRESHOLD).toFixed(1) + "K"
  }
  return count.toString()
}

/**
 * 格式化相对时间
 */
export const formatRelativeTime = (date: Date | undefined): string => {
  if (!date) return ""
  const now = dayjs()
  const targetTime = dayjs(date)
  const diffInSeconds = now.diff(targetTime, "second")

  if (diffInSeconds < 5) {
    return "刚刚"
  }
  return targetTime.fromNow()
}

/**
 * 格式化具体时间
 */
export const formatFullTime = (date: Date | undefined): string => {
  if (!date) return ""
  return dayjs(date).format("YYYY/MM/DD HH:mm:ss")
}

/**
 * 计算总消耗
 */
export const calculateTotalConsumption = (
  stats: AccountStats,
  accounts: any[]
) => {
  const usdAmount = parseFloat(
    (
      stats.today_total_consumption /
      UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
    ).toFixed(2)
  )
  const cnyAmount = parseFloat(
    accounts
      .reduce(
        (sum, acc) =>
          sum +
          (acc.account_info.today_quota_consumption /
            UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR) *
            acc.exchange_rate,
        0
      )
      .toFixed(2)
  )

  return {
    USD: usdAmount,
    CNY: cnyAmount
  }
}

/**
 * 计算总余额
 */
export const calculateTotalBalance = (displayData: DisplaySiteData[]) => {
  return {
    USD: parseFloat(
      displayData.reduce((sum, site) => sum + site.balance.USD, 0).toFixed(2)
    ),
    CNY: parseFloat(
      displayData.reduce((sum, site) => sum + site.balance.CNY, 0).toFixed(2)
    )
  }
}

/**
 * 获取货币符号
 */
export const getCurrencySymbol = (currencyType: CurrencyType): string => {
  return CURRENCY_SYMBOLS[currencyType]
}

/**
 * 获取货币显示名称
 */
export const getCurrencyDisplayName = (currencyType: CurrencyType): string => {
  return currencyType === "USD" ? "美元" : "人民币"
}

/**
 * 获取切换后的货币类型
 */
export const getOppositeCurrency = (
  currencyType: CurrencyType
): CurrencyType => {
  return currencyType === "USD" ? "CNY" : "USD"
}

/**
 * 生成排序比较函数
 */
export const createSortComparator = <T>(field: keyof T, order: SortOrder) => {
  return (a: T, b: T): number => {
    const aValue = a[field]
    const bValue = b[field]

    if (order === "asc") {
      return aValue < bValue ? -1 : aValue > bValue ? 1 : 0
    } else {
      return aValue > bValue ? -1 : aValue < bValue ? 1 : 0
    }
  }
}

/**
 * 生成唯一ID
 */
export const generateId = (prefix = "id"): string => {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`
}

/**
 * 防抖函数
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) => {
  let timeout: NodeJS.Timeout | null = null

  return (...args: Parameters<T>) => {
    if (timeout) {
      clearTimeout(timeout)
    }
    timeout = setTimeout(() => func(...args), wait)
  }
}

/**
 * 节流函数
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): ((...args: Parameters<T>) => void) => {
  let inThrottle = false

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args)
      inThrottle = true
      setTimeout(() => (inThrottle = false), limit)
    }
  }
}

/**
 * 格式化额度显示
 */
export const formatQuota = (token: ApiToken) => {
  if (token.unlimited_quota || token.remain_quota < 0) {
    return "无限额度"
  }

  // 使用CONVERSION_FACTOR转换真实额度
  const realQuota =
    token.remain_quota / UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
  return `$${realQuota.toFixed(2)}`
}

/**
 * 格式化已用额度
 */
export const formatUsedQuota = (token: ApiToken) => {
  const realUsedQuota =
    token.used_quota / UI_CONSTANTS.EXCHANGE_RATE.CONVERSION_FACTOR
  return `$${realUsedQuota.toFixed(2)}`
}

/**
 * 格式化时间戳
 */
export const formatTimestamp = (timestamp: number) => {
  if (timestamp <= 0) return "永不过期"
  return new Date(timestamp * 1000).toLocaleDateString("zh-CN")
}

/**
 * 获取组别徽章样式
 */
export const getGroupBadgeStyle = (group: string) => {
  // 处理可能为空或未定义的 group
  const groupName = group || "default"

  // 根据组别名称生成不同的颜色主题
  const hash = groupName.split("").reduce((a, b) => {
    a = (a << 5) - a + b.charCodeAt(0)
    return a & a
  }, 0)

  const colors = [
    "bg-blue-100 text-blue-800 border-blue-200",
    "bg-green-100 text-green-800 border-green-200",
    "bg-purple-100 text-purple-800 border-purple-200",
    "bg-orange-100 text-orange-800 border-orange-200",
    "bg-pink-100 text-pink-800 border-pink-200",
    "bg-indigo-100 text-indigo-800 border-indigo-200",
    "bg-teal-100 text-teal-800 border-teal-200",
    "bg-yellow-100 text-yellow-800 border-yellow-200"
  ]

  return colors[Math.abs(hash) % colors.length]
}

/**
 * 获取状态徽章样式
 */
export const getStatusBadgeStyle = (status: number) => {
  return status === 1
    ? "bg-green-100 text-green-800 border-green-200"
    : "bg-red-100 text-red-800 border-red-200"
}
