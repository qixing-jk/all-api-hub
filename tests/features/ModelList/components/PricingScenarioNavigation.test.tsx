import { act, fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { afterEach, expect, it, vi } from "vitest"

import {
  getPricingConditionTargets,
  PricingScenarioNavigation,
  usePricingScenarioNavigation,
} from "~/features/ModelList/pricingScenarioNavigation"
import { PRICING_RANGE_AXES } from "~/services/modelPricing/pricingConstants"

afterEach(() => vi.useRealTimers())

it("routes a combined-token limit to both editable lengths", () => {
  expect(
    getPricingConditionTargets({
      requirementDetails: [
        {
          axis: "totalTokens",
          kind: "range",
          value: 110,
          ranges: [{ max: 100 }],
        },
      ],
    }),
  ).toEqual(["inputTokens", "outputTokens"])
})

it("opens, focuses and highlights multiple fields locally, and renews temporary highlighting", () => {
  vi.useFakeTimers()
  function Fields({ visible }: { visible: boolean }) {
    const navigation = usePricingScenarioNavigation()!
    return (
      <>
        <button
          onClick={() =>
            navigation.configure([
              PRICING_RANGE_AXES.INPUT_TOKENS,
              PRICING_RANGE_AXES.OUTPUT_TOKENS,
            ])
          }
        >
          Adjust
        </button>
        {visible && (
          <section ref={navigation.controlsRef}>
            <details>
              <summary>Conditions</summary>
              <details>
                <summary>Input conditions</summary>
                <input
                  aria-label="Input"
                  data-pricing-condition={PRICING_RANGE_AXES.INPUT_TOKENS}
                />
              </details>
              <details>
                <summary>Output conditions</summary>
                <input
                  aria-label="Output"
                  data-pricing-condition={PRICING_RANGE_AXES.OUTPUT_TOKENS}
                />
              </details>
              <details>
                <summary>Other conditions</summary>
                <input aria-label="Other" />
              </details>
            </details>
          </section>
        )}
      </>
    )
  }
  function Page() {
    const [visible, show] = useState(false)
    return (
      <PricingScenarioNavigation onConfigure={() => show(true)}>
        <Fields visible={visible} />
      </PricingScenarioNavigation>
    )
  }
  const url = window.location.href
  render(<Page />)
  fireEvent.click(screen.getByRole("button", { name: "Adjust" }))
  const input = screen.getByRole("textbox", { name: "Input" })
  const output = screen.getByRole("textbox", { name: "Output" })
  expect(input).toHaveFocus()
  expect(input).toBeVisible()
  expect(output).toBeVisible()
  expect(screen.getByLabelText("Other")).not.toBeVisible()
  expect(input).toHaveAttribute("data-pricing-highlight", "true")
  expect(output).toHaveAttribute("data-pricing-highlight", "true")
  act(() => vi.advanceTimersByTime(3000))
  fireEvent.click(screen.getByRole("button", { name: "Adjust" }))
  act(() => vi.advanceTimersByTime(3000))
  expect(input).toHaveAttribute("data-pricing-highlight", "true")
  act(() => vi.advanceTimersByTime(1000))
  expect(input).not.toHaveAttribute("data-pricing-highlight")
  expect(output).not.toHaveAttribute("data-pricing-highlight")
  expect(window.location.href).toBe(url)
})
