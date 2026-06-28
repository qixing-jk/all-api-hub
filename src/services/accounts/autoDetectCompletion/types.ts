import type {
  AutoDetectAnalyticsContext,
  AutoDetectFailureReason,
} from "~/constants/autoDetect"
import type { AccountSiteType } from "~/constants/siteType"
import type { ApiServiceFetchContext } from "~/services/apiTransport/type"
import type { AuthTypeEnum, CheckInConfig, Sub2ApiAuthConfig } from "~/types"
import { getErrorMessage } from "~/utils/core/error"

export interface DetectedAccountIdentity {
  userId: string
  user?: {
    id?: string | number
    username?: string
  }
  siteType: AccountSiteType
  accessToken?: string
  sub2apiAuth?: Sub2ApiAuthConfig
  fetchContext?: ApiServiceFetchContext
}

export interface AutoDetectCompletionRequest {
  url: string
  requestedAuthType: AuthTypeEnum
  detected: DetectedAccountIdentity
  autoDetectContext?: AutoDetectAnalyticsContext
}

export interface AutoDetectCompletionData {
  username: string
  siteName: string
  accessToken: string
  userId: string
  exchangeRate: number | null
  authType: AuthTypeEnum
  checkIn: CheckInConfig
  siteType: AccountSiteType
  sub2apiAuth?: Sub2ApiAuthConfig
  fetchContext?: ApiServiceFetchContext
  autoDetectContext?: AutoDetectAnalyticsContext
}

export class AutoDetectCompletionError extends Error {
  readonly name = "AutoDetectCompletionError"
  readonly cause: unknown

  constructor(
    readonly reason: AutoDetectFailureReason,
    cause: unknown,
  ) {
    super(getErrorMessage(cause))
    this.cause = cause
  }
}
