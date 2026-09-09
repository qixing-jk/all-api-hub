import { render, screen } from "@testing-library/react"
import { expect, it, vi } from "vitest"

import { PricingConditionDetails } from "~/features/ModelList/components/PricingConditionDetails"
import zh from "~/locales/zh-CN/modelList.json"
import {
  PRICING_CONDITION_KINDS,
  PRICING_IMAGE_SIZES,
  PRICING_ISSUE_CODES,
  PRICING_MEASUREMENT_AXES,
  PRICING_METERS,
  PRICING_SELECTION_AXES,
  PRICING_VIDEO_INPUTS,
} from "~/services/modelPricing/pricingConstants"

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values: Record<string, string> = {}) => {
      const template = key
        .split(".")
        .reduce<unknown>(
          (value, part) => (value as Record<string, unknown>)[part],
          zh,
        ) as string
      return template.replace(/\{\{(\w+)\}\}/g, (_, name) => values[name] ?? "")
    },
  }),
}))

it("explains unsupported resolution with the current choice and published alternatives", () => {
  render(
    <PricingConditionDetails
      details={[
        {
          axis: PRICING_SELECTION_AXES.VIDEO_QUALITY,
          selected: "4K",
          available: ["720p", "1080p"],
        },
      ]}
    />,
  )
  expect(
    screen.getByText(
      /当前选择 4k 不在此模型已公布的档位中。可选：720p \/ 1080p/,
    ),
  ).toBeVisible()
})

it("names missing selection fields rather than billing meters", () => {
  render(
    <PricingConditionDetails
      details={[
        {
          axis: PRICING_SELECTION_AXES.IMAGE_SIZE,
          available: [
            PRICING_IMAGE_SIZES.K1,
            PRICING_IMAGE_SIZES.K2,
            PRICING_IMAGE_SIZES.K4,
          ],
        },
        {
          axis: PRICING_SELECTION_AXES.VIDEO_INPUT,
          available: [
            PRICING_VIDEO_INPUTS.WITHOUT_VIDEO,
            PRICING_VIDEO_INPUTS.WITH_VIDEO,
          ],
        },
      ]}
    />,
  )
  expect(
    screen.getByText(/尚未选择。此模型已公布的选项：1K \/ 2K \/ 4K/),
  ).toBeVisible()
  expect(
    screen.getByText(
      new RegExp(zh.scenario.withoutVideo + " / " + zh.scenario.withVideo),
    ),
  ).toBeVisible()
  expect(
    screen.queryByText(/condition-missing|videoOutput/),
  ).not.toBeInTheDocument()
})

it("shows actual numeric values, units and strict range boundaries", () => {
  render(
    <PricingConditionDetails
      details={[]}
      requirements={[
        {
          axis: PRICING_METERS.VIDEO_SECONDS,
          kind: "quantity",
          value: 0,
          ranges: [{ min: 0, minExclusive: true }],
        },
        {
          axis: PRICING_MEASUREMENT_AXES.IMAGE_MEGAPIXELS,
          kind: PRICING_CONDITION_KINDS.RANGE,
          value: 5,
          ranges: [{ min: 1, minExclusive: true, max: 4 }],
        },
      ]}
    />,
  )
  expect(
    screen.getByText(/当前值 0。请填写有效数值；已知范围：> 0/),
  ).toHaveTextContent("秒")
  expect(
    screen.getByText(/当前值 5。请填写有效数值；已知范围：> 1, ≤ 4/),
  ).toBeVisible()
})

it.each([
  [
    PRICING_ISSUE_CODES.SOURCE_UNAVAILABLE,
    zh.scenario.pricingSourceUnavailable,
  ],
  [PRICING_ISSUE_CODES.PRICE_UNAVAILABLE, zh.scenario.fixedPriceUnavailable],
  [PRICING_ISSUE_CODES.OUTPUT_TOKEN_MIX, zh.scenario.outputTokenMix],
])("explains %s without suggesting a missing setting", (code, message) => {
  render(
    <PricingConditionDetails details={undefined} issues={[{ code }]} actions />,
  )
  expect(screen.getByText(message)).toBeVisible()
  expect(screen.queryByRole("button")).not.toBeInTheDocument()
})
