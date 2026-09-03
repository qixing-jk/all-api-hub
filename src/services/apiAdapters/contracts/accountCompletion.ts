import type { AutoDetectFailureReason } from "~/constants/autoDetect"
import type { AccountAutoDetectRecoveryData } from "~/services/accounts/autoDetect/recovery"
import type {
  AutoDetectCompletionData,
  AutoDetectCompletionError,
  AutoDetectCompletionRequest,
} from "~/services/accounts/autoDetectCompletion/types"
import type { SiteStatusInfo } from "~/services/apiAdapters/contracts/accountBootstrap"
import type {
  ApiServiceFetchContext,
  ApiServiceRequest,
} from "~/services/apiTransport/type"
import type { ProtectionBypassExecution } from "~/services/protectionBypass/contracts"

export type AccountCompletionRuntimeContext = {
  cookieAuthSessionCookie?: ApiServiceRequest["cookieAuthSessionCookie"]
  fetchContext?: ApiServiceFetchContext
  protectionBypassExecution?: ProtectionBypassExecution
}

export type AccountCompletionServiceRequestInput = {
  baseUrl: string
  auth: ApiServiceRequest["auth"]
  context: AccountCompletionRuntimeContext
}

export type AccountCompletionAdapterRequest = Pick<
  AutoDetectCompletionRequest,
  "url" | "requestedAuthType" | "detected" | "autoDetectContext"
> & { context: AccountCompletionRuntimeContext }

export type AccountCompletionAdapterResult = Omit<
  AutoDetectCompletionData,
  "siteType" | "fetchContext" | "autoDetectContext"
>

export type AccountCompletionHelpers = {
  createServiceRequest(
    input: AccountCompletionServiceRequestInput,
  ): ApiServiceRequest
  fetchSiteName(siteStatus: SiteStatusInfo | null): Promise<string>
  createCompletionError(
    reason: AutoDetectFailureReason,
    cause: unknown,
  ): AutoDetectCompletionError
  trimString(value: unknown): string
  createInitialCheckInConfig(input: {
    supported: boolean
  }): AutoDetectCompletionData["checkIn"]
  handleCheckInSupportFetchFailure(error: unknown): false
  captureRecoveryData(data: AccountAutoDetectRecoveryData): void
}

export type AccountCompletionCapability = {
  complete(
    request: AccountCompletionAdapterRequest,
    helpers: AccountCompletionHelpers,
  ): Promise<AccountCompletionAdapterResult>
}
