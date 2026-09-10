import type {
  ApiVerificationProbeId,
  ApiVerificationProbeResult,
} from "~/services/verification/aiApiVerification"

export type ApiCheckValidationError = "missing-credentials" | "missing-model"

export interface ProbeItemState {
  id: ApiVerificationProbeId
  requiresModelId: boolean
  isRunning: boolean
  attempts: number
  result: ApiVerificationProbeResult | null
}
