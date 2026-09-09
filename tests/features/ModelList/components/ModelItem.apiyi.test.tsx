import userEvent from "@testing-library/user-event"
import { http, HttpResponse } from "msw"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { MODEL_LIST_BILLING_MODES } from "~/features/ModelList/billingModes"
import ModelItem from "~/features/ModelList/components/ModelItem"
import { useFilteredModels } from "~/features/ModelList/hooks/useFilteredModels"
import { createAccountSource } from "~/features/ModelList/modelManagementSources"
import { MODEL_LIST_SORT_MODES } from "~/features/ModelList/sortModes"
import { getSiteTypeCapabilities } from "~/services/apiAdapters/registry"
import type { PricingResponse } from "~/services/modelList/pricingModel"
import { PRICING_PURPOSES } from "~/services/modelPricing/pricingConstants"
import type { PricingScenario } from "~/services/modelPricing/pricingPlan"
import { MODEL_VENDOR_FILTER_VALUES } from "~/services/models/modelVendor"
import { AuthTypeEnum } from "~/types"
import { apiyiPricingSample } from "~~/tests/fixtures/apiyi/pricing.sample"
import { server } from "~~/tests/msw/server"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { render, screen, within } from "~~/tests/test-utils/render"

vi.mock("~/utils/browser/tempWindowFetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("~/utils/browser/tempWindowFetch")>()),
  canUseTempWindowFetch: vi.fn().mockResolvedValue(false),
}))

const account = buildDisplaySiteData({
  siteType: SITE_TYPES.APIYI,
  baseUrl: "https://api.apiyi.com",
  name: "APIyi",
  authType: AuthTypeEnum.Cookie,
})

/** Exercises the real registry, filtering, group selection, and model row. */
function ApiYiModelRow({
  pricing,
  pricingScenario,
}: {
  pricing: PricingResponse
  pricingScenario?: PricingScenario
}) {
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const { filteredModels } = useFilteredModels({
    pricingData: pricing,
    pricingScenario,
    pricingContexts: [],
    selectedSource: createAccountSource(account),
    selectedBillingMode: MODEL_LIST_BILLING_MODES.ALL,
    selectedGroups,
    searchTerm: "gpt-6-astra",
    selectedProvider: MODEL_VENDOR_FILTER_VALUES.All,
    selectedModelCapabilities: [],
    modelMetadata: [],
    sortMode: MODEL_LIST_SORT_MODES.DEFAULT,
    priceComparisonWeights: {
      input: 1,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    },
    showRealPrice: false,
  })

  return filteredModels.map((item) => (
    <ModelItem
      key={item.model.model_name}
      {...item}
      exchangeRate={7}
      showRealPrice={false}
      showEndpointTypes={true}
      showsOptimalGroup={item.hasUniquelyOptimalGroup}
      onGroupClick={(group) => setSelectedGroups([group])}
    />
  ))
}

describe("APIyi model groups and prices", () => {
  beforeEach(() => {
    server.use(
      http.get(`${account.baseUrl}/api/pricing`, () =>
        HttpResponse.json(apiyiPricingSample),
      ),
    )
  })

  it("keeps all four gpt-6-astra groups when pricing conditions are unverified or its group changes", async () => {
    const pricing = await getSiteTypeCapabilities(
      SITE_TYPES.APIYI,
    ).account!.modelPricing!.fetchPricing({
      baseUrl: account.baseUrl,
      auth: { authType: AuthTypeEnum.Cookie, userId: account.userId },
    })
    const user = userEvent.setup()
    render(<ApiYiModelRow pricing={pricing} />)

    expect(await screen.findByText("gpt-6-astra")).toBeVisible()
    expect(screen.getByText("+3")).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "modelList:expandDetails" }),
    )

    for (const label of [
      "CodexResponses (1x)",
      "CodexReverse (0.5x)",
      "default (1x)",
      "svip (1x)",
    ]) {
      for (const element of screen.getAllByText(label)) {
        expect(element).toBeVisible()
      }
    }
    await user.click(screen.getByText("CodexReverse (0.5x)"))
    // Incomplete comparisons show the published schedule in its original currency.
    expect(screen.getByText("USD: $10.0000")).toBeVisible()
    expect(screen.queryByText("USD: $5.0000")).not.toBeInTheDocument()

    await user.click(screen.getByText("default (1x)"))

    expect(screen.getByText("USD: $10.0000")).toBeVisible()
    expect(screen.getByText("+3")).toBeVisible()
    expect(screen.getByText("CodexReverse (0.5x)")).toBeVisible()
    expect(screen.getByText("svip (1x)")).toBeVisible()
  })

  it("shows both context price tiers and applies the selected group to each tier", async () => {
    const pricing = await getSiteTypeCapabilities(
      SITE_TYPES.APIYI,
    ).account!.modelPricing!.fetchPricing({
      baseUrl: account.baseUrl,
      auth: { authType: AuthTypeEnum.Cookie, userId: account.userId },
    })
    const user = userEvent.setup()
    render(
      <ApiYiModelRow
        pricing={pricing}
        pricingScenario={{
          purpose: PRICING_PURPOSES.TOKEN_INDEX,
          inputTokens: 32000,
          outputTokens: 2000,
          usage: { input: 1, output: 0, cacheRead: 0, cacheWrite: 0 },
        }}
      />,
    )

    expect(
      await screen.findByText("modelList:scenario.blendedPrice"),
    ).toBeVisible()
    await user.click(
      screen.getByRole("button", { name: "modelList:expandDetails" }),
    )

    await user.click(screen.getByText("CodexReverse (0.5x)"))
    const tiers = screen.getAllByRole("group", {
      name: "modelList:contextTokenRange",
    })
    expect(tiers).toHaveLength(2)
    expect(within(tiers[0]).getByText("USD: $5.0000")).toBeVisible()
    expect(within(tiers[0]).getByText("USD: $25.0000")).toBeVisible()
    expect(within(tiers[0]).getByText("USD: $0.5000")).toBeVisible()
    expect(within(tiers[1]).getByText("USD: $10.0000")).toBeVisible()
    expect(within(tiers[1]).getByText("USD: $37.5000")).toBeVisible()
    expect(within(tiers[1]).getByText("USD: $1.0000")).toBeVisible()

    await user.click(screen.getByText("svip (1x)"))

    const fullPriceTiers = screen.getAllByRole("group", {
      name: "modelList:contextTokenRange",
    })
    expect(within(fullPriceTiers[0]).getByText("USD: $10.0000")).toBeVisible()
    expect(within(fullPriceTiers[0]).getByText("USD: $50.0000")).toBeVisible()
    expect(within(fullPriceTiers[1]).getByText("USD: $20.0000")).toBeVisible()
    expect(within(fullPriceTiers[1]).getByText("USD: $75.0000")).toBeVisible()
    expect(within(fullPriceTiers[1]).getByText("USD: $2.0000")).toBeVisible()
  })
})
