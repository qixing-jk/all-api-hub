import type { AutoDetectFailureReason } from "~/constants/autoDetect"
import type {
  AutoDetectCompletionData,
  AutoDetectCompletionError,
  AutoDetectCompletionRequest,
} from "~/services/accounts/autoDetectCompletion/types"
import type { SiteStatusInfo } from "~/services/apiService/common/type"
import type {
  ApiServiceFetchContext,
  ApiServiceRequest,
} from "~/services/apiTransport/type"

export type AccountCompletionRuntimeContext = {
  fetchContext?: ApiServiceFetchContext
}

export type AccountCompletionServiceRequestInput = {
  baseUrl: string
  auth: ApiServiceRequest["auth"]
  context: AccountCompletionRuntimeContext
}

export type AccountCompletionAdapterRequest = AutoDetectCompletionRequest & {
  context: AccountCompletionRuntimeContext
}

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
    enableDetection: boolean
    autoCheckInEnabled: boolean
  }): AutoDetectCompletionData["checkIn"]
  handleCheckInSupportFetchFailure(error: unknown): false
}

export type AccountCompletionCapability = {
  complete(
    request: AccountCompletionAdapterRequest,
    helpers: AccountCompletionHelpers,
  ): Promise<AccountCompletionAdapterResult>
}
