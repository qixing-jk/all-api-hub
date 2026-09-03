function formatScenarioError(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return String(error)
}

export async function collectCleanupError(
  finalizers: Array<() => Promise<void>>,
  message: string,
): Promise<unknown> {
  const errors: unknown[] = []

  for (const finalizer of finalizers) {
    try {
      await finalizer()
    } catch (error) {
      errors.push(error)
    }
  }

  if (errors.length > 1) {
    return new AggregateError(errors, message)
  }

  return errors[0]
}

export function throwScenarioError(params: {
  primaryError: unknown
  cleanupError: unknown
  message: string
}): void {
  const hasPrimaryError = params.primaryError !== undefined
  const hasCleanupError = params.cleanupError !== undefined

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

  try {
    result = await params.run()
  } catch (error) {
    primaryError = error
  }

  const cleanupError = await collectCleanupError(
    params.finalizers,
    params.cleanupMessage,
  )
  throwScenarioError({
    primaryError,
    cleanupError,
    message: params.failureMessage,
  })

  return result as TResult
}
