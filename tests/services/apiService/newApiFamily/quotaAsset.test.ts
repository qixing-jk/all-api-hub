import { expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { newApiFinancialAmount } from "~/services/apiService/newApiFamily/quotaAsset"

it.each([undefined, null, SITE_TYPES.UNKNOWN])(
  "retains raw quota when the deployment type is %s",
  (siteType) => {
    expect(
      newApiFinancialAmount("500000", "https://custom.example", siteType),
    ).toMatchObject({
      asset: { kind: "quota", id: "https://custom.example:new-api-quota" },
      value: "500000",
      nativeUnitsPerAsset: undefined,
    })
  },
)

it("uses the standard USD scale for a verified New API deployment", () => {
  expect(
    newApiFinancialAmount(
      "500000",
      "https://custom.example",
      SITE_TYPES.NEW_API,
    ),
  ).toMatchObject({ asset: { kind: "currency", code: "USD" }, value: "1" })
})
