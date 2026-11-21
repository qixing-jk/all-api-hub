import { expect, it } from "vitest"

import { newApiQuotaAsset } from "~/services/apiService/newApiFamily/quotaAsset"
import { resolveStandardCheckinResult } from "~/services/checkin/autoCheckin/providers/newApiProtocol"
import { buildSiteAccount } from "~~/tests/test-utils/factories"

it("keeps a New API grant in the deployment's raw quota without assuming its conversion", () => {
  const account = buildSiteAccount({ site_url: "https://custom-quota.example" })
  const result = resolveStandardCheckinResult({
    account,
    message: "claimed",
    payload: {
      success: true,
      message: "claimed",
      data: { checkin_date: "2026-01-01", quota_awarded: "17.000000000000017" },
    },
  })
  expect(result?.awards).toMatchObject([
    {
      asset: { kind: "quota", ...newApiQuotaAsset(account.site_url) },
      amount: { status: "known", value: "17.000000000000017" },
    },
  ])
  expect(result?.reward).toBeUndefined()
})
