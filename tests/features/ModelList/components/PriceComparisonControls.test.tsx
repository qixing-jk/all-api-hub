import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { expect, it } from "vitest"

import { PriceComparisonControls } from "~/features/ModelList/components/PriceComparisonControls"
import { PricingScenarioControls } from "~/features/ModelList/components/PricingScenarioControls"
import {
  DEFAULT_MODEL_PRICE_COMPARISON_PRESET_ID,
  DEFAULT_MODEL_PRICE_COMPARISON_WEIGHTS,
} from "~/features/ModelList/priceComparison"
import { createDefaultPricingScenario } from "~/features/ModelList/pricingScenario"
import {
  PRICING_PURPOSES,
  PRICING_RESPONSE_FORMATS,
} from "~/services/modelPricing/pricingConstants"
import { fireEvent, render, screen } from "~~/tests/test-utils/render"

function Comparison() {
  const [weights, setWeights] = useState(DEFAULT_MODEL_PRICE_COMPARISON_WEIGHTS)
  return (
    <PriceComparisonControls
      weights={weights}
      onWeightsChange={setWeights}
      presetId={DEFAULT_MODEL_PRICE_COMPARISON_PRESET_ID}
      onPresetIdChange={() => {}}
    />
  )
}
it("shows the actual comparison mix before optional numeric editing", async () => {
  const user = userEvent.setup()
  render(<Comparison />)
  expect(await screen.findByText("85%")).toBeVisible()
  expect(screen.getByText("15%")).toBeVisible()
  expect(
    screen.getByLabelText("modelList:priceComparison.weights.input"),
  ).not.toBeVisible()
  await user.click(screen.getByText("modelList:priceComparison.customize"))
  expect(
    screen.getByLabelText("modelList:priceComparison.weights.input"),
  ).toBeVisible()
  expect(
    screen.getByText("modelList:priceComparison.weightEffect"),
  ).toBeVisible()
  fireEvent.change(
    screen.getByLabelText("modelList:priceComparison.weights.input"),
    { target: { value: "15.46" } },
  )
  expect(screen.getAllByText("50%")).toHaveLength(2)
})

it("keeps active conditions visible and opens weights and tier conditions together", async () => {
  const user = userEvent.setup()
  const { container } = render(
    <PricingScenarioControls
      settings={{
        ...createDefaultPricingScenario(),
        purpose: PRICING_PURPOSES.TOKEN_INDEX,
        responseFormat: PRICING_RESPONSE_FORMATS.OPENAI,
      }}
      onChange={() => {}}
    >
      {(conditions, summary) => (
        <PriceComparisonControls
          embedded
          weights={DEFAULT_MODEL_PRICE_COMPARISON_WEIGHTS}
          onWeightsChange={() => {}}
          presetId={DEFAULT_MODEL_PRICE_COMPARISON_PRESET_ID}
          onPresetIdChange={() => {}}
          conditionFields={conditions}
          conditionSummary={summary}
        />
      )}
    </PricingScenarioControls>,
  )
  expect(
    await screen.findByText("modelList:scenario.contextSummary"),
  ).toBeVisible()
  expect(
    screen.getByText("modelList:scenario.responseFormat: OpenAI"),
  ).toBeVisible()
  expect(container.querySelectorAll("details")).toHaveLength(1)
  expect(screen.getByLabelText("modelList:scenario.input")).not.toBeVisible()
  await user.click(screen.getByText("modelList:priceComparison.customize"))
  expect(screen.getByLabelText("modelList:scenario.input")).toBeVisible()
  expect(
    screen.getByLabelText("modelList:priceComparison.weights.input"),
  ).toBeVisible()
  await user.click(screen.getByText("modelList:priceComparison.customize"))
  expect(screen.getByText("modelList:scenario.contextSummary")).toBeVisible()
})
