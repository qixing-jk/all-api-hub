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
 * @param groupRatio 分组倍率
 * @param exchangeRate 汇率（CNY per USD）
 * @param userGroup 用户分组
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
 * 计算按次计费模型在不同调用次数下的价格
 * @param cost
 * @param factor
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
 */
export const getBillingModeText = (quotaType: number): string => {
  return isTokenBillingType(quotaType)
    ? t("ui:billing.tokenBased")
    : t("ui:billing.perCall")
}

/**
 * 获取计费模式的样式
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
 */
export const isModelAvailableForGroup = (
  model: ModelPricing,
  userGroup: string,
): boolean => {
  return model.enable_groups.includes(userGroup)
}

/**
 * 获取模型的可用端点类型显示文本
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
 * 判断是否为按量计费
 * @param quotaType
 */
export const isTokenBillingType = (quotaType: number) => {
  return quotaType === 0
}
