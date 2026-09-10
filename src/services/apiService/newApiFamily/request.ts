import { createProviderJsonRequests } from "~/services/apiService/common/providerRequest"

import { decodeNewApiResponseError } from "./responseError"

/** New API-family JSON requests with provider-owned response decoding. */
export const newApiFamilyRequests = createProviderJsonRequests(
  decodeNewApiResponseError,
)
