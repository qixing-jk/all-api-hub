import { http, HttpResponse } from "msw"
import { expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createAccountSource } from "~/features/ModelList/catalog/modelManagementSources"
import { prepareModelListSource } from "~/features/ModelList/catalog/sourcePreparation"
import ModelItem from "~/features/ModelList/presentation/ModelItem"
import { calculateModelListPrices } from "~/features/ModelList/pricing/priceEvaluation"
import { dahlModelPricing } from "~/services/apiAdapters/dahl/modelPricing"
import { API_DIRECT_REQUEST_REASONS } from "~/services/apiTransport/type"
import { quoteQuotaUsage } from "~/services/modelPricing/quotaPricing"
import { AuthTypeEnum } from "~/types"
import { server } from "~~/tests/msw/server"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { render, screen } from "~~/tests/test-utils/render"

it("quotes and displays Dahl's input plus output Token deduction without turning package prices into USD charges", async () => {
  const baseUrl = "https://inference.dahl.global"
  server.use(
    http.get(`${baseUrl}/v1/models`, () =>
      HttpResponse.json({ data: [{ id: "dahl-model" }] }),
    ),
  )
  const pricing = await dahlModelPricing.fetchPricing({
    baseUrl,
    auth: { authType: AuthTypeEnum.Cookie, userId: "user" },
    directRequestReason: API_DIRECT_REQUEST_REASONS.Passive,
  })
  const prepared = prepareModelListSource({
    source: createAccountSource(
      buildDisplaySiteData({ siteType: SITE_TYPES.DAHL, baseUrl }),
    ),
    pricing,
  })
  const items = calculateModelListPrices({
    rawItems: prepared.items.map((item) => ({
      ...item,
      comparableModelIdentity: {
        key: "exact:dahl-model",
        displayName: "dahl-model",
      },
      resolvedVendor: { state: "unknown" as const },
    })),
    showRealPrice: false,
    priceComparisonWeights: {
      input: 2,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
    },
    getGroupCandidates: () => undefined,
    isPriceComparisonActive: true,
  })
  const item = items[0]!
  expect(item.calculatedPrice).toMatchObject({
    kind: "unavailable",
    quotaQuote: { status: "complete", amount: 1_000_000 },
  })
  expect(item.model.token_price_usd_per_million).toBeUndefined()
  expect(
    quoteQuotaUsage(item.model.quotaPricing!, { input: 1_000, output: 500 }),
  ).toMatchObject({
    status: "complete",
    amount: 1_500,
  })
  expect(
    quoteQuotaUsage(item.model.quotaPricing!, { input: 1_000, cacheRead: 50 }),
  ).toMatchObject({
    status: "unavailable",
    reason: "missing-rate",
  })
  render(
    <ModelItem
      {...item}
      exchangeRate={7}
      showRealPrice={false}
      showEndpointTypes={false}
    />,
  )
  expect(await screen.findAllByText("1 M Token/M")).toHaveLength(2)
  expect(screen.queryByText(/\$0\.03/)).not.toBeInTheDocument()
  expect(
    screen.getByRole("link", { name: "modelList:quotaBilling.source" }),
  ).toHaveAttribute("href", "https://inference.dahl.global/docs/tokens/")
})
