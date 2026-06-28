import { fetchSiteNotice as fetchCommonSiteNotice } from "~/services/apiService/common"
import type { ApiServiceRequest } from "~/services/apiService/common/type"

export const fetchSiteNotice = (request: ApiServiceRequest) =>
  fetchCommonSiteNotice(request)
