export const UNIFIED_API_GUIDANCE_TEST_IDS = {
  currentPreviewState: "unified-api-guidance-current-preview-state",
  primaryAction: "unified-api-guidance-primary-action",
} as const

export const buildUnifiedApiGuidancePreviewScenarioTestId = (
  scenarioId: string,
) => `unified-api-guidance-preview-scenario-${scenarioId}`
