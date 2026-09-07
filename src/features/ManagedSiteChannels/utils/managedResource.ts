import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
  type ManagedResourceWorkspace,
  type ResourceFailure,
} from "~/services/apiAdapters/contracts/managedResourceNative"

/** Keeps adapter failures while hiding unknown implementation errors. */
export const toSafeManagedResourceFailure = (
  error: unknown,
): ResourceFailure =>
  error instanceof ManagedResourceError
    ? error.failure
    : { code: MANAGED_RESOURCE_FAILURE_CODES.Unexpected }

export const EMPTY_MANAGED_RESOURCE_CAPABILITIES = Object.freeze({
  canSearch: false,
  canCreate: false,
  canUpdate: false,
  canDelete: false,
}) satisfies ManagedResourceWorkspace["capabilities"]
