import type { CheckInConfig } from "~/types"

/** Build a canonical persisted check-in fixture with optional V7 overrides. */
export function buildCheckInConfig(
  overrides: Partial<CheckInConfig> = {},
): CheckInConfig {
  const base: CheckInConfig = {
    automaticExecutionEnabled: false,
    methodKnowledge: { methods: {} },
    selection: { mode: "automatic" },
  }

  return {
    ...base,
    ...overrides,
    methodKnowledge: {
      ...base.methodKnowledge,
      ...overrides.methodKnowledge,
      methods: {
        ...base.methodKnowledge.methods,
        ...overrides.methodKnowledge?.methods,
      },
    },
  }
}
