import { createInstance } from "i18next"
import { I18nextProvider } from "react-i18next"
import { expect, it } from "vitest"

import { ModelItemDescription } from "~/features/ModelList/components/ModelItem/ModelItemDescription"
import type { ModelPricing } from "~/services/modelList/pricingModel"
import { render, screen } from "~~/tests/test-utils/render"

it.each([
  ["zh-CN", "该模型采取阶梯计费。"],
  ["zh-TW", "该模型采取阶梯计费。"],
  ["en", "The model adopts tiered pricing."],
  ["de", "The model adopts tiered pricing."],
])(
  "shows the provider's description for %s from the same cached model",
  async (language, expected) => {
    const instance = createInstance()
    await instance.init({
      lng: language,
      resources: {
        [language]: { modelList: { siteDescription: "siteDescription" } },
      },
      fallbackLng: "en",
    })
    const model: ModelPricing = {
      model_name: "qwen-flash",
      model_description: "API description",
      model_descriptions: {
        zh: "该模型采取阶梯计费。",
        en: "The model adopts tiered pricing.",
      },
      quota_type: 0,
      model_ratio: 0,
      model_price: 0,
      completion_ratio: 1,
      enable_groups: [],
      supported_endpoint_types: [],
    }
    render(
      <I18nextProvider i18n={instance}>
        <ModelItemDescription model={model} isAvailableForUser />
      </I18nextProvider>,
    )
    expect(await screen.findByText(expected)).toBeVisible()
    expect(screen.getByText(/siteDescription/)).toBeVisible()
    expect(screen.queryByText("API description")).not.toBeInTheDocument()
  },
)
