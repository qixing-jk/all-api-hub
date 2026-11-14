import type { VerificationProgressCallback } from "~/services/verification/aiApiVerification/generationProgress"
import type {
  ApiVerificationApiType,
  ApiVerificationMode,
  ApiVerificationRequestProfile,
} from "~/services/verification/aiApiVerification/types"
import type {
  PelicanExecutionMode,
  PelicanTestResult,
} from "~/services/verification/modelQuality/pelican"

export type VerificationToolRequestParams = {
  baseUrl: string
  apiKey: string
  apiType: ApiVerificationApiType
  modelId: string
  mode: ApiVerificationMode
  requestProfile: ApiVerificationRequestProfile
  requestProfileEnhanced: boolean
  /** Request overrides the credential carries; sent, and redacted from errors. */
  requestHeaders?: Record<string, string>
  /** Secret values to redact from error text. */
  secrets: string[]
}

/** Executes one drawing test; injectable so a content script can delegate it. */
export type PelicanRunner = (
  params: VerificationToolRequestParams & {
    prompt?: string
    onProgress?: VerificationProgressCallback
    executionMode?: PelicanExecutionMode
    abortSignal: AbortSignal
  },
) => Promise<PelicanTestResult>
