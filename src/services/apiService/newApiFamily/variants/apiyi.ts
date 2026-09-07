import type { UserGroupInfo } from "~/services/accountTokens/tokenProvisioningModel"
import { fetchUserInfo } from "~/services/apiService/newApiFamily/default/accountBootstrap"
import { newApiFamilyRequests } from "~/services/apiService/newApiFamily/request"
import { API_ERROR_CODES, ApiError } from "~/services/apiTransport/errors"
import { fetchAllItems } from "~/services/apiTransport/pagination"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { isRecord } from "~/utils/core/object"

/** Reads an existing management token, leaving an empty token for manual recovery. */
export async function getAccessToken(request: ApiServiceRequest) {
  // https://api.apiyi.com/account/profile (v29.8.9): System token requires
  // POST /api/user/access_token/ with a password. Never use GET /api/user/token
  // or collect that password in the extension; verification stays on the site.
  return fetchUserInfo(request)
}

/** Reads the model IDs available for APIyi token restrictions. */
export async function fetchAccountAvailableModels(
  request: ApiServiceRequest,
): Promise<string[]> {
  // https://api.apiyi.com/ (v29.8.9) exposes these model IDs here;
  // /api/user/models rejects the same authenticated account.
  return newApiFamilyRequests.data<string[]>(request, {
    endpoint: "/api/user/available_model/",
  })
}

/** Reads all selectable token groups, including those beyond the default page. */
export async function fetchUserGroups(
  request: ApiServiceRequest,
): Promise<Record<string, UserGroupInfo>> {
  // https://api.apiyi.com/token (v29.8.9) requests p=0&pageSize=1000 here;
  // /api/user/self/groups is absent. The selector displays `convert_ratio`.
  const pageSize = 1000
  const groups = await fetchAllItems<[string, UserGroupInfo]>(
    async (page) => {
      const data = await newApiFamilyRequests.data<unknown>(request, {
        endpoint: `/api/groupPro/selectable?p=${page}&pageSize=${pageSize}`,
      })
      if (!Array.isArray(data)) {
        throw new TypeError("Invalid APIyi selectable groups response")
      }
      const items = data.map((group): [string, UserGroupInfo] => {
        if (
          !isRecord(group) ||
          typeof group.name !== "string" ||
          !group.name.trim() ||
          typeof group.convert_ratio !== "number" ||
          !Number.isFinite(group.convert_ratio) ||
          group.convert_ratio < 0
        ) {
          throw new TypeError("Invalid APIyi selectable group")
        }
        return [
          group.name,
          {
            desc:
              typeof group.display_name === "string" &&
              group.display_name.trim()
                ? group.display_name
                : group.name,
            ratio: group.convert_ratio,
          },
        ]
      })
      return { items }
    },
    { startPage: 0, pageSize, requireComplete: true },
  )
  return Object.fromEntries(groups)
}

/** Preserves APIyi's model rows and their sibling pricing/group metadata. */
export async function fetchModelPricing(request: ApiServiceRequest) {
  // https://api.apiyi.com/api/pricing (v29.8.9) includes success/message/data
  // alongside group_ratio, usable_group and vendors. Payload mode would unwrap
  // data and discard those siblings, so retain and classify the whole envelope.
  const endpoint = "/api/pricing"
  const response = await newApiFamilyRequests.envelope<unknown>(request, {
    endpoint,
  })
  if (response?.success === false) {
    throw new ApiError(
      "APIyi model pricing request failed",
      undefined,
      endpoint,
      API_ERROR_CODES.BUSINESS_ERROR,
    )
  }
  return response
}
