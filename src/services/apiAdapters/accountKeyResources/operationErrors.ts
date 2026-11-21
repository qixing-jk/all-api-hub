import type {
  ResourceFailure,
  ResourceFieldIssue,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  ACCOUNT_KEY_MUTATION_CERTAINTIES,
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
} from "~/services/apiAdapters/contracts/accountKeyResource"

/** A rejected baseline comparison proves that this update did not write anything. */
export const classifyResourceChangedMutation = (error: unknown) =>
  error instanceof AccountKeyResourceError &&
  error.failure.code === ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ResourceChanged
    ? ACCOUNT_KEY_MUTATION_CERTAINTIES.NotApplied
    : undefined

export const validationFailure = (
  fieldIssues?: readonly ResourceFieldIssue[],
) =>
  new AccountKeyResourceError(
    {
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
      ...(fieldIssues === undefined ? {} : { fieldIssues }),
    },
    ACCOUNT_KEY_MUTATION_CERTAINTIES.NotApplied,
  )

export const unexpectedFailure = () =>
  new AccountKeyResourceError({
    code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.Unexpected,
  })

export const toAccountKeyResourceError = (
  error: unknown,
  mapFailure: (error: unknown) => ResourceFailure,
) => {
  if (error instanceof AccountKeyResourceError) return error
  try {
    return new AccountKeyResourceError(mapFailure(error))
  } catch {
    return unexpectedFailure()
  }
}

export const mapOperation = async <T>(
  operation: () => Promise<T>,
  mapFailure: (error: unknown) => ResourceFailure,
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw toAccountKeyResourceError(error, mapFailure)
  }
}

/** A thrown mutation has no result contract proving that it is safe to replay. */
export const mapMutationOperation = async <T>(
  operation: () => Promise<T>,
  mapFailure: (error: unknown) => ResourceFailure,
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    const mapped = toAccountKeyResourceError(error, mapFailure)
    if (
      mapped.mutationCertainty === ACCOUNT_KEY_MUTATION_CERTAINTIES.NotApplied
    )
      throw mapped
    throw new AccountKeyResourceError(
      {
        ...mapped.failure,
        code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.MutationStateUncertain,
      },
      ACCOUNT_KEY_MUTATION_CERTAINTIES.PossiblyApplied,
    )
  }
}
