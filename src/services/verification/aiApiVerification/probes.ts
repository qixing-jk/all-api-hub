import {
  API_VERIFICATION_PROBE_IDS,
  type ApiVerificationApiType,
  type ApiVerificationProbeId,
} from "./types"

type ApiVerificationProbeDefinition = {
  /**
   * Stable identifier used for execution and i18n lookup.
   */
  id: ApiVerificationProbeId
  /**
   * Whether this probe requires a model id to execute.
   */
  requiresModelId: boolean
}

/**
 * Return the ordered probe list for a given API type.
 *
 * Notes:
 * - The suite runs `models` first so it can suggest a model id when none is provided.
 */
export function getApiVerificationProbeDefinitions(
  _apiType: ApiVerificationApiType,
): ApiVerificationProbeDefinition[] {
  return [
    { id: API_VERIFICATION_PROBE_IDS.Models, requiresModelId: false },
    { id: API_VERIFICATION_PROBE_IDS.TextGeneration, requiresModelId: true },
    { id: API_VERIFICATION_PROBE_IDS.ToolCalling, requiresModelId: true },
    { id: API_VERIFICATION_PROBE_IDS.StructuredOutput, requiresModelId: true },
    { id: API_VERIFICATION_PROBE_IDS.WebSearch, requiresModelId: true },
  ]
}
