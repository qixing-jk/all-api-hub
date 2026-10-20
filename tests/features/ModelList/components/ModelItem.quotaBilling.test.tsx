import { expect, it } from "vitest"

import { SITE_TYPES } from "~/constants/siteType"
import { createAccountSource } from "~/features/ModelList/catalog/modelManagementSources"
import { MODEL_GROUP_ACCESS_STATES } from "~/features/ModelList/groups/groupContext"
import ModelItem from "~/features/ModelList/presentation/ModelItem"
import { EMRANK_TOKEN_ASSET } from "~/services/apiService/emrank/constants"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import {
  QUOTA_COMPARISON_SCOPES,
  QUOTA_ROUNDING_MODES,
} from "~/services/modelPricing/quotaPricing"
import { calculateModelPrice } from "~/services/models/utils/modelPricing"
import { buildDisplaySiteData } from "~~/tests/test-utils/factories"
import { render, screen } from "~~/tests/test-utils/render"

it("shows token-based billing for native quota models alongside their native rates", async () => {
  const model: ModelPricing = {
    model_name: "example/embedding",
    quota_type: 0,
    model_ratio: 0,
    model_price: 0,
    completion_ratio: 1,
    enable_groups: [],
    supported_endpoint_types: ["/v1/embeddings"],
    quotaPricing: {
      unit: EMRANK_TOKEN_ASSET,
      rates: { input: { amount: 3, per: 1 }, output: { amount: 0, per: 1 } },
      adjustments: [],
      comparisonScope: QUOTA_COMPARISON_SCOPES.Source,
      rounding: QUOTA_ROUNDING_MODES.Floor,
      sourceUrl: "https://example.test/billing",
    },
  }
  render(
    <ModelItem
      model={model}
      calculatedPrice={calculateModelPrice(model, 1)}
      resolvedVendor={{ state: "unknown" }}
      source={createAccountSource(
        buildDisplaySiteData({ siteType: SITE_TYPES.EMRANK }),
      )}
      exchangeRate={7}
      showRealPrice={false}
      showEndpointTypes={false}
      groupRatios={{}}
      groupContext={{
        accessState: MODEL_GROUP_ACCESS_STATES.NOT_APPLICABLE,
        supportedGroups: [],
        usableGroups: [],
        priceableGroups: [],
      }}
      activeGroupContext={{
        activeUsableGroups: [],
        activePriceableGroups: [],
        actionGroups: [],
      }}
    />,
  )

  expect(await screen.findByText("3 M Token/M")).toBeVisible()
  expect(screen.getByText("ui:billing.tokenBased")).toBeVisible()
  expect(screen.getByText("0 M Token/M")).toBeVisible()
})
