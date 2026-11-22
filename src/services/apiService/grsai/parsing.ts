import type {
  GrsaiApiKey,
  GrsaiApiKeyList,
  GrsaiConfig,
  GrsaiDashboardData,
  GrsaiModel,
  GrsaiModelList,
  GrsaiUserInfo,
} from "~/services/apiService/grsai/type"

export { toOptionalFiniteNumber } from "~/utils/core/number"

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const toOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

/**
 * Credits the deployment sells for one US dollar at its own base (no-bonus)
 * rate, from the console's goods list: `$5 -> 333,000` and `¥10 -> 100,000`.
 * This is a historical purchase quote, not an exchange contract for existing
 * credit balances, usage, budgets, or model billing.
 */
export const GRSAI_CREDITS_PER_USD = 66_600

/**
 * The deployment's own USD-to-CNY rate, implied by the same goods list:
 * 66,600 credits per dollar against 10,000 credits per yuan.
 */
export const GRSAI_CNY_PER_USD = GRSAI_CREDITS_PER_USD / 10_000

export const isGrsaiConfig = (value: unknown): value is GrsaiConfig =>
  isRecord(value) &&
  typeof value.token === "string" &&
  typeof value.kis === "string" &&
  typeof value.ra1 === "string" &&
  typeof value.ra2 === "string" &&
  (typeof value.random === "string" || typeof value.random === "number")

export const isGrsaiUserInfo = (value: unknown): value is GrsaiUserInfo =>
  isRecord(value) && typeof value.id === "string" && value.id.trim().length > 0

export const isGrsaiDashboardData = (
  value: unknown,
): value is GrsaiDashboardData =>
  isRecord(value) &&
  ("credits" in value || "todayConsumed" in value || "totalConsumed" in value)

export const isGrsaiApiKey = (value: unknown): value is GrsaiApiKey =>
  isRecord(value) &&
  typeof value.id === "string" &&
  typeof value.key === "string" &&
  typeof value.name === "string"

export const isGrsaiApiKeyList = (value: unknown): value is GrsaiApiKeyList =>
  isRecord(value) &&
  Array.isArray(value.list) &&
  value.list.every(isGrsaiApiKey)

const isGrsaiModel = (value: unknown): value is GrsaiModel =>
  isRecord(value) &&
  typeof value.name === "string" &&
  typeof value.id === "string"

export const isGrsaiModelList = (value: unknown): value is GrsaiModelList =>
  isRecord(value) && Array.isArray(value.list) && value.list.every(isGrsaiModel)
