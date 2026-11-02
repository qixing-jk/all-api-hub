import { useTranslation } from "react-i18next"

import { PRICING_SOURCE_NOTE_KINDS as kinds } from "~/services/modelPricing/pricingConstants"
import type { PricingSourceNote } from "~/services/modelPricing/pricingSourceNotes"

/** Local explanations are translated here, independently of upstream descriptions. */
export function PricingSourceNotes({
  notes = [],
}: {
  notes?: PricingSourceNote[]
}) {
  const { t } = useTranslation("modelList")
  const text = (
    note: Exclude<PricingSourceNote, { kind: typeof kinds.ROUTING_CONTEXT }>,
  ) => {
    switch (note.kind) {
      case kinds.RULES_UNAVAILABLE:
        return t("scenario.websiteRulesUnavailable")
      case kinds.AMBIGUOUS_VARIANT_CHARGES:
        return t("pricingNotes.ambiguousVariantCharges")
      case kinds.EXCLUDED_CHARGES:
        return t("pricingNotes.excludedCharges", {
          charges: note.charges.join(", "),
        })
      case kinds.THRESHOLD_SOURCE_CONFLICT:
        return t("pricingNotes.thresholdSourceConflict")
      case kinds.THRESHOLD_BASIS_UNVERIFIED:
        return t("pricingNotes.thresholdBasisUnverified")
      case kinds.RUNTIME_DEPENDENT:
        return t("pricingNotes.runtimeDependent")
      case kinds.AMBIGUOUS_CHARGES:
        return t("pricingNotes.ambiguousCharges")
      case kinds.PROVIDER_REPORTED_ESTIMATE:
        return t("pricingNotes.providerReportedEstimate")
      case kinds.ENDPOINT_SOURCE_CONFLICT:
        return t("pricingNotes.endpointSourceConflict")
      case kinds.WHOLE_REQUEST_TIER:
        return t("pricingNotes.wholeRequestTier")
    }
  }
  const clock = (minute: number) =>
    `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`
  return (
    <>
      {notes.map((note, index) =>
        note.kind === kinds.ROUTING_CONTEXT ? (
          <div key={index} className="text-muted-foreground space-y-density-1">
            <p>
              {t("pricingNotes.routingContext", {
                route: note.routeName ?? t("pricingNotes.defaultRoute"),
                channel: note.channelName
                  ? t("pricingNotes.namedChannel", { name: note.channelName })
                  : t("pricingNotes.allChannels"),
                price: note.dedicated
                  ? t("pricingNotes.dedicatedPrices")
                  : t("pricingNotes.multiplier", { value: note.multiplier }),
              })}
            </p>
            {note.timeWindows?.map((window, windowIndex) => (
              <p key={windowIndex}>
                {t("pricingNotes.timeWindow", {
                  label: window.label,
                  start: clock(window.start),
                  end: clock(window.end),
                  input: window.input,
                  output: window.output,
                  cacheRead: window.cacheRead,
                })}
              </p>
            ))}
            {!!note.timeWindows?.length && (
              <p>{t("pricingNotes.timeWindowTimezoneUnavailable")}</p>
            )}
          </div>
        ) : (
          <p key={index} className="text-muted-foreground">
            {text(note)}
          </p>
        ),
      )}
    </>
  )
}
