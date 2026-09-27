import type { ModelPricingRequest } from "~/services/apiAdapters/contracts/modelPricing"
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
