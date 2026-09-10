import { createProviderJsonRequests } from "~/services/apiService/common/providerRequest"

import { decodeDoneHubResponseError } from "./responseError"

/** DoneHub JSON requests with provider-owned response decoding. */
export const doneHubRequests = createProviderJsonRequests(
  decodeDoneHubResponseError,
)
