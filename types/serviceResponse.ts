import type { ApiToken, CheckInConfig } from "./index"

/**
 * Auto-detect error details for backwards compatibility
 */
export interface AutoDetectError {
  type: string
  message: string
  actionText?: string
  actionUrl?: string
  helpDocUrl?: string
  details?: any
}

/**
 * Unified service response structure
 * @template T - Type of data returned on success (optional)
 */
export interface ServiceResponse<T = void> {
  success: boolean
  message: string
  data?: T
}

/**
 * Response for account validation operations
 */
export interface AccountValidationResponse
  extends ServiceResponse<{
    username: string
    accessToken: string
    userId: string
    exchangeRate: number | null
    checkIn: CheckInConfig
    siteType?: string
  }> {
  detailedError?: AutoDetectError // Keep for backwards compatibility
}

/**
 * Response for account save/update operations
 */
export interface AccountSaveResponse extends ServiceResponse<void> {
  accountId?: string // Present on success
}

/**
 * Response for New API operations
 */
export interface NewApiResponse<T = void> extends ServiceResponse<T> {
  token?: ApiToken // Optional, for auto-config operations
}
