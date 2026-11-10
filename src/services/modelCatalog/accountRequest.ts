import type { ModelPricingRequest } from "~/services/apiAdapters/contracts/modelPricing"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import type { DisplaySiteData } from "~/types"

/** Preserves account authentication when requesting catalog facts or enrichment. */
export function createAccountModelPricingRequest(
  account: Pick<
    DisplaySiteData,
    | "id"
    | "baseUrl"
    | "authType"
    | "userId"
    | "token"
    | "cookieAuthSessionCookie"
  >,
  abortSignal?: AbortSignal,
): ModelPricingRequest {
  return {
    directRequestReason: API_DIRECT_REQUEST_REASONS.CallerManaged,
    protectionBypassExecution: undefined,
    baseUrl: account.baseUrl,
    accountId: account.id,
    abortSignal,
    auth: {
      authType: account.authType,
      userId: account.userId,
      accessToken: account.token,
      cookie: account.cookieAuthSessionCookie,
    },
  }
}
