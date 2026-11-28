import type { ProductAnalyticsErrorCategory } from "~/services/productAnalytics/contracts"

export const REDEMPTION_PROMPT_ACTIONS = {
  Auto: "auto",
  Cancel: "cancel",
} as const

export type RedemptionPromptAction =
  (typeof REDEMPTION_PROMPT_ACTIONS)[keyof typeof REDEMPTION_PROMPT_ACTIONS]

export interface RedemptionPromptResult {
  action: RedemptionPromptAction
  selectedCodes: string[]
}

export interface RedemptionPromptCodeItem {
  code: string
  preview: string
}

export interface RedemptionBatchResultItem {
  code: string
  preview: string
  success: boolean
  message: string
  retryable?: boolean
  outcomeUncertain?: boolean
  errorMessage?: string
  analyticsErrorCategory?: ProductAnalyticsErrorCategory
}
