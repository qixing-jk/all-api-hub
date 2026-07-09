import { fetchApiData } from "~/services/apiTransport/request"
import type { ApiServiceRequest } from "~/services/apiTransport/type"
import { createLogger } from "~/utils/core/logger"

const INVITE_CODE_ENDPOINT = "/api/user/aff"
const INVITE_ROUTE_PATH = "/register"
const logger = createLogger("NewApiFamilyInviteLink")

interface InviteLinkImplementation {
  fetchInviteLink: (request: ApiServiceRequest) => Promise<string>
}

export function buildInviteLink(baseUrl: string, inviteCode: string): string {
  const inviteUrl = new URL(INVITE_ROUTE_PATH, baseUrl)
  inviteUrl.searchParams.set("aff", inviteCode.trim())
  return inviteUrl.toString()
}

export const defaultInviteLinkImplementation: InviteLinkImplementation = {
  fetchInviteLink: async (request) => {
    try {
      // Verified against QuantumNous/new-api frontend: GET /api/user/aff returns
      // the affiliate code, and the registration page consumes /register?aff=.
      const inviteCode = await fetchApiData<string>(request, {
        endpoint: INVITE_CODE_ENDPOINT,
      })

      if (typeof inviteCode !== "string" || inviteCode.trim().length === 0) {
        throw new Error("invite_link_code_missing")
      }

      return buildInviteLink(request.baseUrl, inviteCode)
    } catch (error) {
      logger.error("获取邀请链接失败", error)
      throw error
    }
  },
}
