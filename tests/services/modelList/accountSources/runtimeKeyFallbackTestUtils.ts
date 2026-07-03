import { buildAccountTokenRuntimeKey } from "~/services/accounts/accountRuntimeKeys"
import { loadAccountRuntimeKeyFallbackPricingResponse } from "~/services/modelList/accountSources/runtimeKeyFallback"
import type { ApiToken, DisplaySiteData } from "~/types"

export const loadAccountRuntimeKeyFallbackPricingResponseFromToken = (params: {
  account: Parameters<
    typeof loadAccountRuntimeKeyFallbackPricingResponse
  >[0]["account"] &
    Partial<Pick<DisplaySiteData, "name" | "tagIds">>
  token: ApiToken
  abortSignal?: AbortSignal
}) => {
  const account = {
    ...params.account,
    name:
      "name" in params.account
        ? params.account.name || params.account.id
        : params.account.id,
    tagIds: "tagIds" in params.account ? params.account.tagIds ?? [] : [],
  }

  return loadAccountRuntimeKeyFallbackPricingResponse({
    account: params.account,
    runtimeKey: buildAccountTokenRuntimeKey(account, {
      ...params.token,
      accountId: params.account.id,
      accountName: account.name,
    }),
    abortSignal: params.abortSignal,
  })
}
