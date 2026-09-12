import {
  MANAGED_RESOURCE_FAILURE_CODES,
  ManagedResourceError,
} from "~/services/apiAdapters/contracts/managedResourceNative"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"

/** Normalize only the known missing-row response from a channel detail read. */
export function rethrowNewApiFamilyChannelReadError(error: unknown): never {
  // These controllers return GORM's missing-row error in an HTTP 200 business envelope.
  // https://github.com/QuantumNous/new-api/blob/main/controller/channel.go (GetChannel)
  // https://github.com/Veloera/Veloera/blob/6525dfce816beaa270e78f0d8b762e19e54d13b8/controller/channel.go (GetChannel)
  // https://github.com/deanxv/done-hub/blob/6a9bc7f5700fd7b7093b08b7c144ecde872e2735/controller/channel.go (GetChannel)
  if (
    error instanceof ApiError &&
    error.code === API_ERROR_CODES.BUSINESS_ERROR &&
    error.message === "record not found"
  ) {
    throw new ManagedResourceError({
      code: MANAGED_RESOURCE_FAILURE_CODES.NotFound,
    })
  }
  throw error
}
