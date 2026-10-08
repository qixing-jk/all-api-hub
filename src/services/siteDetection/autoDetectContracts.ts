import {
  type AutoDetectAnalyticsContext,
  type AutoDetectErrorCode,
} from "~/constants/autoDetect"
import { type AccountSiteType } from "~/constants/siteType"
import type { ContentSessionTransientAuth } from "~/services/accountSiteOnboarding/contracts"
import type { ApiServiceFetchContext } from "~/services/apiTransport/type"
import { type Sub2ApiAuthConfig } from "~/types"

export type AutoDetectFetchContext = ApiServiceFetchContext

export interface AutoDetectResult {
  success: boolean
  autoDetectContext?: AutoDetectAnalyticsContext
  data?: {
    userId: string
    user: any
    siteType: AccountSiteType
    accessToken?: string
    transientAuth?: ContentSessionTransientAuth
    sub2apiAuth?: Sub2ApiAuthConfig
    fetchContext?: AutoDetectFetchContext
  }
  error?: string
  errorCode?: AutoDetectErrorCode
}
