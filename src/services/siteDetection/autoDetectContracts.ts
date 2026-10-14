import type {
  AUTO_DETECT_BROWSER_OUTCOMES,
  AutoDetectAnalyticsContext,
  AutoDetectErrorCode,
} from "~/constants/autoDetect"
import { type AccountSiteType } from "~/constants/siteType"
import type { ContentSessionTransientAuth } from "~/services/accountSiteOnboarding/contracts"
import type { AccountDetectionDiagnostics } from "~/services/accountSiteOnboarding/diagnostics"
import type { UserInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import type {
  ApiServiceFetchContext,
  ApiTransportBrowserFetchContext,
} from "~/services/apiTransport/type"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"
import {
  type KimiOpenPlatformAuthConfig,
  type Sub2ApiAuthConfig,
} from "~/types"
import type { TempWindowRequestSource } from "~/types/tempWindowFetch"

export type AutoDetectFetchContext = ApiServiceFetchContext

export interface AutoDetectData {
  userId: string
  user: UserInfo | Record<string, unknown>
  siteType: AccountSiteType
  accessToken?: string
  transientAuth?: ContentSessionTransientAuth
  sub2apiAuth?: Sub2ApiAuthConfig
  kimiOpenPlatformAuth?: KimiOpenPlatformAuthConfig
  fetchContext?: AutoDetectFetchContext
}

/** Success always carries account data; failure never exposes partial data. */
export type AutoDetectResult = {
  autoDetectContext?: AutoDetectAnalyticsContext
} & (
  | {
      success: true
      data: AutoDetectData
      error?: never
      errorCode?: never
    }
  | {
      success: false
      data?: never
      error?: string
      errorCode?: AutoDetectErrorCode
    }
)

/** Shared execution intent and diagnostics for one account detection request. */
export interface AutoDetectRequest {
  url: string
  protectionBypassExecution?: ProtectionBypassExecution
  diagnostics?: AccountDetectionDiagnostics
}

export interface CurrentTabAutoDetectRequest extends AutoDetectRequest {
  tabId: number
  incognito?: boolean
  cookieStoreId?: string
}

export interface BackgroundAutoDetectRequest extends AutoDetectRequest {
  fetchContext?: AutoDetectFetchContext
  currentTabMatched?: true
}

export interface ExistingTabAutoDetectRequest extends AutoDetectRequest {
  browserContext: ApiTransportBrowserFetchContext
}

export interface ApiAutoDetectRequest extends AutoDetectRequest {
  siteType: AccountSiteType
  fetchContext?: AutoDetectFetchContext
  tempWindowRequestSource?: TempWindowRequestSource
}

/** Browser exhaustion is not a terminal failure; API detection still follows it. */
export type BrowserDetectionOutcome =
  | {
      status: typeof AUTO_DETECT_BROWSER_OUTCOMES.Detected
      result: AutoDetectResult
    }
  | {
      status: typeof AUTO_DETECT_BROWSER_OUTCOMES.Exhausted
      reloadHint?: AutoDetectResult
    }
