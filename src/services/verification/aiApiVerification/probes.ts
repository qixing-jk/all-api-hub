import type { ApiVerificationApiType, ApiVerificationProbeId } from "./types"

export type ApiVerificationProbeDefinition = {
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
    { id: "models", requiresModelId: false },
    { id: "text-generation", requiresModelId: true },
    { id: "tool-calling", requiresModelId: true },
    { id: "structured-output", requiresModelId: true },
    { id: "web-search", requiresModelId: true },
  ]
}
