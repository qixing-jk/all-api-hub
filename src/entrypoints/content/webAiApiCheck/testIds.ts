import type { ApiVerificationProbeId } from "~/services/verification/aiApiVerification"

export const WEB_AI_API_CHECK_TEST_IDS = {
  modal: "api-check-modal",
  modelId: "api-check-model-id",
  baseUrlCandidatePrefix: "web-ai-api-check-base-url-candidate",
  apiKeyCandidatePrefix: "web-ai-api-check-api-key-candidate",
  saveToProfilesButton: "web-ai-api-check-save-to-profiles-button",
  openApiProfilesToastButton: "web-ai-api-check-open-api-profiles-toast-button",
} as const

const WEB_AI_API_CHECK_PROBE_TEST_ID_PREFIX = "api-check-probe-"

/**
 * Returns the stable test id for a rendered Web AI API check probe row.
 */
export function getWebAiApiCheckProbeTestId(probeId: ApiVerificationProbeId) {
  return `${WEB_AI_API_CHECK_PROBE_TEST_ID_PREFIX}${probeId}`
}
