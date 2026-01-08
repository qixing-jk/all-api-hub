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
 * - `openai-compatible` includes the `/v1/models` probe because it is a common endpoint for proxies.
 * - Other API types rely on explicit model ids and skip the models probe.
 */
export function getApiVerificationProbeDefinitions(
  apiType: ApiVerificationApiType,
): ApiVerificationProbeDefinition[] {
  if (apiType === "openai-compatible") {
    return [
      { id: "models", requiresModelId: false },
      { id: "text-generation", requiresModelId: true },
      { id: "tool-calling", requiresModelId: true },
      { id: "structured-output", requiresModelId: true },
      { id: "web-search", requiresModelId: true },
    ]
  }

  return [
    { id: "text-generation", requiresModelId: true },
    { id: "tool-calling", requiresModelId: true },
    { id: "structured-output", requiresModelId: true },
    { id: "web-search", requiresModelId: true },
  ]
}
