/**
 * 模型定价计算工具
 */

import { t } from "i18next"

import type { ModelPricing } from "~/services/apiService/common/type"
import type { CurrencyType } from "~/types"

export interface CalculatedPrice {
  inputUSD: number // 每1M token输入价格（美元）
  outputUSD: number // 每1M token输出价格（美元）
  inputCNY: number // 每1M token输入价格（人民币）
  outputCNY: number // 每1M token输出价格（人民币）
  perCallPrice?: PerCallPrice // 按次计费时每次调用的价格
}

export type PerCallPrice = number | { input: number; output: number }

/**
 * 计算模型价格
 * @param model 模型定价信息
 * @param groupRatio 分组倍率映射表
 * @param exchangeRate 汇率（CNY per USD）
 * @param userGroup 用户分组标识，用于匹配 groupRatio
 * 原理 https://github.com/QuantumNous/new-api/blob/7437b671efb6b994eae3d8d721e3cbe215e5abc9/web/src/helpers/utils.jsx#L595
 */
export const calculateModelPrice = (
  model: ModelPricing,
  groupRatio: Record<string, number>,
  exchangeRate: number,
  userGroup: string = "default",
): CalculatedPrice => {
  // 获取用户分组的倍率，默认为1
  const groupMultiplier = groupRatio[userGroup] || 1

  if (isTokenBillingType(model.quota_type)) {
    // 按量计费
    // inputUSD（每 1M token） = model_ratio × 2 × groupRatio
    // complUSD（每 1M token） = model_ratio × completion_ratio × 2 × groupRatio
    const inputUSD = model.model_ratio * 2 * groupMultiplier
    const outputUSD =
      model.model_ratio * model.completion_ratio * 2 * groupMultiplier

    return {
      inputUSD,
      outputUSD,
      inputCNY: inputUSD * exchangeRate,
      outputCNY: outputUSD * exchangeRate,
    }
  } else {
    // 按次计费
    const perCallPrice = calculateModelPerCallPrice(
      model.model_price,
      groupMultiplier,
    )

    return {
      inputUSD: 0,
      outputUSD: 0,
      inputCNY: 0,
      outputCNY: 0,
      perCallPrice,
    }
  }
}
// todo: 考虑其他站点的计算方式
// https://github.com/deanxv/done-hub/blob/6f332c162175de3333477c03faaa65d0d902f8ab/web/src/views/Pricing/component/util.js#L13
const DONE_HUB_TOKEN_TO_CALL_RATIO = 0.002

/**
 * Calculates per-call pricing for models that charge per request rather than per token.
 * @param cost Raw per-call definition from the API (number or separate input/output).
 * @param factor Group multiplier applied before converting to DONE HUB ratios.
 * @returns Normalized per-call price data aligned with the UI expectations.
 */
const calculateModelPerCallPrice = (
  cost: PerCallPrice,
  factor: number,
): PerCallPrice => {
  if (typeof cost === "number") {
    return cost * factor
  }
  return {
    input: cost.input * factor * DONE_HUB_TOKEN_TO_CALL_RATIO,
    output: cost.output * factor * DONE_HUB_TOKEN_TO_CALL_RATIO,
  }
}

/**
 * 格式化价格显示
 * @param price 需要展示的价格
 * @param currency 货币类型，用于决定符号
 * @param precision 小数位数
 */
export const formatPrice = (
  price: number,
  currency: CurrencyType = "USD",
  precision: number = 4,
): string => {
  const symbol = currency === "USD" ? "$" : "¥"

  if (price === 0) return `${symbol}0`

  if (price < 0.0001) {
    return `${symbol}${price.toExponential(2)}`
  }

  return `${symbol}${price.toFixed(precision)}`
}

/**
 * 格式化价格显示 - 简洁格式
 * @param price 需要展示的价格
 * @param currency 货币类型，用于决定符号
 */
export const formatPriceCompact = (
  price: number,
  currency: CurrencyType = "USD",
): string => {
  const symbol = currency === "USD" ? "$" : "¥"

  if (price === 0) return `${symbol}0`

  if (price < 0.01) {
    return `${symbol}${price.toFixed(6)}`
  } else if (price < 1) {
    return `${symbol}${price.toFixed(4)}`
  } else {
    return `${symbol}${price.toFixed(2)}`
  }
}

/**
 * 格式化价格区间显示（输入-输出）
 * @param inputPrice 输入价格
 * @param outputPrice 输出价格
 * @param currency 货币类型
 * @param precision 小数位数
 */
export const formatPriceRange = (
  inputPrice: number,
  outputPrice: number,
  currency: CurrencyType = "USD",
  precision: number = 4,
): string => {
  const formattedInput = formatPrice(inputPrice, currency, precision)
  const formattedOutput = formatPrice(outputPrice, currency, precision)

  if (inputPrice === outputPrice) {
    return formattedInput
  }

  return `${formattedInput} ~ ${formattedOutput}`
}

/**
 * 获取计费模式的显示文本
 * @param quotaType 后端返回的计费模式类型
 */
export const getBillingModeText = (quotaType: number): string => {
  return isTokenBillingType(quotaType)
    ? t("ui:billing.tokenBased")
    : t("ui:billing.perCall")
}

/**
 * 获取计费模式的样式
 * @param quotaType 后端返回的计费模式类型
 */
export const getBillingModeStyle = (
  quotaType: number,
): { color: string; bgColor: string } => {
  return isTokenBillingType(quotaType)
    ? { color: "text-blue-600", bgColor: "bg-blue-50" }
    : { color: "text-purple-600", bgColor: "bg-purple-50" }
}

/**
 * 检查模型是否对指定分组可用
 * @param model 模型定价数据
 * @param userGroup 用户分组标识
 */
export const isModelAvailableForGroup = (
  model: ModelPricing,
  userGroup: string,
): boolean => {
  return model.enable_groups.includes(userGroup)
}

/**
 * 获取模型的可用端点类型显示文本
 * @param endpointTypes 支持的端点类型列表
 */
export const getEndpointTypesText = (
  endpointTypes: string[] | undefined,
): string => {
  if (!endpointTypes || !Array.isArray(endpointTypes)) {
    return t("ui:billing.notProvided")
  }
  return endpointTypes.join(", ")
}

/**
 * Determines whether a quota type represents token-based pricing.
 * @param quotaType Backend quota type enumerator.
 * @returns True for token-based billing, false for per-call plans.
 */
export const isTokenBillingType = (quotaType: number) => {
  return quotaType === 0
}
