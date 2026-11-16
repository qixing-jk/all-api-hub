import { useTranslation } from "react-i18next"

import { InlineMessage } from "~/components/ui"

/**
 * Informational footer reminding users about pricing variability.
 * @returns Contextual pricing guidance without a callout surface.
 */
export function Footer({
  showPricingNote = true,
}: {
  showPricingNote?: boolean
}) {
  const { t } = useTranslation("modelList")
  if (!showPricingNote) {
    return null
  }

  return (
    <InlineMessage tone="neutral" className="mt-density-8" role="note">
      <div>
        <h4 className="mb-density-1 font-medium">{t("pricingNote")}</h4>
        <p className="text-sm">{t("pricingDescription")}</p>
      </div>
    </InlineMessage>
  )
}
