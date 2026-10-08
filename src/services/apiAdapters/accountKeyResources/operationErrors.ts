import type {
  ResourceFailure,
  ResourceFieldIssue,
} from "~/services/apiAdapters/contracts/accountKeyResource"
import {
  ACCOUNT_KEY_RESOURCE_FAILURE_CODES,
  AccountKeyResourceError,
} from "~/services/apiAdapters/contracts/accountKeyResource"

export const validationFailure = (
  fieldIssues?: readonly ResourceFieldIssue[],
) =>
  new AccountKeyResourceError(
    {
      code: ACCOUNT_KEY_RESOURCE_FAILURE_CODES.ValidationFailed,
      ...(fieldIssues === undefined ? {} : { fieldIssues }),
    },
    "not-applied",
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
