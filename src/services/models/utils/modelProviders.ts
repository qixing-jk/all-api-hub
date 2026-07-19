type ProviderType = "Claude" | "Gemini" | "Unknown"

const PROTOCOL_COMPATIBILITY_RULES: ReadonlyArray<{
  provider: "Claude" | "Gemini"
  pattern: RegExp
}> = [
  {
    provider: "Claude",
    pattern:
      /(?:^|[^\p{L}\p{N}])(?:claude|sonnet|haiku|neptune|opus)(?:[-_.]|$)/iu,
  },
  {
    provider: "Gemini",
    pattern: /(?:^|[^\p{L}\p{N}])gemini(?:[-_.]|$)/iu,
  },
]

/** Keeps protocol-family aliases independent from publisher taxonomy. */
function identifyProtocolCompatibilityProvider(
  modelName: string,
): "Claude" | "Gemini" | null {
  return (
    PROTOCOL_COMPATIBILITY_RULES.find(({ pattern }) => pattern.test(modelName))
      ?.provider ?? null
  )
}

/** Identifies protocol compatibility for verification API defaults. */
export const identifyProvider = (modelName: string): ProviderType => {
  const protocolProvider = identifyProtocolCompatibilityProvider(modelName)
  return protocolProvider ?? "Unknown"
}
