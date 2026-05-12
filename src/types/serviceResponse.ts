import { AutoDetectError } from "~/services/accounts/utils/autoDetectUtils"
import type { ApiServiceFetchContext } from "~/services/apiService/common/type"

import type {
  ApiToken,
  AuthTypeEnum,
  CheckInConfig,
  Sub2ApiAuthConfig,
} from "./index"

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
    siteName: string
    siteType?: string
    authType?: AuthTypeEnum
    sub2apiAuth?: Sub2ApiAuthConfig
    fetchContext?: ApiServiceFetchContext
  }> {
  detailedError?: AutoDetectError // Keep for backwards compatibility
}

/**
 * Response for account save/update operations
 */
export interface AccountSaveResponse extends ServiceResponse<void> {
  accountId?: string // Present on success
  feedbackLevel?: "success" | "warning"
}

/**
 * Response for New API operations
 */
export interface AutoConfigToNewApiResponse<T = void>
  extends ServiceResponse<T> {
  token?: ApiToken // Optional, for auto-config operations
}
