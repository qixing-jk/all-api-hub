/**
 * Redemption Assist Configuration
 */
export interface RedemptionAssistConfig {
  /**
   * Whether redemption assist feature is enabled
   * Default: true
   */
  enabled: boolean
}

/**
 * Default redemption assist configuration
 */
export const DEFAULT_REDEMPTION_ASSIST_CONFIG: RedemptionAssistConfig = {
  enabled: true
}

/**
 * Account candidate for redemption
 */
export interface RedemptionAccountCandidate {
  accountId: string
  name: string
  siteName: string
  baseUrl: string
}

/**
 * Redemption action types
 */
export type RedemptionAction = "auto" | "manual" | "cancel"

/**
 * Redemption result status
 */
export type RedemptionStatus = "success" | "error"

/**
 * Result of a redemption operation
 */
export interface RedemptionResult {
  status: RedemptionStatus
  message: string
  /**
   * For errors, optional site-specific error message
   */
  siteError?: string
}
