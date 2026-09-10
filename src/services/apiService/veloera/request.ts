import { createProviderJsonRequests } from "~/services/apiService/common/providerRequest"

import { decodeVeloeraResponseError } from "./responseError"

/** Veloera JSON requests with provider-owned response decoding. */
export const veloeraRequests = createProviderJsonRequests(
  decodeVeloeraResponseError,
)
