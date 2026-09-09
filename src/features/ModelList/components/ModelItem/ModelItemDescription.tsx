import React from "react"
import { useTranslation } from "react-i18next"

import type { ModelPricing } from "~/services/modelList/pricingModel"

interface ModelItemDescriptionProps {
  model: ModelPricing
  isAvailableForUser: boolean
}

export const ModelItemDescription: React.FC<ModelItemDescriptionProps> = ({
  model,
  isAvailableForUser,
}) => {
  const { t, i18n } = useTranslation("modelList")
  const description =
    model.model_descriptions?.[i18n.language.startsWith("zh") ? "zh" : "en"] ||
    model.model_description
  if (!description) {
    return null
  }

  return (
    <div className="mb-2">
      <p
        className={`text-sm leading-relaxed ${
          isAvailableForUser
            ? "dark:text-dark-text-secondary text-gray-600"
            : "dark:text-dark-text-tertiary text-gray-400"
        } overflow-hidden`}
        style={{
          display: "-webkit-box",
          WebkitLineClamp: 2,
          WebkitBoxOrient: "vertical",
        }}
        title={description}
      >
        <span className="text-muted-foreground">{t("siteDescription")}： </span>
        {description}
      </p>
    </div>
  )
}
