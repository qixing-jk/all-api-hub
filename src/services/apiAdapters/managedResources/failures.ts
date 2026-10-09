import {
  ManagedResourceError,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/managedResourceNative"

export const toManagedError = (
  error: unknown,
  mapFailure: (error: unknown) => ResourceFailure,
) => {
  if (error instanceof ManagedResourceError) return error

  let failure: ResourceFailure
  try {
    failure = mapFailure(error)
  } catch {
    throw error
  }

  return new ManagedResourceError(failure)
}

export const mapOperationFailure = async <T>(
  operation: () => T | Promise<T>,
  mapFailure: (error: unknown) => ResourceFailure,
): Promise<T> => {
  try {
    return await operation()
  } catch (error) {
    throw toManagedError(error, mapFailure)
  }
}
