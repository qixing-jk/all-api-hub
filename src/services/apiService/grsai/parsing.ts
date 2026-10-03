import { QUOTA_PER_USD } from "~/constants/money"
import type {
  GrsaiApiKey,
  GrsaiApiKeyList,
  GrsaiConfig,
  GrsaiDashboardData,
  GrsaiModel,
  GrsaiModelList,
  GrsaiUserInfo,
} from "~/services/apiService/grsai/type"

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

export const toOptionalFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

export const toOptionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined

/**
 * Credits the deployment sells for one US dollar at its own base (no-bonus)
 * rate, from the console's goods list: `$5 -> 333,000` and `¥10 -> 100,000`.
 * The account balance, today's consumption and model prices are all in credits,
 * so this is the site's own USD rate rather than an inferred one.
 */
export const GRSAI_CREDITS_PER_USD = 66_600

/**
 * The deployment's own USD-to-CNY rate, implied by the same goods list:
 * 66,600 credits per dollar against 10,000 credits per yuan.
 */
export const GRSAI_CNY_PER_USD = GRSAI_CREDITS_PER_USD / 10_000

/** Normalizes a credit amount to the product's USD-scaled quota units. */
export const creditsToQuota = (credits: number): number =>
  Math.round((credits / GRSAI_CREDITS_PER_USD) * QUOTA_PER_USD)

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
  isRecord(value) && toOptionalFiniteNumber(value.credits) !== undefined

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
