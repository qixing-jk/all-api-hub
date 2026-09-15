import type { NewApiToken } from "~/services/apiService/newApiFamily/tokenTypes"
import { loadAccountRuntimeKeyFallbackPricingResponse } from "~/services/modelList/accountSources/runtimeKeyFallback"
import type { DisplaySiteData } from "~/types"
import { buildNewApiRuntimeKey } from "~~/tests/test-utils/accountKeyFixtures"

export const loadAccountRuntimeKeyFallbackPricingResponseFromToken = (params: {
  account: Parameters<
    typeof loadAccountRuntimeKeyFallbackPricingResponse
  >[0]["account"] &
    Partial<Pick<DisplaySiteData, "name" | "tagIds">>
  token: NewApiToken
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
    runtimeKey: buildNewApiRuntimeKey(account, {
      ...params.token,
      accountId: params.account.id,
      accountName: account.name,
    }),
    abortSignal: params.abortSignal,
  })
}
