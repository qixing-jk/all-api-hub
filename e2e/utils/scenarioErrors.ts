function formatScenarioError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export function throwScenarioError(params: {
  primaryError: unknown
  cleanupError: unknown
  message: string
}): void {
  if (params.primaryError && params.cleanupError) {
    throw new AggregateError(
      [params.primaryError, params.cleanupError],
      `${params.message}: primary=${formatScenarioError(params.primaryError)}; cleanup=${formatScenarioError(params.cleanupError)}`,
    )
  }

  if (params.primaryError) {
    throw params.primaryError
  }

  if (params.cleanupError) {
    throw params.cleanupError
  }
}
