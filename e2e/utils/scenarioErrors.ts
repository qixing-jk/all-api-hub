function formatScenarioError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

async function collectCleanupFailure(
  finalizers: Array<() => Promise<void>>,
  message: string,
): Promise<{ error: unknown; hasError: boolean }> {
  const errors: unknown[] = []

  for (const finalizer of finalizers) {
    try {
      await finalizer()
    } catch (error) {
      errors.push(error)
    }
  }

  if (errors.length > 1) {
    return {
      error: new AggregateError(errors, message),
      hasError: true,
    }
  }

  return { error: errors[0], hasError: errors.length === 1 }
}

export async function collectCleanupError(
  finalizers: Array<() => Promise<void>>,
  message: string,
): Promise<unknown> {
  return (await collectCleanupFailure(finalizers, message)).error
}

export function throwScenarioError(params: {
  primaryError: unknown
  cleanupError: unknown
  message: string
  hasPrimaryError?: boolean
  hasCleanupError?: boolean
}): void {
  const hasPrimaryError =
    params.hasPrimaryError ?? params.primaryError !== undefined
  const hasCleanupError =
    params.hasCleanupError ?? params.cleanupError !== undefined

  if (hasPrimaryError && hasCleanupError) {
    throw new AggregateError(
      [params.primaryError, params.cleanupError],
      `${params.message}: primary=${formatScenarioError(params.primaryError)}; cleanup=${formatScenarioError(params.cleanupError)}`,
    )
  }

  if (hasPrimaryError) {
    throw params.primaryError
  }

  if (hasCleanupError) {
    throw params.cleanupError
  }
}

export async function runScenarioWithCleanup<TResult>(params: {
  run: () => Promise<TResult>
  finalizers: Array<() => Promise<void>>
  cleanupMessage: string
  failureMessage: string
}): Promise<TResult> {
  let result: TResult | undefined
  let primaryError: unknown
  let hasPrimaryError = false

  try {
    result = await params.run()
  } catch (error) {
    primaryError = error
    hasPrimaryError = true
  }

  const cleanupFailure = await collectCleanupFailure(
    params.finalizers,
    params.cleanupMessage,
  )
  throwScenarioError({
    primaryError,
    cleanupError: cleanupFailure.error,
    message: params.failureMessage,
    hasPrimaryError,
    hasCleanupError: cleanupFailure.hasError,
  })

  return result as TResult
}
